import express from "express";
import type { INestApplication } from "@nestjs/common";
import { mountResource } from "./mount-resource.js";
import type { ResourceModule } from "@civis/http-contracts";
import type { ResourceRegistry } from "./resource-registry.js";
import type { Deps } from "../deps.js";

export function mountAll(
  app: INestApplication,
  registry: ResourceRegistry,
  modules: readonly ResourceModule<any>[],
  deps: Deps
) {
  const http = app.getHttpAdapter().getInstance();

  for (const mod of modules) {
    const resourcePath = registry.pathOf(mod.resourceKey);
    const router = express.Router();
    mountResource(router, mod, deps);
    const basePath = resourcePath.length > 0 ? `/api/v1/${resourcePath}` : "/api/v1";
    http.use(basePath, router);
  }
}
