import { randomUUID } from "crypto";
import { Ok, Err, type Result } from "@civis/kernel/types";
import type { ExampleDeps } from "./ports.js";
import { decideCreateExample, applyEvent } from "../domain/example.aggregate.js";
import type { ExampleDecisionError, ExampleState } from "../domain/example.aggregate.js";
import type { ExampleEvent } from "../domain/example.events.js";

export type CreateExampleInput = Readonly<{
  tenantId: string;
  name: string;
  createdBy: string;
  correlationId: string;
  requestId: string;
}>;

export type CreateExampleError = ExampleDecisionError | Readonly<{ type: "INTERNAL_ERROR"; message: string }>;

export async function createExample(
  input: CreateExampleInput,
  deps: ExampleDeps
): Promise<Result<Readonly<{ exampleId: string }>, CreateExampleError>> {
  const exampleId = randomUUID();
  const streamId = exampleId as any;

  let state: ExampleState | null = null;
  let version = 0;

  try {
    const events = await deps.eventStore.loadStream(input.tenantId, streamId);
    for (const e of events) {
      const evt: ExampleEvent = Object.freeze({
        eventType: e.eventType as ExampleEvent["eventType"],
        typeVersion: e.typeVersion as ExampleEvent["typeVersion"],
        occurredAt: e.occurredAt,
        payload: e.payload as ExampleEvent["payload"]
      });
      state = applyEvent(state, evt);
      version = e.version;
    }
  } catch {
    return Err({ type: "INTERNAL_ERROR", message: "Failed to load stream" });
  }

  const decision = decideCreateExample(state, {
    exampleId,
    name: input.name,
    createdBy: input.createdBy,
    occurredAt: deps.clock.now()
  });

  if (!decision.ok) return Err(decision.error);

  try {
    await deps.eventStore.append({
      tenantId: input.tenantId,
      streamId: streamId as any,
      streamType: "example" as any,
      expectedVersion: version,
      events: [decision.value],
      requestId: input.requestId,
      correlationId: input.correlationId,
      actor: { type: "user", id: input.createdBy }
    });
  } catch (err) {
    if ((err as { type?: string }).type === "CONFLICT") {
      return Err({ type: "CONFLICT", message: "Expected version mismatch" });
    }
    return Err({ type: "INTERNAL_ERROR", message: "Failed to append event" });
  }

  return Ok(Object.freeze({ exampleId }));
}
