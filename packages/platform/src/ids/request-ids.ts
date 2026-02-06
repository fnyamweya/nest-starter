import { randomUUID } from "crypto";

export function ensureRequestId(value: string | undefined): string {
  if (value && value.trim().length > 0) return value;
  return randomUUID();
}

export function ensureCorrelationId(value: string | undefined, fallback: string): string {
  if (value && value.trim().length > 0) return value;
  return fallback;
}
