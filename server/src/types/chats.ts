import type { Chat, ChatPlatform, Message, MessageKind } from "./db.js";
import type { LobbyStateDocument } from "../chats/lobbyState.js";
import type { ChatService } from "../chats/chatService.js";
import type { ConnectionState } from "./irc.js";
import type { LobbyState } from "./bancho-bot.js";

export type ChatClock = () => string;

export interface ChatServiceCallbacks {
  onChatUpdated?: (chat: ChatWire) => void;
  onChatDeleted?: (chatId: number) => void;
  onMessage?: (message: MessageWire) => void;
  onSettingsUpdated?: (settings: ChatSettings) => void;
  onLobbyStateUpdated?: (chatId: number, lobbyState: LobbyStateDocument) => void;
}

export interface PlatformAdapter {
  detach(chat: ChatWire): void;
}

export interface StableIrcAdapter {
  joinChannel(channel: string): void;
  leaveChannel(channel: string): void;
  isReady(): boolean;
  ownNick(): string | null;
}

export interface StableChatLogger {
  debug(message: string, fields?: Record<string, unknown>): void;
  warn(message: string, fields?: Record<string, unknown>): void;
}

export interface StableChatBridgeOptions {
  chatService: ChatService;
  irc: StableIrcAdapter;
  setTimeout?: typeof setTimeout;
  clearTimeout?: typeof clearTimeout;
  clock?: ChatClock;
  logger: StableChatLogger;
}

export interface PendingStableChatRestore {
  chatId: number;
  timer: ReturnType<typeof setTimeout>;
}

export interface PendingStableSettingsResponse {
  remainingPlayers: number | null;
}

export interface ChatWire {
  id: number;
  platform: ChatPlatform;
  externalId: number;
  title: string;
  status: Chat["status"];
  createdAt: string;
  closedAt: string | null;
  archivedAt: string | null;
  messageCount: number;
}
export interface MessageWire {
  id: number;
  chatId: number;
  kind: MessageKind;
  author: string | null;
  senderId: number | null;
  text: string;
  createdAt: string;
  hidden?: boolean;
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
