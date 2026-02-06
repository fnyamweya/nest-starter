import type { Logger, LogEntry } from "./logger.js";

const DISALLOWED_KEYS = new Set([
  "password",
  "token",
  "secret",
  "ssn",
  "email",
  "phone",
  "address",
  "ip",
  "deviceFingerprint"
]);

export class SafeLogger implements Logger {
  constructor(private readonly inner: Logger) {}

  log(entry: LogEntry): void {
    if (entry.context && this.hasUnsafeKeys(entry.context)) {
      const safe: LogEntry = {
        level: entry.level,
        message: "Unsafe log fields rejected",
        context: Object.freeze({
          originalMessage: entry.message
        })
      };
      this.inner.log(safe);
      return;
    }
    this.inner.log(entry);
  }

  private hasUnsafeKeys(context: Readonly<Record<string, unknown>>): boolean {
    return Object.keys(context).some((key) => DISALLOWED_KEYS.has(key));
  }
}
