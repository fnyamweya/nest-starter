import { z } from "zod";
import { Ok, Err, type Result } from "../types/result.js";

export type Violation = Readonly<{ path: string; code: string; message: string }>;

export type ValidationError = Readonly<{
  type: "VALIDATION_ERROR";
  message: "Invalid request data";
  violations: readonly Violation[];
}>;

export function validate<T>(schema: z.ZodType<T>, input: unknown): Result<T, ValidationError> {
  const parsed = schema.safeParse(input);
  if (parsed.success) return Ok(Object.freeze(parsed.data));

  const violations = parsed.error.issues.map((i) =>
    Object.freeze({ path: i.path.join("."), code: i.code, message: i.message })
  );

  return Err(Object.freeze({
    type: "VALIDATION_ERROR",
    message: "Invalid request data",
    violations: Object.freeze(violations)
  }));
}
