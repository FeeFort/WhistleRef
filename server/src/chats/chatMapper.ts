import type { Chat, ChatWire, Message, MessageWire } from "../types/index.js";

export function toChatWire(chat: Chat, messageCount: number): ChatWire {
  return {
    id: chat.id,
    platform: chat.platform,
    externalId: chat.external_id,
    title: chat.title,
    status: chat.status,
    createdAt: chat.created_at,
    closedAt: chat.closed_at,
    archivedAt: chat.archived_at,
    messageCount,
  };
}

export function toMessageWire(message: Message): MessageWire {
  return { id: message.id, chatId: message.chat_id, kind: message.kind, author: message.author, senderId: message.sender_id, text: message.text, createdAt: message.created_at };
}
