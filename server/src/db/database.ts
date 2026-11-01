import { DatabaseSync } from "node:sqlite";
import { ensureDatabasePaths } from "./paths.js";
import { runMigrations } from "./migrations.js";

export function openDatabase(filename?: string): DatabaseSync {
  const database = new DatabaseSync(filename ?? ensureDatabasePaths().databaseFile);
  try {
    database.exec("PRAGMA journal_mode = WAL");
    database.exec("PRAGMA synchronous = NORMAL");
    database.exec("PRAGMA foreign_keys = ON");
    database.exec("PRAGMA busy_timeout = 5000");
    runMigrations(database);
    return database;
  } catch (error) {
    database.close();
    throw error;
  }
}

export function closeDatabase(database: DatabaseSync): void {
  database.close();
}
