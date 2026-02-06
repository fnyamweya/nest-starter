import type { Redis } from "ioredis";
import type { RateLimitPolicy, RouteId, RequestContext } from "@civis/http-contracts";
import { randomUUID } from "crypto";

export type RateLimitResult = Readonly<{
  allowed: boolean;
  remaining: number;
  resetSeconds: number;
}>;

export class RedisRateLimiter {
  constructor(private readonly redis: Redis) {}

  async check(policy: RateLimitPolicy, routeId: RouteId, ctx: RequestContext, ipHash: string): Promise<RateLimitResult> {
    if (policy.mode === "none") {
      return Object.freeze({ allowed: true, remaining: Number.MAX_SAFE_INTEGER, resetSeconds: 0 });
    }

    const key = policy.mode === "ip"
      ? `rl:ip:${ctx.tenantId}:${ipHash}:${routeId}`
      : `rl:actor:${ctx.tenantId}:${ctx.actor.id}:${routeId}`;

    const nowMs = Date.now();
    const windowStart = nowMs - policy.windowSeconds * 1000;
    const member = `${nowMs}-${randomUUID()}`;

    const results = await this.redis
      .multi()
      .zadd(key, nowMs, member)
      .zremrangebyscore(key, 0, windowStart)
      .zcard(key)
      .expire(key, policy.windowSeconds)
      .exec();

    const count = Number(results?.[2]?.[1] ?? 0);
    const remaining = Math.max(0, policy.limit - count);
    const allowed = count <= policy.limit;
    const resetSeconds = policy.windowSeconds;

    return Object.freeze({ allowed, remaining, resetSeconds });
  }
}
