import type { Redis } from "ioredis";
import type { IdempotencyPolicy, RouteId, RequestContext } from "@civis/http-contracts";
import { z } from "zod";

export type IdempotencyRecord = Readonly<{
  status: number;
  body: unknown;
  headers: Readonly<Record<string, string>>;
}>;

export class RedisIdempotencyStore {
  constructor(private readonly redis: Redis) {}

  async get(policy: IdempotencyPolicy, routeId: RouteId, ctx: RequestContext, key: string): Promise<IdempotencyRecord | null> {
    if (policy.mode === "none") return null;
    const redisKey = this.buildKey(routeId, ctx, key);
    const raw = await this.redis.get(redisKey);
    if (!raw) return null;
    const schema = z.object({
      status: z.number().int(),
      body: z.unknown(),
      headers: z.record(z.string())
    });
    const parsed = schema.safeParse(JSON.parse(raw));
    if (!parsed.success) return null;
    return parsed.data as IdempotencyRecord;
  }

  async set(policy: IdempotencyPolicy, routeId: RouteId, ctx: RequestContext, key: string, record: IdempotencyRecord): Promise<void> {
    if (policy.mode === "none") return;
    const redisKey = this.buildKey(routeId, ctx, key);
    await this.redis.set(redisKey, JSON.stringify(record), "EX", policy.ttlSeconds);
  }

  private buildKey(routeId: RouteId, ctx: RequestContext, key: string): string {
    return `idem:${ctx.tenantId}:${ctx.actor.id}:${routeId}:${key}`;
  }
}
