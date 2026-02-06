import { Pool } from "pg";
import type { Env } from "@civis/platform/config";
import { validateEventPayload } from "@civis/event-sourcing";
import { exampleEventRegistry } from "../../../../modules/example/src/domain/event-registry.js";
import { z } from "zod";

export async function verify(env: Env): Promise<void> {
  const pool = new Pool({ connectionString: env.DATABASE_URL });
  const events = await pool.query("SELECT event_type, type_version, payload FROM events");
  for (const row of events.rows) {
    const payload = typeof row.payload === "string" ? JSON.parse(row.payload) : row.payload;
    const validated = validateEventPayload(exampleEventRegistry, row.event_type, row.type_version, payload);
    if (!validated.ok) {
      throw new Error(`Invalid event payload for ${row.event_type} v${row.type_version}`);
    }
  }

  const exampleSchema = z.object({
    tenant_id: z.string().min(1),
    example_id: z.string().min(1),
    name: z.string().min(1),
    created_at: z.string().min(1)
  });

  const models = await pool.query("SELECT tenant_id, example_id, name, created_at FROM example_read_models");
  for (const row of models.rows) {
    const parsed = exampleSchema.safeParse(row);
    if (!parsed.success) {
      throw new Error("Invalid read model row in example_read_models");
    }
  }

  await pool.end();
}
