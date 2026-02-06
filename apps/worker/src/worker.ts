import { Pool } from "pg";
import { loadProjectionHandlers } from "./worker.handlers.js";
import type { Env } from "@civis/platform/config";
import { ConsoleLogger, SafeLogger } from "@civis/platform/logger";
import type { StoredEvent } from "@civis/event-sourcing";
import { validateEventPayload } from "@civis/event-sourcing";
import { exampleEventRegistry } from "../../../modules/example/src/domain/event-registry.js";

export type ProjectionHandler = (event: StoredEvent) => Promise<void>;

export type Worker = Readonly<{
  run: () => Promise<void>;
}>;

export async function createWorker(env: Env): Promise<Worker> {
  const pool = new Pool({ connectionString: env.DATABASE_URL });
  const logger = new SafeLogger(new ConsoleLogger(env.LOG_LEVEL ?? "info"));
  const handlers = loadProjectionHandlers(pool);

  async function run() {
    for (;;) {
      const tenants = await pool.query("SELECT DISTINCT tenant_id FROM streams");

      for (const tenant of tenants.rows) {
        const tenantId = tenant.tenant_id as string;
        for (const [eventType, handler] of handlers.entries()) {
          const checkpoint = await loadCheckpoint(pool, tenantId, eventType);
          const rows = await pool.query(
            "SELECT * FROM events WHERE tenant_id = $1 AND event_type = $2 AND (occurred_at, event_id) > ($3, $4) ORDER BY occurred_at ASC, event_id ASC LIMIT 100",
            [tenantId, eventType, checkpoint.lastOccurredAt, checkpoint.lastEventId]
          );

          for (const row of rows.rows) {
            const rawEvent: StoredEvent = Object.freeze({
              tenantId: row.tenant_id,
              streamId: row.stream_id,
              streamType: row.stream_type,
              version: Number(row.version),
              eventId: row.event_id,
              eventType: row.event_type,
              typeVersion: Number(row.type_version),
              occurredAt: row.occurred_at,
              requestId: row.request_id,
              correlationId: row.correlation_id,
              actorType: row.actor_type,
              actorId: row.actor_id,
              payload: row.payload
            });

            const validated = validateEventPayload(
              exampleEventRegistry,
              rawEvent.eventType,
              rawEvent.typeVersion,
              rawEvent.payload
            );

            if (!validated.ok) {
              await pool.query(
                "INSERT INTO dead_letters (tenant_id, event_id, event_type, reason, occurred_at, correlation_id) VALUES ($1,$2,$3,$4,$5,$6)",
                [rawEvent.tenantId, rawEvent.eventId, rawEvent.eventType, validated.error.message, rawEvent.occurredAt, rawEvent.correlationId]
              );
              continue;
            }

            const event: StoredEvent = Object.freeze({
              ...rawEvent,
              payload: validated.value
            });

            try {
              await handler(event);
              await storeCheckpoint(pool, tenantId, eventType, event.occurredAt, event.eventId);
            } catch (err) {
              await pool.query(
                "INSERT INTO dead_letters (tenant_id, event_id, event_type, reason, occurred_at, correlation_id) VALUES ($1,$2,$3,$4,$5,$6)",
                [event.tenantId, event.eventId, event.eventType, String(err), event.occurredAt, event.correlationId]
              );
              logger.log({
                level: "error",
                message: "Projection failed",
                context: {
                  requestId: event.requestId,
                  correlationId: event.correlationId,
                  tenantId: event.tenantId,
                  eventType: event.eventType
                }
              });
            }
          }
        }
      }

      await new Promise((r) => setTimeout(r, 1000));
    }
  }

  return Object.freeze({ run });
}

async function loadCheckpoint(pool: Pool, tenantId: string, projection: string) {
  const row = await pool.query(
    "SELECT last_occurred_at, last_event_id FROM projection_checkpoints WHERE tenant_id = $1 AND projection = $2",
    [tenantId, projection]
  );

  if (row.rowCount === 0) {
    return Object.freeze({ lastOccurredAt: "1970-01-01T00:00:00.000Z", lastEventId: "00000000-0000-0000-0000-000000000000" });
  }

  return Object.freeze({
    lastOccurredAt: row.rows[0].last_occurred_at as string,
    lastEventId: row.rows[0].last_event_id as string
  });
}

async function storeCheckpoint(pool: Pool, tenantId: string, projection: string, occurredAt: string, eventId: string) {
  await pool.query(
    "INSERT INTO projection_checkpoints (tenant_id, projection, last_occurred_at, last_event_id) VALUES ($1,$2,$3,$4) ON CONFLICT (tenant_id, projection) DO UPDATE SET last_occurred_at = $3, last_event_id = $4",
    [tenantId, projection, occurredAt, eventId]
  );
}
