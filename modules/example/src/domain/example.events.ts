import { z } from "zod";
import type { EventRecord } from "@civis/event-sourcing";

export const ExampleCreatedType = "example.created" as const;

export const ExampleCreatedSchema = z.object({
  exampleId: z.string().min(1),
  name: z.string().min(1),
  createdBy: z.string().min(1)
});

export type ExampleCreated = Readonly<{
  eventType: typeof ExampleCreatedType;
  typeVersion: 1;
  occurredAt: string;
  payload: z.infer<typeof ExampleCreatedSchema>;
}>;

export type ExampleEvent = ExampleCreated;

export function asEventRecord(event: ExampleEvent): EventRecord {
  return event;
}
