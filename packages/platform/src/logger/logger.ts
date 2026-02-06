export type LogLevel = "debug" | "info" | "warn" | "error";

export type LogEntry = Readonly<{
  level: LogLevel;
  message: string;
  context?: Readonly<Record<string, unknown>>;
}>;

export interface Logger {
  log(entry: LogEntry): void;
}

const LEVEL_PRIORITY: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40
};

export class ConsoleLogger implements Logger {
  constructor(private readonly minLevel: LogLevel = "info") {}

  log(entry: LogEntry): void {
    if (LEVEL_PRIORITY[entry.level] < LEVEL_PRIORITY[this.minLevel]) return;
    const payload = entry.context ? { ...entry.context } : undefined;
    const line = payload ? { level: entry.level, message: entry.message, ...payload } : entry;
    // eslint-disable-next-line no-console
    console.log(JSON.stringify(line));
  }
}
