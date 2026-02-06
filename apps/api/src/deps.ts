import type { Env } from "@civis/platform/config";
import { ConsoleLogger } from "@civis/platform/logger";
import { SafeLogger } from "@civis/platform/logger";
import Redis from "ioredis";
import { createHash } from "crypto";
import { Pool } from "pg";
import type { PermissionChecker } from "./policies/permissions.js";
import { RedisRateLimiter } from "./policies/rate-limit.js";
import { RedisIdempotencyStore } from "./policies/idempotency.js";
import { PgEventStore } from "@civis/event-sourcing";
import { exampleEventRegistry } from "../../../modules/example/src/domain/event-registry.js";

export type Deps = Readonly<{
  env: Env;
  logger: SafeLogger;
  rateLimiter: RedisRateLimiter;
  idempotencyStore: RedisIdempotencyStore;
  permissionChecker: PermissionChecker;
  eventStore: PgEventStore;
  clock: Readonly<{ now: () => string }>;
  hash: (value: string) => string;
  db: Pool;
  redis: Redis;
}>;

export async function buildDeps(env: Env): Promise<Deps> {
  const redis = new Redis(env.REDIS_URL);
  const pool = new Pool({ connectionString: env.DATABASE_URL });
  const logger = new SafeLogger(new ConsoleLogger(env.LOG_LEVEL ?? "info"));

  const rateLimiter = new RedisRateLimiter(redis);
  const idempotencyStore = new RedisIdempotencyStore(redis);
  const permissionChecker: PermissionChecker = {
    async hasPermission(ctx, permission) {
      const permissions = ctx.permissions ?? [];
      if (permissions.includes("*")) return true;
      return permissions.includes(permission);
    }
  };

  return Object.freeze({
    env,
    logger,
    rateLimiter,
    idempotencyStore,
    permissionChecker,
    eventStore: new PgEventStore(pool, exampleEventRegistry),
    clock: Object.freeze({ now: () => new Date().toISOString() }),
    hash: (value: string) => createHash("sha256").update(value).digest("hex"),
    db: pool,
    redis
  });
}
