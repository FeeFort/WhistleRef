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

export function listChatsWithMessageCounts(database: DatabaseSync, statuses?: readonly ChatStatus[]): Array<{ chat: Chat; messageCount: number }> {
  if (statuses?.length === 0) return [];
  const statusFilter = statuses ? ` WHERE chats.status IN (${statuses.map(() => "?").join(", ")})` : "";
  const rows = database
    .prepare(
      `SELECT chats.*, COUNT(messages.id) AS message_count
       FROM chats
       LEFT JOIN messages ON messages.chat_id = chats.id
       ${statusFilter}
       GROUP BY chats.id
       ORDER BY chats.id`,
    )
    .all(...(statuses ?? [])) as unknown as Array<Chat & { message_count: number }>;
  return rows.map(({ message_count, ...chat }) => ({ chat, messageCount: Number(message_count) }));
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

export function deleteChats(database: DatabaseSync, ids: readonly number[]): number[] {
  const deleted: number[] = [];
  const statement = database.prepare("DELETE FROM chats WHERE id = ? AND status = 'archived'");
  for (const id of ids) if (Number(statement.run(id).changes) > 0) deleted.push(id);
  return deleted;
}

export function deleteArchivedOlderThan(database: DatabaseSync, cutoffIso: string): number[] {
  const ids = (database.prepare("SELECT id FROM chats WHERE status = 'archived' AND archived_at < ? ORDER BY id").all(cutoffIso) as { id: number }[]).map((row) => row.id);
  return deleteChats(database, ids);
}

export function readLobbyState<T = unknown>(database: DatabaseSync, id: number): T | null {
  const row = database.prepare("SELECT lobby_state FROM chats WHERE id = ?").get(id) as { lobby_state: string | null } | undefined;
  return row?.lobby_state == null ? null : (JSON.parse(row.lobby_state) as T);
}

export function writeLobbyState(database: DatabaseSync, id: number, state: unknown | null): void {
  database.prepare("UPDATE chats SET lobby_state = ? WHERE id = ?").run(state == null ? null : JSON.stringify(state), id);
}
