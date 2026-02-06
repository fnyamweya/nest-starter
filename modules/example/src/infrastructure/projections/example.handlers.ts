import type { Pool } from "pg";
import type { StoredEvent } from "@civis/event-sourcing";

export type ProjectionHandler = (event: StoredEvent) => Promise<void>;

export function createExampleProjectionHandlers(pool: Pool): Map<string, ProjectionHandler> {
  const map = new Map<string, ProjectionHandler>();

  map.set("example.created", async (event) => {
    const payload = event.payload as { exampleId: string; name: string };
    await pool.query(
      "INSERT INTO example_read_models (tenant_id, example_id, name, created_at) VALUES ($1,$2,$3,$4)",
      [event.tenantId, payload.exampleId, payload.name, event.occurredAt]
    );
  });

  return map;
}
