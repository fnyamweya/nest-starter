import type { z } from "zod";
import type { Result } from "@civis/kernel";

export type HttpMethod = "GET" | "POST" | "PATCH" | "DELETE";

export type RouteId = string & { readonly __brand: "RouteId" };

export type RouteAuth =
  | Readonly<{ required: true; permission?: string }>
  | Readonly<{ required: false }>;

export type IdempotencyPolicy =
  | Readonly<{ mode: "required"; ttlSeconds: number }>
  | Readonly<{ mode: "optional"; ttlSeconds: number }>
  | Readonly<{ mode: "none" }>;

export type RateLimitPolicy =
  | Readonly<{ mode: "ip"; limit: number; windowSeconds: number }>
  | Readonly<{ mode: "actor"; limit: number; windowSeconds: number }>
  | Readonly<{ mode: "none" }>;

export type RouteSchemas<P, Q, B, R> = Readonly<{
  params?: z.ZodType<P>;
  query?: z.ZodType<Q>;
  body?: z.ZodType<B>;
  response?: z.ZodType<R>;
}>;

export type RequestContext = Readonly<{
  tenantId: string;
  requestId: string;
  correlationId: string;
  actor: Readonly<{ type: "user" | "system" | "api_key"; id: string }>;
  permissions?: readonly string[];
  locale?: string;
}>;

export type RouteHandler<P, Q, B, R, E, Deps> = (req: Readonly<{
  ctx: RequestContext;
  params: P;
  query: Q;
  body: B;
  deps: Deps;
}>) => Promise<Result<R, E>>;

export type RouteDef<P, Q, B, R, E, Deps> = Readonly<{
  id: RouteId;
  method: HttpMethod;
  path: `/${string}`;
  auth: RouteAuth;
  idempotency: IdempotencyPolicy;
  rateLimit: RateLimitPolicy;
  schemas: RouteSchemas<P, Q, B, R>;
  handler: RouteHandler<P, Q, B, R, E, Deps>;
}>;
