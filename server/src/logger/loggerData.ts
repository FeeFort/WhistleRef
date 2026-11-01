import { stripVTControlCharacters } from "node:util";
import type { LogLevel, LogRecord } from "../types/index.js";

function cleanText(text: string): string {
  return stripVTControlCharacters(text)
    .replace(/\bBearer\s+\S+/gi, "Bearer [redacted]")
    .replace(/\bPASS\s+[^\r\n]+/gi, "PASS [redacted]")
    .replace(/(!mp password)\s+[^\r\n]+/gi, "$1 [redacted]");
}

function prepare(value: unknown, trace: boolean, seen = new WeakSet<object>()): unknown {
  if (typeof value === "string") return cleanText(value);
  if (typeof value === "bigint") return String(value);
  if (value instanceof Date) return value.toISOString();
  if (!value || typeof value !== "object") return value;
  if (seen.has(value)) return "[Circular]";
  seen.add(value);
  try {
    if (Array.isArray(value)) return value.map((item) => prepare(item, trace, seen));
    const source: Record<string, unknown> = { ...value };
    if (value instanceof Error) {
      source.name = value.name;
      source.message = value.message;
      if (trace) source.stack = value.stack;
      if (value.cause !== undefined) source.cause = value.cause;
      if (value instanceof AggregateError) source.errors = value.errors;
    }
    return Object.fromEntries(
      Object.entries(source)
        .filter(([key]) => trace || key !== "stack")
        .map(([key, item]) => [key, /password|token|secret|authorization|^code$/i.test(key) && key !== "code" ? "[redacted]" : prepare(item, trace, seen)]),
    );
  } finally {
    seen.delete(value);
  }
}

export function prepareLogRecord(record: LogRecord, level: LogLevel): LogRecord {
  return { ...record, message: cleanText(record.message), fields: prepare(record.fields, level === "TRACE") as LogRecord["fields"] };
}
