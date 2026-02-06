import type { EventStore } from "@civis/event-sourcing";

export type Clock = Readonly<{ now: () => string }>;

export type ExampleDeps = Readonly<{
  eventStore: EventStore;
  clock: Clock;
}>;
