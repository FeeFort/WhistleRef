import type { DatabaseSync } from "node:sqlite";
import type { ChatSettings } from "../types/index.js";

export function getSetting<T = unknown>(database: DatabaseSync, key: string): T | undefined {
  const row = database.prepare("SELECT value FROM settings WHERE key = ?").get(key) as { value: string } | undefined;
  return row ? (JSON.parse(row.value) as T) : undefined;
}

export function getAllSettings(database: DatabaseSync): ChatSettings {
  const rows = database.prepare("SELECT key, value FROM settings ORDER BY key").all() as { key: string; value: string }[];
  return Object.fromEntries(rows.map(({ key, value }) => [key, JSON.parse(value)]));
}

export function setSetting(database: DatabaseSync, key: string, value: unknown): void {
  database.prepare("INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").run(key, JSON.stringify(value));
}

export function deleteSetting(database: DatabaseSync, key: string): boolean {
  return Number(database.prepare("DELETE FROM settings WHERE key = ?").run(key).changes) > 0;
}
