import { createHash } from "crypto";

export function hashValue(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}
