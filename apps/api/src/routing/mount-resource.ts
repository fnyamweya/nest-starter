import type { Router, Request, Response } from "express";
import { validate, empty } from "@civis/kernel/validation";
import type { ResourceModule, RouteDef } from "@civis/http-contracts";
import type { Result } from "@civis/kernel/types";
import type { Deps } from "../deps.js";

function mapError(err: any, requestId: string) {
  switch (err?.type) {
    case "VALIDATION_ERROR":
      return { status: 400, body: { error: { code: "VALIDATION_ERROR", message: "Invalid request data", requestId, details: err.violations } } };
    case "FORBIDDEN":
      return { status: 403, body: { error: { code: "FORBIDDEN", message: "Forbidden", requestId } } };
    case "NOT_FOUND":
      return { status: 404, body: { error: { code: "NOT_FOUND", message: "Not found", requestId } } };
    case "CONFLICT":
      return { status: 409, body: { error: { code: "CONFLICT", message: "Conflict", requestId, details: err } } };
    case "UNAVAILABLE":
      return { status: 503, body: { error: { code: "UNAVAILABLE", message: err?.message ?? "Service unavailable", requestId, details: err?.details } } };
    default:
      return { status: 400, body: { error: { code: err?.type ?? "BAD_REQUEST", message: "Request failed", requestId } } };
  }
}

function requireCtx(req: Request) {
  const ctx = req.ctx;
  if (!ctx || !ctx.tenantId || !ctx.actor?.id) return null;
  return ctx;
}

async function enforceRateLimit(route: RouteDef<any, any, any, any, any, Deps>, req: Request, res: Response, deps: Deps): Promise<boolean> {
  if (route.rateLimit.mode === "none") return true;
  const ctx = requireCtx(req);
  if (!ctx) return false;

  const ip = String(req.headers["x-forwarded-for"] ?? req.socket.remoteAddress ?? "");
  const ipHash = deps.hash(ip);
  let result: Awaited<ReturnType<typeof deps.rateLimiter.check>>;
  try {
    result = await deps.rateLimiter.check(route.rateLimit, route.id, ctx, ipHash);
  } catch {
    res.status(503).json({
      error: { code: "UNAVAILABLE", message: "Rate limiter unavailable", requestId: ctx.requestId }
    });
    return false;
  }

  res.setHeader("X-RateLimit-Remaining", String(result.remaining));
  res.setHeader("X-RateLimit-Reset", String(result.resetSeconds));

  if (!result.allowed) {
    res.setHeader("Retry-After", String(result.resetSeconds));
    res.status(429).json({ error: { code: "RATE_LIMITED", message: "Too many requests", requestId: ctx.requestId } });
    return false;
  }

  return true;
}

async function enforceIdempotency(route: RouteDef<any, any, any, any, any, Deps>, req: Request, res: Response, deps: Deps): Promise<boolean> {
  if (route.idempotency.mode === "none" || route.method === "GET") return true;
  const ctx = requireCtx(req);
  if (!ctx) return false;

  const key = String(req.headers["idempotency-key"] ?? "");
  if (route.idempotency.mode === "required" && !key) {
    res.status(400).json({ error: { code: "IDEMPOTENCY_REQUIRED", message: "Idempotency key required", requestId: ctx.requestId } });
    return false;
  }

  if (!key) return true;

  const existing = await deps.idempotencyStore.get(route.idempotency, route.id, ctx, key);
  if (!existing) return true;

  for (const [key, value] of Object.entries(existing.headers)) {
    res.setHeader(key, value);
  }
  res.setHeader("X-Idempotency-Replayed", "true");
  res.status(existing.status).json(existing.body);
  return false;
}

async function enforcePermission(route: RouteDef<any, any, any, any, any, Deps>, req: Request, res: Response, deps: Deps): Promise<boolean> {
  const ctx = requireCtx(req);
  if (!ctx) return false;
  if (!route.auth.required) return true;
  if (!route.auth.permission) return true;

  const allowed = await deps.permissionChecker.hasPermission(ctx, route.auth.permission);
  if (!allowed) {
    res.status(403).json({ error: { code: "FORBIDDEN", message: "Forbidden", requestId: ctx.requestId } });
    return false;
  }
  return true;
}

function asExpressHandler(route: RouteDef<any, any, any, any, any, Deps>, deps: Deps) {
  return async (req: Request, res: Response) => {
    const ctx = requireCtx(req);
    if (!ctx) {
      const requestId = req.requestId ?? "missing";
      return res.status(401).json({ error: { code: "UNAUTHORIZED", message: "Authentication required", requestId } });
    }

    if (!(await enforcePermission(route, req, res, deps))) return;
    if (!(await enforceRateLimit(route, req, res, deps))) return;
    if (!(await enforceIdempotency(route, req, res, deps))) return;

    if (route.schemas.body) {
      const contentType = String(req.headers["content-type"] ?? "");
      if (!contentType.includes("application/json")) {
        return res.status(415).json({
          error: { code: "UNSUPPORTED_MEDIA_TYPE", message: "Expected application/json", requestId: ctx.requestId }
        });
      }
    }

    const paramsR = route.schemas.params ? validate(route.schemas.params, req.params) : ({ ok: true, value: empty } as const);
    if (!paramsR.ok) return res.status(400).json({ error: { code: "VALIDATION_ERROR", message: "Invalid request data", requestId: ctx.requestId, details: paramsR.error.violations } });

    const queryR = route.schemas.query ? validate(route.schemas.query, req.query) : ({ ok: true, value: empty } as const);
    if (!queryR.ok) return res.status(400).json({ error: { code: "VALIDATION_ERROR", message: "Invalid request data", requestId: ctx.requestId, details: queryR.error.violations } });

    const bodyR = route.schemas.body ? validate(route.schemas.body, req.body) : ({ ok: true, value: empty } as const);
    if (!bodyR.ok) return res.status(400).json({ error: { code: "VALIDATION_ERROR", message: "Invalid request data", requestId: ctx.requestId, details: bodyR.error.violations } });

    let result: Result<any, any>;
    try {
      result = await route.handler({
        ctx,
        params: paramsR.value,
        query: queryR.value,
        body: bodyR.value,
        deps
      });
    } catch (err) {
      deps.logger.log({
        level: "error",
        message: "Route handler threw",
        context: Object.freeze({
          requestId: ctx.requestId,
          routeId: route.id,
          method: route.method,
          path: route.path,
          error: err instanceof Error ? err.message : String(err)
        })
      });
      return res.status(500).json({ error: { code: "INTERNAL_ERROR", message: "An unexpected error occurred", requestId: ctx.requestId } });
    }

    if (!result.ok) {
      const mapped = mapError(result.error, ctx.requestId);
      return res.status(mapped.status).json(mapped.body);
    }

    const status = route.method === "POST" ? 201 : 200;
    if (route.schemas.response) {
      const outR = validate(route.schemas.response, result.value);
      if (!outR.ok) {
        deps.logger.log({
          level: "error",
          message: "Response validation failed",
          context: Object.freeze({
            requestId: ctx.requestId,
            routeId: route.id,
            method: route.method,
            path: route.path,
            violations: outR.error.violations
          })
        });
        return res.status(500).json({ error: { code: "INTERNAL_ERROR", message: "An unexpected error occurred", requestId: ctx.requestId } });
      }
      await maybeStoreIdempotency(route, req, res, deps, outR.value, status);
      if (typeof outR.value === "string") {
        res.type("text/plain");
        return res.status(status).send(outR.value);
      }
      return res.status(status).json(outR.value);
    }

    await maybeStoreIdempotency(route, req, res, deps, result.value, status);
    if (typeof result.value === "string") {
      res.type("text/plain");
      return res.status(status).send(result.value);
    }
    return res.status(status).json(result.value);
  };
}

async function maybeStoreIdempotency(
  route: RouteDef<any, any, any, any, any, Deps>,
  req: Request,
  res: Response,
  deps: Deps,
  body: unknown,
  status: number
): Promise<void> {
  if (route.idempotency.mode === "none" || route.method === "GET") return;
  const ctx = requireCtx(req);
  if (!ctx) return;
  const key = String(req.headers["idempotency-key"] ?? "");
  if (!key) return;
  await deps.idempotencyStore.set(route.idempotency, route.id, ctx, key, {
    status,
    body,
    headers: Object.freeze({ "content-type": "application/json" })
  });
}

export function mountResource(router: Router, mod: ResourceModule<any>, deps: Deps) {
  for (const route of mod.routes) {
    if (route.method !== "GET" && route.idempotency.mode === "none") {
      throw new Error(`Idempotency required for non-GET route: ${route.id}`);
    }

    if (route.rateLimit.mode === "none") {
      throw new Error(`Rate limiting required for public route: ${route.id}`);
    }

    if (!route.schemas.response) {
      throw new Error(`Response schema required for route: ${route.id}`);
    }

    const handler = asExpressHandler(route, deps);

    switch (route.method) {
      case "GET":
        router.get(route.path, handler);
        break;
      case "POST":
        router.post(route.path, handler);
        break;
      case "PATCH":
        router.patch(route.path, handler);
        break;
      case "DELETE":
        router.delete(route.path, handler);
        break;
    }
  }
}
