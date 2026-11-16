import type { DatabaseSync } from "node:sqlite";
import type { Message, NewMessage } from "../types/index.js";

function performInsert(database: DatabaseSync, message: NewMessage): number {
  const result = database
    .prepare("INSERT INTO messages (chat_id, external_id, author, sender_id, text, created_at, kind) VALUES (?, ?, ?, ?, ?, ?, ?) ON CONFLICT(chat_id, external_id) DO NOTHING")
    .run(message.chat_id, message.external_id, message.author, message.sender_id, message.text, message.created_at, message.kind);
  return Number(result.changes);
}

export function insertMessage(database: DatabaseSync, message: NewMessage): number {
  return performInsert(database, message);
}

export function insertMessages(database: DatabaseSync, messages: readonly NewMessage[]): number {
  database.exec("BEGIN");
  try {
    const inserted = messages.reduce((count, message) => count + performInsert(database, message), 0);
    database.exec("COMMIT");
    return inserted;
  } catch (error) {
    database.exec("ROLLBACK");
    throw error;
  }
}

export function getMessagesPage(database: DatabaseSync, chatId: number, limit: number, beforeId?: number): Message[] {
  const rows =
    beforeId === undefined
      ? database.prepare("SELECT * FROM messages WHERE chat_id = ? ORDER BY id DESC LIMIT ?").all(chatId, limit)
      : database.prepare("SELECT * FROM messages WHERE chat_id = ? AND id < ? ORDER BY id DESC LIMIT ?").all(chatId, beforeId, limit);
  return (rows as unknown as Message[]).reverse();
}

export function getMessage(database: DatabaseSync, id: number): Message | undefined {
  return database.prepare("SELECT * FROM messages WHERE id = ?").get(id) as unknown as Message | undefined;
}

export function findMessageByExternalId(database: DatabaseSync, chatId: number, externalId: number): Message | undefined {
  return database.prepare("SELECT * FROM messages WHERE chat_id = ? AND external_id = ?").get(chatId, externalId) as unknown as Message | undefined;
}

export function getLatestMessage(database: DatabaseSync, chatId: number): Message | undefined {
  return database.prepare("SELECT * FROM messages WHERE chat_id = ? ORDER BY id DESC LIMIT 1").get(chatId) as unknown as Message | undefined;
}

export function getHighestExternalId(database: DatabaseSync, chatId: number): number | null {
  const row = database.prepare("SELECT MAX(external_id) AS highest FROM messages WHERE chat_id = ?").get(chatId) as { highest: number | null };
  return row.highest;
}

export function countMessages(database: DatabaseSync, chatId: number): number {
  return Number((database.prepare("SELECT COUNT(*) AS count FROM messages WHERE chat_id = ?").get(chatId) as { count: number }).count);
}
