export type StreamId = string & { readonly __brand: "StreamId" };
export type StreamType = string & { readonly __brand: "StreamType" };

export type EventRecord = Readonly<{
  eventType: string;
  typeVersion: number;
  occurredAt: string;
  payload: unknown;
}>;

export type AppendRequest<E extends EventRecord> = Readonly<{
  tenantId: string;
  streamId: StreamId;
  streamType: StreamType;
  expectedVersion: number;
  events: readonly E[];
  requestId: string;
  correlationId: string;
  actor: Readonly<{ type: string; id: string }>;
}>;

export type StoredEvent = Readonly<{
  tenantId: string;
  streamId: string;
  streamType: string;
  version: number;
  eventId: string;
  eventType: string;
  typeVersion: number;
  occurredAt: string;
  requestId: string;
  correlationId: string;
  actorType: string;
  actorId: string;
  payload: unknown;
}>;

export interface EventStore {
  append<E extends EventRecord>(req: AppendRequest<E>): Promise<void>;
  loadStream(tenantId: string, streamId: StreamId): Promise<readonly StoredEvent[]>;
}

export class EventStoreConflict extends Error {
  readonly type = "CONFLICT" as const;
  constructor(message: string) {
    super(message);
  }
}
