import type { Chat, ChatPlatform, Message, MessageKind } from "./db.js";

export interface ChatWire {
  id: number;
  platform: ChatPlatform;
  externalId: number;
  title: string;
  status: Chat["status"];
  createdAt: string;
  closedAt: string | null;
  archivedAt: string | null;
}
export interface MessageWire {
  id: number;
  chatId: number;
  kind: MessageKind;
  author: string | null;
  senderId: number | null;
  text: string;
  createdAt: string;
}
export type ChatSettings = Record<string, unknown>;
export interface ChatDeleteResult {
  deleted: number[];
  skipped: number[];
}

export interface ChatTransitionResult {
  chat: Chat;
  changed: boolean;
}

export interface StartupRecoveryResult {
  archivedCount: number;
  activeChats: Chat[];
}

export interface OpenOrCreateChatInput {
  platform: ChatPlatform;
  externalId: number;
  title: string;
}

export interface RecordMessageInput {
  externalId?: number;
  author: string | null;
  senderId?: number | null;
  text: string;
  kind: MessageKind;
  createdAt?: string;
}

export interface RecordMessageResult {
  inserted: boolean;
  message: Message;
}
