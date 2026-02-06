import type { z } from "zod";
import type { Result } from "@civis/kernel";
import { Ok, Err } from "@civis/kernel";

export type EventSchemaRegistry = Readonly<{
  get(eventType: string, typeVersion: number): z.ZodTypeAny | undefined;
}>;

export type EventValidationError = Readonly<{
  type: "EVENT_VALIDATION_ERROR";
  message: string;
  eventType: string;
  typeVersion: number;
}>;

export function validateEventPayload(
  registry: EventSchemaRegistry,
  eventType: string,
  typeVersion: number,
  payload: unknown
): Result<unknown, EventValidationError> {
  const schema = registry.get(eventType, typeVersion);
  if (!schema) return Ok(payload);
  const parsed = schema.safeParse(payload);
  if (parsed.success) return Ok(Object.freeze(parsed.data));
  return Err(Object.freeze({
    type: "EVENT_VALIDATION_ERROR",
    message: "Event payload failed validation",
    eventType,
    typeVersion
  }));
}
