import { inspect, stripVTControlCharacters } from "node:util";
import stringWidth from "string-width";
import type { LogFormatOptions, LogLevel, LogRecord, StartupBannerInfo } from "../types.js";

const icons: Record<LogLevel, string> = { CRITICAL: "‼", ERROR: "✖", WARN: "▲", INFO: "ℹ", DEBUG: "■", TRACE: "❯" };
const levelColors: Record<LogLevel, string> = { CRITICAL: "1;91", ERROR: "31", WARN: "38;5;208", INFO: "34", DEBUG: "38;5;153", TRACE: "38;5;248" };
const segmenter = new Intl.Segmenter("en", { granularity: "grapheme" });

// Remove terminal controls before measuring or coloring text
function clean(text: string): string {
  return stripVTControlCharacters(text)
    .replace(/\r\n?/g, "\n")
    .replace(/\t/g, "    ")
    .replace(/[\p{Cc}\p{Cf}]/gu, (character) => (character === "\n" || character === "\u200d" ? character : ""));
}

function paint(text: string, code: string, enabled: boolean): string {
  return enabled ? `\u001b[${code}m${text}\u001b[0m` : text;
}

function pad(text: string, width: number): string {
  return text + " ".repeat(Math.max(0, width - stringWidth(text)));
}

// Split oversized words without splitting Unicode graphemes
function splitWord(word: string, width: number): string[] {
  const parts: string[] = [];
  let part = "";
  for (const { segment } of segmenter.segment(word)) {
    if (part && stringWidth(part + segment) > width) {
      parts.push(part);
      part = "";
    }
    part += segment;
  }
  if (part) parts.push(part);
  return parts;
}

function wrap(text: string, width: number): string[] {
  return text.split("\n").flatMap((line) => {
    if (stringWidth(line) <= width) return [line];
    const lines: string[] = [];
    let current = "";
    for (const word of line.trim().split(/ +/)) {
      if (current && stringWidth(`${current} ${word}`) <= width) {
        current += ` ${word}`;
        continue;
      }
      if (current) lines.push(current);
      const parts = splitWord(word, width);
      current = parts.pop() ?? "";
      lines.push(...parts);
    }
    lines.push(current);
    return lines;
  });
}

function errorDetails(value: unknown, seen = new WeakSet<object>()): unknown {
  if (value === null || typeof value !== "object") return value;
  if (seen.has(value)) return "[Circular]";
  seen.add(value);
  try {
    if (value instanceof Error) {
      const details: Record<string, unknown> = { name: value.name, message: value.message };
      for (const [key, item] of Object.entries(value)) if (key !== "stack") details[key] = errorDetails(item, seen);
      if (value.cause !== undefined) details.cause = errorDetails(value.cause, seen);
      if (value instanceof AggregateError) details.errors = errorDetails(value.errors, seen);
      return details;
    }
    if (Array.isArray(value)) return value.map((item) => errorDetails(item, seen));
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, errorDetails(item, seen)]));
  } finally {
    seen.delete(value);
  }
}

function messageText(record: LogRecord, trace: boolean): string {
  const fields = Object.entries(record.fields).map(([key, value]) => {
    const formatted = typeof value === "string" ? value : inspect(trace ? value : errorDetails(value), { colors: false, compact: true, breakLength: Infinity });
    return `${key}=${formatted}`;
  });
  const operation = record.operation;
  const prefix = operation ? `${operation.phase === "start" ? ">" : "<"} #${operation.id} ` : "";
  const outcome = operation && operation.phase !== "start" ? (operation.phase === "failed" ? " FAILED" : " OK") : "";
  const duration = operation?.durationMs === undefined ? "" : ` duration=${operation.durationMs}ms`;
  return clean(prefix + record.message + outcome + (fields.length ? `  ${fields.join(" ")}` : "") + duration);
}

function formatBanner(info: StartupBannerInfo, options: LogFormatOptions): string {
  const colors = options.colors && options.isTTY;
  const columns = Math.max(1, Math.floor(options.columns || 80));
  const prefix = columns >= 4 ? `${paint("┃", "38;5;135", colors)} ` : "";
  const width = Math.max(1, columns - stringWidth(prefix));
  const brand = paint("Whistle", "1;38;5;135", colors) + paint("Ref", "1;37", colors);
  const rows = [`WhistleRef v${info.version}`, `Web UI     ${info.url}`, `Node.js    ${info.nodeVersion}`, `OS         ${info.os} / ${info.arch}`, `Logging    ${info.level}`];
  return (
    "\n" +
    rows
      .flatMap((row, index) =>
        wrap(clean(row), width).map((line) => {
          if (index === 0 && line.includes("WhistleRef")) {
            const [before, after] = line.split("WhistleRef");
            return prefix + paint(before, "90", colors) + brand + paint(after, "90", colors);
          }
          const labelLength = index === 0 ? 0 : 11;
          const label = line.slice(0, labelLength);
          const value = line.slice(labelLength);
          return prefix + paint(label, "90", colors) + paint(value, index === 1 ? "34" : index === 4 ? `1;${levelColors[info.level]}` : "90", colors);
        }),
      )
      .join("\n") +
    "\n\n"
  );
}

export function formatLogRecord(record: LogRecord, options: LogFormatOptions): string {
  return (record.level === "CRITICAL" ? "\n" : "") + formatRecord(record, options);
}

function formatRecord(record: LogRecord, options: LogFormatOptions): string {
  if (record.kind === "banner" && record.banner && options.isTTY) return formatBanner(record.banner, options);
  const colors = options.colors && options.isTTY;
  const time = `${record.timestamp.toTimeString().slice(0, 8)}.${String(record.timestamp.getMilliseconds()).padStart(3, "0")}`;
  const scope = clean(record.scope);
  const component = clean(record.component).replace(/\n/g, " ");
  const text = (record.kind === "separator" && options.isTTY ? "── " : "") + messageText(record, options.level === "TRACE");
  const columns = options.isTTY ? Math.max(1, Math.floor(options.columns || 80)) : undefined;
  const level = `${icons[record.level]} ${record.level}`;

  if (columns !== undefined && columns < 4)
    return (
      wrap(`${record.level} ${text}`, columns)
        .map((line) => paint(line, levelColors[record.level], colors))
        .join("\n") + "\n"
    );

  if (record.level === "CRITICAL" && columns !== undefined && columns >= 30) {
    const content = [...wrap(`[${time}] ${level} · ${scope} · ${component}`, columns - 4), ...wrap(text, columns - 4)];
    const width = Math.max(...content.map((line) => stringWidth(line)));
    const lines = [`┏${"━".repeat(width + 2)}┓`, ...content.map((line) => `┃ ${pad(line, width)} ┃`), `┗${"━".repeat(width + 2)}┛`];
    return lines.map((line) => paint(line, levelColors.CRITICAL, colors)).join("\n") + "\n";
  }

  const scopeColor = scope === "lazer" ? "95" : scope === "stable" ? "38;5;208" : "90";
  const context = `${scope}/${component}`;
  let prefix = `${paint(`[${time}]`, "90", colors)} ${paint(pad(level, 7), `1;${levelColors[record.level]}`, colors)} ${paint(scope, scopeColor, colors)}${paint(`/${component}`, "90", colors)}${" ".repeat(Math.max(0, 19 - stringWidth(context)))} `;
  // Shorten the prefix when little space remains for the message
  if (columns !== undefined && columns - stringWidth(prefix) - 2 < 12) prefix = `${paint(level, `1;${levelColors[record.level]}`, colors)} ${paint(scope, scopeColor, colors)} `;
  if (columns !== undefined && columns - stringWidth(prefix) - 2 < 4) prefix = "";
  const continuation = " ".repeat(stringWidth(prefix));
  const available = columns === undefined ? undefined : Math.max(2, columns - stringWidth(prefix) - 2);
  const lines = available === undefined ? text.split("\n") : wrap(text, available);
  return (
    lines
      .map((line, index) => {
        let content = paint(line, record.kind === "separator" ? `1;${levelColors[record.level]}` : levelColors[record.level], colors);
        if (record.kind === "separator" && options.isTTY && index === 0 && line.startsWith("── ")) {
          content = paint("── ", "90", colors) + paint(line.slice(3), `1;${levelColors[record.level]}`, colors);
        }
        if (record.kind === "separator" && available !== undefined && index === lines.length - 1) {
          const remaining = available - stringWidth(line);
          if (remaining > 1) content += paint(` ${"─".repeat(remaining - 1)}`, "90", colors);
        }
        return `${index === 0 ? prefix : continuation}${paint("┃", levelColors[record.level], colors)} ${content}`;
      })
      .join("\n") + "\n"
  );
}
