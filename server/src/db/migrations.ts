import type { DatabaseSync } from "node:sqlite";

export const SCHEMA_VERSION = 1;

const migrations: ReadonlyArray<(database: DatabaseSync) => void> = [
  (database) => {
    database.exec(`
      CREATE TABLE chats (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        platform TEXT NOT NULL CHECK (platform IN ('stable', 'lazer')),
        external_id INTEGER NOT NULL,
        title TEXT NOT NULL,
        status TEXT NOT NULL CHECK (status IN ('active', 'closed', 'archived')),
        created_at TEXT NOT NULL,
        closed_at TEXT NULL,
        archived_at TEXT NULL,
        lobby_state TEXT NULL,
        UNIQUE (platform, external_id)
      );
      CREATE TABLE messages (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        chat_id INTEGER NOT NULL REFERENCES chats(id) ON DELETE CASCADE,
        external_id INTEGER NULL,
        author TEXT NULL,
        sender_id INTEGER NULL,
        text TEXT NOT NULL,
        created_at TEXT NOT NULL,
        kind TEXT NOT NULL CHECK (kind IN ('message', 'action', 'system', 'roll', 'service')),
        UNIQUE (chat_id, external_id)
      );
      CREATE INDEX messages_chat_id_id ON messages (chat_id, id);
    `);
  },
];

export function runMigrations(database: DatabaseSync): void {
  const current = Number(database.prepare("PRAGMA user_version").get()?.user_version ?? 0);
  if (current > SCHEMA_VERSION) throw new Error(`Database schema version ${current} is newer than supported version ${SCHEMA_VERSION}`);

  for (let version = current + 1; version <= SCHEMA_VERSION; version++) {
    database.exec("BEGIN");
    try {
      migrations[version - 1](database);
      database.exec(`PRAGMA user_version = ${version}`);
      database.exec("COMMIT");
    } catch (error) {
      database.exec("ROLLBACK");
      throw error;
    }
  }
}
