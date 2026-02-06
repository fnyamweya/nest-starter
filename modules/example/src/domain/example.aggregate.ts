import { deepFreeze } from "@civis/kernel/immutable";
import { Ok, Err, type Result } from "@civis/kernel/types";
import type { ExampleEvent } from "./example.events.js";
import { ExampleCreatedType } from "./example.events.js";

export type ExampleState = Readonly<{
  exampleId: string;
  name: string;
  createdAt: string;
}>;

export type ExampleDecisionError = Readonly<{ type: "CONFLICT"; message: string }>;

export function applyEvent(state: ExampleState | null, event: ExampleEvent): ExampleState | null {
  switch (event.eventType) {
    case ExampleCreatedType:
      return deepFreeze({
        exampleId: event.payload.exampleId,
        name: event.payload.name,
        createdAt: event.occurredAt
      });
    default:
      return state;
  }
}

export function decideCreateExample(
  state: ExampleState | null,
  data: Readonly<{ exampleId: string; name: string; createdBy: string; occurredAt: string }>
): Result<ExampleEvent, ExampleDecisionError> {
  if (state) {
    return Err({ type: "CONFLICT", message: "Example already exists" });
  }

  return Ok(Object.freeze({
    eventType: ExampleCreatedType,
    typeVersion: 1,
    occurredAt: data.occurredAt,
    payload: Object.freeze({
      exampleId: data.exampleId,
      name: data.name,
      createdBy: data.createdBy
    })
  }));
}
