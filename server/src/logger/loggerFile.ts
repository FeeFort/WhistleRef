import { appendFile, mkdir, readdir, stat, unlink } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { prepareLogRecord } from "./loggerData.js";
import type { FileLoggingOptions, LogFileSink, LogRecord } from "../types/index.js";

const activeFiles = new Set<string>();

function queuedSink(write: (record: LogRecord) => Promise<void>): LogFileSink {
  let pending = Promise.resolve();
  let disabled = false;
  const sink: LogFileSink = (record) => {
    if (disabled) return;
    pending = pending
      .then(async () => {
        if (!disabled) await write(record);
      })
      .catch((error) => {
        disabled = true;
        process.stderr.write(`File logging disabled: ${String(error)}\n`);
      });
  };
  sink.flush = async () => {
    await pending;
  };
  return sink;
}

function serialize(record: LogRecord): string {
  return JSON.stringify(prepareLogRecord(record, "TRACE")) + "\n";
}

export function createJsonFileSink(filePath: string): LogFileSink {
  return queuedSink(async (record) => {
    await appendFile(filePath, serialize(record), { encoding: "utf8", mode: 0o600 });
  });
}

export function createRuntimeFileSink(options: FileLoggingOptions): LogFileSink | undefined {
  if (!options.enabled) return undefined;
  let current = "";
  let date = "";
  let bytes = 0;
  const maximum = options.maxDirectoryBytes ?? 100 * 1024 * 1024;
  async function cleanup(): Promise<void> {
    const files = [];
    for (const name of await readdir(options.directory)) {
      if (!/^whistleref-.*\.jsonl$/.test(name)) continue;
      const file = path.join(options.directory, name);
      const info = await stat(file);
      if (info.isFile()) files.push({ file, size: info.size, modified: info.mtimeMs });
    }
    files.sort((a, b) => a.modified - b.modified);
    let total = files.reduce((sum, file) => sum + file.size, 0);
    for (const file of files) {
      if (activeFiles.has(file.file)) continue;
      const expired = options.retentionDays !== undefined && Date.now() - file.modified > options.retentionDays * 86400000;
      if (!expired && total <= maximum) continue;
      await unlink(file.file);
      total -= file.size;
    }
  }
  return queuedSink(async (record) => {
    const line = serialize(record);
    const size = Buffer.byteLength(line);
    const nextDate = record.timestamp.toISOString().slice(0, 10);
    if (!current || nextDate !== date || (options.maxFileBytes !== undefined && bytes > 0 && bytes + size > options.maxFileBytes)) {
      activeFiles.delete(current);
      await mkdir(options.directory, { recursive: true, mode: 0o700 });
      current = path.join(options.directory, `whistleref-${nextDate}-${process.pid}-${randomUUID()}.jsonl`);
      activeFiles.add(current);
      date = nextDate;
      bytes = 0;
    }
    await appendFile(current, line, { encoding: "utf8", mode: 0o600 });
    bytes += size;
    await cleanup();
  });
}
