import type { Chat, ChatPlatform, Message, MessageKind } from "./db.js";

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
