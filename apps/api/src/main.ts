import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { ExpressAdapter } from "@nestjs/platform-express";
import express from "express";
import helmet from "helmet";
import { AppModule } from "./app.module.js";
import { loadEnv } from "@civis/platform/config";
import { mountAll } from "./routing/mount-all.js";
import { ResourceRegistry } from "./routing/resource-registry.js";
import { exampleApi } from "../../../modules/example/src/api/example.routes.js";
import { opsApi } from "../../../modules/ops/src/api/ops.routes.js";
import { buildDeps } from "./deps.js";
import { requestContextMiddleware } from "./middleware/request-context.js";
import { authMiddleware } from "./middleware/auth.js";

async function bootstrap() {
  const env = loadEnv(process.env);
  const server = express();
  server.use(helmet());
  server.use(express.json({ limit: "1mb" }));

  const app = await NestFactory.create(AppModule, new ExpressAdapter(server));
  app.setGlobalPrefix("/api/v1");

  server.use(requestContextMiddleware(env));
  server.use(authMiddleware(env));

  const deps = await buildDeps(env);

  const appVersion = deps.env.APP_VERSION?.trim() ? deps.env.APP_VERSION : "dev";
  const startedAt = new Date().toISOString();
  const toMB = (bytes: number) => Math.round((bytes / 1024 / 1024) * 100) / 100;

  const opsDeps = Object.freeze({
    serviceName: "api",
    version: appVersion,
    nodeVersion: process.version,
    startedAt,
    uptimeSeconds: () => Math.floor(process.uptime()),
    now: () => new Date().toISOString(),
    memoryUsage: () => {
      const mem = process.memoryUsage();
      return { heapUsedMB: toMB(mem.heapUsed), heapTotalMB: toMB(mem.heapTotal), rssMB: toMB(mem.rss), externalMB: toMB(mem.external) };
    },
    cpuUsage: () => {
      const cpu = process.cpuUsage();
      return { user: Math.round(cpu.user / 1000), system: Math.round(cpu.system / 1000) };
    },
    checkPostgres: async () => {
      await deps.db.query("SELECT 1");
    },
    checkRedis: async () => {
      await deps.redis.ping();
    },
    checkQueueLag: async () => {
      const lag = await deps.redis.llen(env.QUEUE_LAG_KEY);
      return lag;
    },
    cacheStatus: async () => {
      try {
        await deps.redis.ping();
        return "ok" as const;
      } catch {
        return "down" as const;
      }
    },
    featureFlags: async () => ({}),
    configSummary: async () => ({
      NODE_ENV: deps.env.NODE_ENV,
      LOG_LEVEL: deps.env.LOG_LEVEL,
      APP_VERSION: appVersion
    }),
    metrics: async () => "# Metrics disabled"
  });

  const exampleModule = exampleApi(deps);
  const opsModule = opsApi(opsDeps);
  const combinedDeps = Object.freeze({
    ...deps,
    ...opsDeps
  });

  const registry = new ResourceRegistry();
  registry.register(exampleModule.resourceKey, "examples" as any);
  registry.register(opsModule.resourceKey, "" as any);

  mountAll(app, registry, [exampleModule, opsModule], combinedDeps);

  await app.listen(3000);
}

bootstrap();
