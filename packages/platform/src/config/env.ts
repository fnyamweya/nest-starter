import { z } from "zod";

const EnvSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  DATABASE_URL: z.string().min(1),
  REDIS_URL: z.string().min(1),
  LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).default("info"),
  REQUEST_ID_HEADER: z.string().min(1).default("x-request-id"),
  CORRELATION_ID_HEADER: z.string().min(1).default("x-correlation-id"),
  TENANT_ID_HEADER: z.string().min(1).default("x-tenant-id"),
  ACTOR_ID_HEADER: z.string().min(1).default("x-actor-id"),
  ACTOR_TYPE_HEADER: z.string().min(1).default("x-actor-type"),
  JWT_SECRET: z.string().min(1).optional(),
  API_KEYS: z.string().optional(),
  APP_VERSION: z.string().min(1).optional(),
  METRICS_PREFIX: z.string().min(1).default("civis_"),
  QUEUE_LAG_KEY: z.string().min(1).default("queue:events")
});

export type Env = z.infer<typeof EnvSchema>;

export function loadEnv(env: NodeJS.ProcessEnv): Env {
  const parsed = EnvSchema.safeParse(env);
  if (!parsed.success) {
    const message = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
    throw new Error(`Invalid environment: ${message}`);
  }
  return Object.freeze(parsed.data);
}
