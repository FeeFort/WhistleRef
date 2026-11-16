import type { DatabaseSync } from "node:sqlite";
import { findMessageByExternalId, getLatestMessage, insertMessage, insertMessages } from "../db/messagesRepo.js";
import type { NewMessage, RecordMessageInput, RecordMessageResult } from "../types/index.js";

type Clock = () => string;

export class MessageRecorder {
  constructor(
    private readonly database: DatabaseSync,
    private readonly now: Clock = () => new Date().toISOString(),
  ) {}

  recordMessage(chatId: number, input: RecordMessageInput): RecordMessageResult {
    const stored: NewMessage = {
      chat_id: chatId,
      external_id: input.externalId ?? null,
      author: input.author,
      sender_id: input.senderId ?? null,
      text: input.text,
      kind: input.kind,
      created_at: input.createdAt ?? this.now(),
    };
    const inserted = insertMessage(this.database, stored) === 1;
    const message = inserted
      ? input.externalId === undefined
        ? getLatestMessage(this.database, chatId)
        : findMessageByExternalId(this.database, chatId, input.externalId)
      : input.externalId === undefined
        ? undefined
        : findMessageByExternalId(this.database, chatId, input.externalId);
    if (!message) throw new Error("Inserted or duplicate message could not be retrieved");
    return { inserted, message };
  }

  recordEvent(chatId: number, text: string): RecordMessageResult {
    return this.recordMessage(chatId, { author: "WhistleBot", text, kind: "whistlebot" });
  }

  recordMessages(chatId: number, inputs: readonly RecordMessageInput[]): number {
    const rows: NewMessage[] = inputs.map((input) => ({
      chat_id: chatId,
      external_id: input.externalId ?? null,
      author: input.author,
      sender_id: input.senderId ?? null,
      text: input.text,
      kind: input.kind,
      created_at: input.createdAt ?? this.now(),
    }));
    return insertMessages(this.database, rows);
  }
}

export function createMessageRecorder(database: DatabaseSync, now?: Clock): MessageRecorder {
  return new MessageRecorder(database, now);
}
