import type { Pool } from "pg";
import type { ProjectionHandler } from "./worker.js";
import { createExampleProjectionHandlers } from "../../../modules/example/src/infrastructure/projections/example.handlers.js";

export function loadProjectionHandlers(pool: Pool): Map<string, ProjectionHandler> {
  const map = new Map<string, ProjectionHandler>();

  for (const [eventType, handler] of createExampleProjectionHandlers(pool).entries()) {
    map.set(eventType, handler);
  }

  return map;
}
