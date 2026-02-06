import { z } from "zod";
import type { ResourceModule } from "@civis/http-contracts";
import { Ok, Err, type Result } from "@civis/kernel";

export type OpsDeps = Readonly<{
  serviceName: string;
  version: string;
  nodeVersion: string;
  startedAt: string;
  uptimeSeconds: () => number;
  now: () => string;
  memoryUsage: () => { heapUsedMB: number; heapTotalMB: number; rssMB: number; externalMB: number };
  cpuUsage: () => { user: number; system: number };
  checkPostgres: () => Promise<void>;
  checkRedis: () => Promise<void>;
  checkQueueLag: () => Promise<number>;
  cacheStatus: () => Promise<"ok" | "degraded" | "down">;
  featureFlags: () => Promise<Readonly<Record<string, boolean>>>;
  configSummary: () => Promise<Readonly<Record<string, string>>>;
  metrics: () => Promise<string>;
}>;

const DependencyCheckSchema = z.object({
  name: z.string().min(1),
  ok: z.boolean(),
  latencyMs: z.number().int().nonnegative(),
  message: z.string().optional()
});

const MemorySchema = z.object({
  heapUsedMB: z.number().nonnegative(),
  heapTotalMB: z.number().nonnegative(),
  rssMB: z.number().nonnegative(),
  externalMB: z.number().nonnegative()
});

const CpuSchema = z.object({
  user: z.number().nonnegative(),
  system: z.number().nonnegative()
});

const HealthSchema = z.object({
  status: z.enum(["ok", "degraded", "down"]),
  totalCheckDurationMs: z.number().int().nonnegative(),
  service: z.object({
    name: z.string().min(1),
    version: z.string().min(1),
    nodeVersion: z.string().min(1),
    uptimeSeconds: z.number().int().nonnegative(),
    startedAt: z.string().min(1),
    now: z.string().min(1)
  }),
  dependencies: z.array(DependencyCheckSchema),
  system: z.object({
    memory: MemorySchema,
    cpu: CpuSchema
  })
});

const ReadySchema = z.object({
  ready: z.boolean(),
  dependencies: z.object({
    postgres: z.boolean(),
    redis: z.boolean()
  })
});

const VersionSchema = z.object({
  name: z.string().min(1),
  version: z.string().min(1),
  builtAt: z.string().min(1)
});

const StatusSchema = z.object({
  status: z.enum(["ok", "degraded", "down"]),
  dependencies: z.object({
    postgres: z.object({ ok: z.boolean(), latencyMs: z.number().int().nonnegative() }),
    redis: z.object({ ok: z.boolean(), latencyMs: z.number().int().nonnegative() })
  }),
  queueLag: z.number().int().nonnegative(),
  cacheStatus: z.enum(["ok", "degraded", "down"])
});

const DiagnosticsSchema = z.object({
  featureFlags: z.record(z.boolean()),
  config: z.record(z.string())
});

const MetricsSchema = z.string().min(1);

type IpRateLimit = Readonly<{ mode: "ip"; limit: number; windowSeconds: number }>;

const DEFAULT_RATE_LIMIT: IpRateLimit = { mode: "ip", limit: 60, windowSeconds: 60 };
const METRICS_RATE_LIMIT: IpRateLimit = { mode: "ip", limit: 120, windowSeconds: 60 };
const DIAGNOSTICS_RATE_LIMIT: IpRateLimit = { mode: "ip", limit: 30, windowSeconds: 60 };

function baseRoute(id: string, path: string, rateLimit: IpRateLimit = DEFAULT_RATE_LIMIT) {
  return Object.freeze({
    id: id as any,
    method: "GET" as const,
    path: path as any,
    auth: { required: true } as const,
    idempotency: { mode: "none" } as const,
    rateLimit
  });
}

function serviceInfo(deps: OpsDeps) {
  return Object.freeze({
    name: deps.serviceName,
    version: deps.version,
    uptimeSeconds: deps.uptimeSeconds(),
    now: deps.now()
  });
}

function dependencyStatus(pgOk: boolean, redisOk: boolean) {
  if (pgOk && redisOk) return "ok" as const;
  if (pgOk || redisOk) return "degraded" as const;
  return "down" as const;
}

export function opsApi(deps: OpsDeps): ResourceModule<OpsDeps> {
  return Object.freeze({
    resourceKey: "ops" as any,
    routes: Object.freeze([
      Object.freeze({
        ...baseRoute("ops.health", "/health"),
        schemas: { response: HealthSchema },
        handler: async ({ deps }: { deps: OpsDeps }): Promise<Result<z.infer<typeof HealthSchema>, { type: "UNAVAILABLE"; message: string }>> => {
          const started = Date.now();

          const checks = await Promise.all([
            timedCheckNamed("postgres", deps.checkPostgres),
            timedCheckNamed("redis", deps.checkRedis)
          ]);

          const allOk = checks.every((c) => c.ok);
          const anyOk = checks.some((c) => c.ok);
          const status = allOk ? "ok" : anyOk ? "degraded" : "down";

          const response = Object.freeze({
            status,
            totalCheckDurationMs: Date.now() - started,
            service: Object.freeze({
              name: deps.serviceName,
              version: deps.version,
              nodeVersion: deps.nodeVersion,
              uptimeSeconds: deps.uptimeSeconds(),
              startedAt: deps.startedAt,
              now: deps.now()
            }),
            dependencies: [...checks],
            system: Object.freeze({
              memory: Object.freeze(deps.memoryUsage()),
              cpu: Object.freeze(deps.cpuUsage())
            })
          });

          if (status === "ok") return Ok(response);
          return Err({ type: "UNAVAILABLE", message: `Health check: ${status} — ${checks.filter((c) => !c.ok).map((c) => c.name).join(", ")} failing` });
        }
      }),
      Object.freeze({
        ...baseRoute("ops.liveness", "/healthz"),
        schemas: { response: HealthSchema },
        handler: async ({ deps }: { deps: OpsDeps }) => Ok(Object.freeze({
          status: "ok",
          totalCheckDurationMs: 0,
          service: Object.freeze({
            name: deps.serviceName,
            version: deps.version,
            nodeVersion: deps.nodeVersion,
            uptimeSeconds: deps.uptimeSeconds(),
            startedAt: deps.startedAt,
            now: deps.now()
          }),
          dependencies: Object.freeze([]),
          system: Object.freeze({
            memory: Object.freeze(deps.memoryUsage()),
            cpu: Object.freeze(deps.cpuUsage())
          })
        }))
      }),
      Object.freeze({
        ...baseRoute("ops.ready", "/ready"),
        schemas: { response: ReadySchema },
        handler: async ({ deps }: { deps: OpsDeps }): Promise<Result<z.infer<typeof ReadySchema>, { type: "UNAVAILABLE"; message: string }>> => {
          const [pg, redis] = await Promise.all([
            safeBool(deps.checkPostgres),
            safeBool(deps.checkRedis)
          ]);
          const ready = pg && redis;
          const response = Object.freeze({
            ready,
            dependencies: Object.freeze({ postgres: pg, redis })
          });
          if (ready) return Ok(response);
          return Err({ type: "UNAVAILABLE", message: "Service not ready" });
        }
      }),
      Object.freeze({
        ...baseRoute("ops.metrics", "/metrics", METRICS_RATE_LIMIT),
        schemas: { response: MetricsSchema },
        handler: async ({ deps }: { deps: OpsDeps }) => Ok(await deps.metrics())
      }),
      Object.freeze({
        ...baseRoute("ops.version", "/version"),
        schemas: { response: VersionSchema },
        handler: async ({ deps }: { deps: OpsDeps }) => Ok(Object.freeze({
          name: deps.serviceName,
          version: deps.version,
          builtAt: deps.now()
        }))
      }),
      Object.freeze({
        ...baseRoute("ops.build", "/build-info"),
        schemas: { response: VersionSchema },
        handler: async ({ deps }: { deps: OpsDeps }) => Ok(Object.freeze({
          name: deps.serviceName,
          version: deps.version,
          builtAt: deps.now()
        }))
      }),
      Object.freeze({
        ...baseRoute("ops.status", "/status"),
        schemas: { response: StatusSchema },
        handler: async ({ deps }: { deps: OpsDeps }): Promise<Result<z.infer<typeof StatusSchema>, { type: "UNAVAILABLE"; message: string; details: unknown }>> => {
          const started = Date.now();
          const [pg, redis, queueLag, cacheStatus] = await Promise.all([
            timedCheck(deps.checkPostgres),
            timedCheck(deps.checkRedis),
            deps.checkQueueLag(),
            deps.cacheStatus()
          ]);

          const baseStatus = dependencyStatus(pg.ok, redis.ok);
          const status = baseStatus === "ok" && cacheStatus !== "ok" ? "degraded" : baseStatus;
          const response = Object.freeze({
            status,
            dependencies: Object.freeze({
              postgres: Object.freeze(pg),
              redis: Object.freeze(redis)
            }),
            queueLag,
            cacheStatus
          });

          if (status === "ok") return Ok(response);
          return Err({
            type: "UNAVAILABLE",
            message: "Dependency check failed",
            details: Object.freeze({ durationMs: Date.now() - started })
          });
        }
      }),
      Object.freeze({
        ...baseRoute("ops.diagnostics", "/diagnostics", DIAGNOSTICS_RATE_LIMIT),
        schemas: { response: DiagnosticsSchema },
        handler: async ({ deps }: { deps: OpsDeps }) => {
          const [featureFlags, config] = await Promise.all([
            deps.featureFlags(),
            deps.configSummary()
          ]);
          return Ok(Object.freeze({
            featureFlags: Object.freeze(featureFlags),
            config: Object.freeze(config)
          }));
        }
      })
    ])
  }) satisfies ResourceModule<OpsDeps>;
}

async function timedCheck(work: () => Promise<void>): Promise<Readonly<{ ok: boolean; latencyMs: number }>> {
  const start = Date.now();
  try {
    await work();
    return Object.freeze({ ok: true, latencyMs: Date.now() - start });
  } catch {
    return Object.freeze({ ok: false, latencyMs: Date.now() - start });
  }
}

async function timedCheckNamed(name: string, work: () => Promise<void>): Promise<Readonly<{ name: string; ok: boolean; latencyMs: number; message?: string }>> {
  const start = Date.now();
  try {
    await work();
    return Object.freeze({ name, ok: true, latencyMs: Date.now() - start });
  } catch (err) {
    return Object.freeze({
      name,
      ok: false,
      latencyMs: Date.now() - start,
      message: err instanceof Error ? err.message : String(err)
    });
  }
}

async function safeBool(work: () => Promise<void>): Promise<boolean> {
  try {
    await work();
    return true;
  } catch {
    return false;
  }
}
