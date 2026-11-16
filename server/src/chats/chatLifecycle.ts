import type { DatabaseSync } from "node:sqlite";
import { archiveClosedChats, createChat, findChat, getChat, listChats, setChatStatus, updateChatTitle } from "../db/chatsRepo.js";
import type { Chat, ChatStatus, OpenOrCreateChatInput, StartupRecoveryResult, ChatTransitionResult } from "../types/index.js";

type Clock = () => string;

// Only these status changes are allowed: active -> closed/archived, closed -> archived, archived -> active.
const allowedTransitions: Readonly<Partial<Record<ChatStatus, readonly ChatStatus[]>>> = {
  active: ["closed", "archived"],
  closed: ["archived"],
  archived: ["active"],
};

export class ChatLifecycle {
  constructor(
    private readonly database: DatabaseSync,
    private readonly now: Clock = () => new Date().toISOString(),
  ) {}

  openOrCreateChat(input: OpenOrCreateChatInput): ChatTransitionResult {
    const found = findChat(this.database, input.platform, input.externalId);
    if (!found) {
      return {
        chat: createChat(this.database, {
          platform: input.platform,
          external_id: input.externalId,
          title: input.title,
          created_at: this.now(),
        }),
        changed: true,
      };
    }
    if (found.status === "archived") return this.transition(found.id, "active");
    return { chat: found, changed: false };
  }

  markRoomClosed(chatId: number): ChatTransitionResult {
    return this.transition(chatId, "closed");
  }

  archiveChat(chatId: number): ChatTransitionResult {
    return this.transition(chatId, "archived");
  }

  rejoinChat(chatId: number): ChatTransitionResult {
    return this.transition(chatId, "active");
  }

  markReconnectFailed(chatId: number): ChatTransitionResult {
    return this.transition(chatId, "closed");
  }

  updateTitle(chatId: number, title: string): ChatTransitionResult {
    const before = this.requireChat(chatId);
    const chat = updateChatTitle(this.database, chatId, title);
    if (!chat) throw new Error(`Chat ${chatId} not found`);
    return { chat, changed: before.title !== title };
  }

  startupRecovery(): StartupRecoveryResult {
    const archivedCount = archiveClosedChats(this.database, this.now());
    return { archivedCount, activeChats: listChats(this.database, "active") };
  }

  gracefulShutdown(): number {
    return archiveClosedChats(this.database, this.now());
  }

  private transition(chatId: number, next: ChatStatus): ChatTransitionResult {
    const chat = this.requireChat(chatId);
    if (!allowedTransitions[chat.status]?.includes(next)) return { chat, changed: false };
    setChatStatus(this.database, chatId, next, this.now());
    return { chat: this.requireChat(chatId), changed: true };
  }

  private requireChat(chatId: number): Chat {
    const chat = getChat(this.database, chatId);
    if (!chat) throw new Error(`Chat ${chatId} not found`);
    return chat;
  }
}

export function createChatLifecycle(database: DatabaseSync, now?: Clock): ChatLifecycle {
  return new ChatLifecycle(database, now);
}
