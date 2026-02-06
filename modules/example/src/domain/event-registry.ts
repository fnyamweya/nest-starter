import type { EventSchemaRegistry } from "@civis/event-sourcing";
import { ExampleCreatedSchema, ExampleCreatedType } from "./example.events.js";

const registry = new Map<string, Map<number, unknown>>([
  [ExampleCreatedType, new Map([[1, ExampleCreatedSchema]])]
]);

export const exampleEventRegistry: EventSchemaRegistry = Object.freeze({
  get(eventType: string, typeVersion: number) {
    return registry.get(eventType)?.get(typeVersion) as any;
  }
});
