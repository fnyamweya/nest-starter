import { randomUUID } from "crypto";
import type { Pool } from "pg";
import type { AppendRequest, EventRecord, EventStore, StoredEvent } from "./event-store.js";
import { EventStoreConflict } from "./event-store.js";
import type { EventSchemaRegistry } from "./event-registry.js";
import { validateEventPayload } from "./event-registry.js";

export class PgEventStore implements EventStore {
  constructor(
    private readonly pool: Pool,
    private readonly registry: EventSchemaRegistry
  ) {}

  async append<E extends EventRecord>(req: AppendRequest<E>): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");

      const row = await client.query(
        "SELECT version FROM streams WHERE tenant_id = $1 AND stream_id = $2 FOR UPDATE",
        [req.tenantId, req.streamId]
      );

      let version = 0;
      if (row.rowCount === 0) {
        await client.query(
          "INSERT INTO streams (tenant_id, stream_id, stream_type, version) VALUES ($1, $2, $3, $4)",
          [req.tenantId, req.streamId, req.streamType, 0]
        );
      } else {
        version = Number(row.rows[0].version ?? 0);
      }

      if (version !== req.expectedVersion) {
        throw new EventStoreConflict("Expected version mismatch");
      }

      const nextVersion = version + req.events.length;
      await client.query(
        "UPDATE streams SET version = $1 WHERE tenant_id = $2 AND stream_id = $3",
        [nextVersion, req.tenantId, req.streamId]
      );

      const insertSql =
        "INSERT INTO events (tenant_id, stream_id, stream_type, version, event_id, event_type, type_version, occurred_at, request_id, correlation_id, actor_type, actor_id, payload) " +
        "VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)";

      let v = version;
      for (const evt of req.events) {
        v += 1;
        await client.query(insertSql, [
          req.tenantId,
          req.streamId,
          req.streamType,
          v,
          randomUUID(),
          evt.eventType,
          evt.typeVersion,
          evt.occurredAt,
          req.requestId,
          req.correlationId,
          req.actor.type,
          req.actor.id,
          JSON.stringify(evt.payload)
        ]);
      }

      await client.query("COMMIT");
    } catch (err) {
      await this.safeRollback(client);
      throw err;
    } finally {
      client.release();
    }
  }

  async loadStream(tenantId: string, streamId: string): Promise<readonly StoredEvent[]> {
    const result = await this.pool.query(
      "SELECT * FROM events WHERE tenant_id = $1 AND stream_id = $2 ORDER BY version ASC",
      [tenantId, streamId]
    );

    const out: StoredEvent[] = [];
    for (const row of result.rows) {
      const payload = typeof row.payload === "string" ? JSON.parse(row.payload) : row.payload;
      const validation = validateEventPayload(this.registry, row.event_type, row.type_version, payload);
      if (!validation.ok) {
        throw new Error(`Event payload invalid for ${row.event_type} v${row.type_version}`);
      }
      out.push(Object.freeze({
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
        payload: validation.value
      }));
    }

    return Object.freeze(out);
  }

  private async safeRollback(client: { query: (sql: string) => Promise<unknown> }) {
    try {
      await client.query("ROLLBACK");
    } catch {
      return;
    }
  }
}
