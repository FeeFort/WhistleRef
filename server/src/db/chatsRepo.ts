import type { DatabaseSync } from "node:sqlite";
import type { Chat, ChatPlatform, ChatStatus, CreateChat } from "../types/index.js";

export function createChat(database: DatabaseSync, chat: CreateChat): Chat {
  const result = database
    .prepare("INSERT INTO chats (platform, external_id, title, status, created_at) VALUES (?, ?, ?, ?, ?)")
    .run(chat.platform, chat.external_id, chat.title, chat.status ?? "active", chat.created_at);
  return database.prepare("SELECT * FROM chats WHERE id = ?").get(Number(result.lastInsertRowid)) as unknown as Chat;
}

export function findChat(database: DatabaseSync, platform: ChatPlatform, externalId: number): Chat | undefined {
  return database.prepare("SELECT * FROM chats WHERE platform = ? AND external_id = ?").get(platform, externalId) as unknown as Chat | undefined;
}

export function getChat(database: DatabaseSync, id: number): Chat | undefined {
  return database.prepare("SELECT * FROM chats WHERE id = ?").get(id) as unknown as Chat | undefined;
}

export function updateChatTitle(database: DatabaseSync, id: number, title: string): Chat | undefined {
  database.prepare("UPDATE chats SET title = ? WHERE id = ?").run(title, id);
  return getChat(database, id);
}

export function listChats(database: DatabaseSync, status?: ChatStatus): Chat[] {
  return (status ? database.prepare("SELECT * FROM chats WHERE status = ? ORDER BY id").all(status) : database.prepare("SELECT * FROM chats ORDER BY id").all()) as unknown as Chat[];
}

export function setChatStatus(database: DatabaseSync, id: number, status: ChatStatus, timestamp: string): void {
  database
    .prepare(
      `UPDATE chats SET status = ?,
    closed_at = CASE WHEN ? = 'closed' THEN ? WHEN ? = 'active' THEN NULL ELSE closed_at END,
    archived_at = CASE WHEN ? = 'archived' THEN ? WHEN ? = 'active' THEN NULL ELSE archived_at END
    WHERE id = ?`,
    )
    .run(status, status, timestamp, status, status, timestamp, status, id);
}

export function archiveClosedChats(database: DatabaseSync, timestamp: string): number {
  return Number(database.prepare("UPDATE chats SET status = 'archived', archived_at = ? WHERE status = 'closed'").run(timestamp).changes);
}

export function readLobbyState<T = unknown>(database: DatabaseSync, id: number): T | null {
  const row = database.prepare("SELECT lobby_state FROM chats WHERE id = ?").get(id) as { lobby_state: string | null } | undefined;
  return row?.lobby_state == null ? null : (JSON.parse(row.lobby_state) as T);
}

export function writeLobbyState(database: DatabaseSync, id: number, state: unknown | null): void {
  database.prepare("UPDATE chats SET lobby_state = ? WHERE id = ?").run(state == null ? null : JSON.stringify(state), id);
}
