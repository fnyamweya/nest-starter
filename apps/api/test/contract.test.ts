import express from "express";
import request from "supertest";
import { createRequire } from "module";
import { describe, it, expect, beforeEach } from "vitest";
import type { Env } from "@civis/platform/config";
import type { ResourceModule } from "@civis/http-contracts";
import { Ok, Err } from "@civis/kernel/types";
import { z } from "zod";
import { requestContextMiddleware } from "../src/middleware/request-context.js";
import { authMiddleware } from "../src/middleware/auth.js";
import { mountResource } from "../src/routing/mount-resource.js";

class InMemoryRateLimiter {
  private readonly counts = new Map<string, number>();
  async check(policy: any, routeId: string, ctx: any, ipHash: string) {
    if (policy.mode === "none") {
      return Object.freeze({ allowed: true, remaining: Number.MAX_SAFE_INTEGER, resetSeconds: 0 });
    }
    const key = policy.mode === "ip"
      ? `rl:ip:${ctx.tenantId}:${ipHash}:${routeId}`
      : `rl:actor:${ctx.tenantId}:${ctx.actor.id}:${routeId}`;
    const current = (this.counts.get(key) ?? 0) + 1;
    this.counts.set(key, current);
    const remaining = Math.max(0, policy.limit - current);
    return Object.freeze({ allowed: current <= policy.limit, remaining, resetSeconds: policy.windowSeconds });
  }
}

class InMemoryIdempotencyStore {
  private readonly store = new Map<string, string>();
  async get(_policy: any, routeId: string, ctx: any, key: string) {
    const value = this.store.get(`${routeId}:${ctx.tenantId}:${ctx.actor.id}:${key}`);
    return value ? (JSON.parse(value) as any) : null;
  }
  async set(_policy: any, routeId: string, ctx: any, key: string, record: any) {
    this.store.set(`${routeId}:${ctx.tenantId}:${ctx.actor.id}:${key}`, JSON.stringify(record));
  }
}

function buildEnv(): Env {
  return Object.freeze({
    NODE_ENV: "test",
    DATABASE_URL: "postgres://localhost/test",
    REDIS_URL: "redis://localhost:6379",
    LOG_LEVEL: "info",
    REQUEST_ID_HEADER: "x-request-id",
    CORRELATION_ID_HEADER: "x-correlation-id",
    TENANT_ID_HEADER: "x-tenant-id",
    ACTOR_ID_HEADER: "x-actor-id",
    ACTOR_TYPE_HEADER: "x-actor-type",
    JWT_SECRET: "secret",
    API_KEYS: ""
  });
}

function buildDeps() {
  return Object.freeze({
    env: buildEnv(),
    logger: { log: () => undefined },
    rateLimiter: new InMemoryRateLimiter(),
    idempotencyStore: new InMemoryIdempotencyStore(),
    permissionChecker: {
      async hasPermission(ctx: any, permission: string) {
        const permissions = ctx.permissions ?? [];
        return permissions.includes(permission);
      }
    },
    eventStore: {} as any,
    clock: { now: () => new Date().toISOString() },
    hash: () => "hash"
  });
}

function token(permissions: readonly string[] = ["test:write"]) {
  const require = createRequire(import.meta.url);
  const jwt = require("jsonwebtoken") as typeof import("jsonwebtoken");
  return jwt.sign({ tenantId: "t1", sub: "u1", permissions, actorType: "user" }, "secret");
}

function buildApp(mod: ResourceModule<any>) {
  const app = express();
  app.use(express.json());
  const env = buildEnv();
  app.use(requestContextMiddleware(env));
  app.use(authMiddleware(env));
  const router = express.Router();
  mountResource(router, mod, buildDeps() as any);
  app.use("/api/v1/examples", router);
  return app;
}

describe("contract: idempotency, rate limit, error envelope", () => {
  let app: express.Express;

  beforeEach(() => {
    const mod = Object.freeze({
      resourceKey: "examples" as any,
      routes: Object.freeze([
        Object.freeze({
          id: "examples.create" as any,
          method: "POST" as const,
          path: "/" as const,
          auth: { required: true, permission: "test:write" } as const,
          idempotency: { mode: "required", ttlSeconds: 60 } as const,
          rateLimit: { mode: "ip", limit: 1, windowSeconds: 60 } as const,
          schemas: {
            body: z.object({ name: z.string().min(1) }),
            response: z.object({ id: z.string().min(1) })
          },
          handler: async ({ body }: { body: { name: string } }) => Ok({ id: body.name })
        }),
        Object.freeze({
          id: "examples.fail" as any,
          method: "POST" as const,
          path: "/fail" as const,
          auth: { required: true, permission: "test:write" } as const,
          idempotency: { mode: "required", ttlSeconds: 60 } as const,
          rateLimit: { mode: "ip", limit: 10, windowSeconds: 60 } as const,
          schemas: {
            body: z.object({ name: z.string().min(1) }),
            response: z.object({ id: z.string().min(1) })
          },
          handler: async () => Err({ type: "NOT_FOUND" })
        })
      ])
    }) satisfies ResourceModule<any>;

    app = buildApp(mod);
  });

  it("replays idempotent responses with identical envelope", async () => {
    const res1 = await request(app)
      .post("/api/v1/examples")
      .set("authorization", `Bearer ${token()}`)
      .set("idempotency-key", "key-1")
      .send({ name: "alpha" });

    const res2 = await request(app)
      .post("/api/v1/examples")
      .set("authorization", `Bearer ${token()}`)
      .set("idempotency-key", "key-1")
      .send({ name: "alpha" });

    expect(res1.status).toBe(201);
    expect(res2.status).toBe(201);
    expect(res2.headers["x-idempotency-replayed"]).toBe("true");
    expect(res2.body).toEqual(res1.body);
  });

  it("enforces rate limiting with standard envelope", async () => {
    await request(app)
      .post("/api/v1/examples")
      .set("authorization", `Bearer ${token()}`)
      .set("idempotency-key", "key-2")
      .set("x-forwarded-for", "1.1.1.1")
      .send({ name: "alpha" });

    const res = await request(app)
      .post("/api/v1/examples")
      .set("authorization", `Bearer ${token()}`)
      .set("idempotency-key", "key-3")
      .set("x-forwarded-for", "1.1.1.1")
      .send({ name: "beta" });

    expect(res.status).toBe(429);
    expect(res.body.error.code).toBe("RATE_LIMITED");
    expect(res.body.error.requestId).toBeDefined();
  });

  it("returns error envelope for domain errors", async () => {
    const res = await request(app)
      .post("/api/v1/examples/fail")
      .set("authorization", `Bearer ${token()}`)
      .set("idempotency-key", "key-4")
      .send({ name: "alpha" });

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe("NOT_FOUND");
    expect(res.body.error.requestId).toBeDefined();
  });
});
