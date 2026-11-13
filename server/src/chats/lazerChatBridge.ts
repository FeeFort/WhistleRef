import type { ChatService } from "./chatService.js";
import type { ChatWire, RecordMessageInput } from "../types/index.js";
import type { RoomJoinedResponse } from "../types/index.js";
import type { RoomRemovalReason } from "../lazer/roomManager.js";

export const LAZER_CHAT_TEXT = {
  roomClosed: "Room closed",
  kicked: (name: string) => `Kicked ${name}`,
  banned: (name: string) => `Banned ${name}`,
  moved: (name: string, slot: number | null | undefined) => `Moved ${name} to slot ${slot ?? "?"}`,
  locked: (locked: boolean) => (locked ? "Locked the room" : "Unlocked the room"),
  invited: (name: string) => `Invited ${name}`,
  refereeAdded: (name: string) => `Added ${name} as a referee`,
  refereeRemoved: (name: string) => `Removed ${name} as a referee`,
  settingsChanged: "Changed the room settings",
  playlistAdded: "Added a playlist item",
  playlistEdited: "Edited a playlist item",
  playlistRemoved: "Removed a playlist item",
  currentPlaylistEdited: "Changed the current playlist item",
  matchStarted: (countdown?: number | null) => `Started the match${countdown === undefined || countdown === null ? "" : ` with a ${countdown} second countdown`}`,
  countdownStopped: "Stopped the match countdown",
  matchAborted: "Aborted the match",
  roll: (name: string, result: number, max: number) => `${name} rolled ${result} points out of ${max}.`,
} as const;
let activeBridge: LazerChatBridge | null = null;
export function setLazerChatBridge(bridge: LazerChatBridge | null): void {
  activeBridge = bridge;
}
export function getLazerChatBridge(): LazerChatBridge | null {
  return activeBridge;
}
export interface LazerChatLogger {
  debug(message: string, fields?: Record<string, unknown>): void;
  warn(message: string, fields?: Record<string, unknown>): void;
}
export interface LazerRoomAdapter {
  waitForChatChannel(channelId: number): Promise<void>;
  removeRoom(roomId: number, options: { exclude: true; reason: "archived" }): void;
}
export interface LazerChatBridgeOptions {
  chatService: ChatService;
  fetchHistory(channelId: number, sinceMessageId: number): Promise<Record<string, unknown>[]>;
  resolveName(userId: number): Promise<string>;
  rememberName(userId: number, username: string): void;
  roomManager: LazerRoomAdapter;
  clock?: () => string;
  logger: LazerChatLogger;
}

export class LazerChatBridge {
  private readonly now: () => string;
  private readonly backfills = new Map<number, Promise<void>>();
  private readonly queued = new Map<number, RecordMessageInput[]>();
  constructor(private readonly options: LazerChatBridgeOptions) {
    this.now = options.clock ?? (() => new Date().toISOString());
  }

  archivedRoomIds(): Set<number> {
    return new Set(
      this.options.chatService
        .listChats(["archived"])
        .filter((chat) => chat.platform === "lazer")
        .map((chat) => chat.externalId),
    );
  }
  detach(chat: ChatWire): void {
    try {
      this.options.roomManager.removeRoom(chat.externalId, { exclude: true, reason: "archived" });
    } catch (error) {
      this.options.logger.warn("Lazer chat detach failed", { chatId: chat.id, error });
    }
  }

  onRoomJoined(room: RoomJoinedResponse, { explicit = false }: { explicit?: boolean } = {}): void {
    const existing = this.findChat(room.room_id);
    let chat: ChatWire;
    if (!existing) {
      this.options.chatService.openOrCreateChat({ platform: "lazer", externalId: room.room_id, title: room.name });
      chat = this.findChat(room.room_id)!;
    } else if (existing.status === "archived" && explicit) {
      this.options.chatService.rejoinChat(existing.id);
      chat = this.findChat(room.room_id)!;
    } else if (existing.status === "archived") return;
    else {
      chat = existing;
      if (existing.status === "closed") this.options.logger.warn("Joined room remains closed in chat history", { roomId: room.room_id });
    }
    this.startBackfill(chat.id, room.chat_channel_id);
  }
  onRoomChanged(room: RoomJoinedResponse): void {
    const chat = this.findChat(room.room_id);
    if (chat && chat.title !== room.name) this.options.chatService.updateTitle(chat.id, room.name);
  }
  onRoomRemoved(roomId: number, reason: RoomRemovalReason): void {
    if (reason !== "closed") return;
    const chat = this.findChat(roomId);
    if (!chat) return;
    const result = this.options.chatService.markRoomClosed(chat.id);
    if (result.changed) this.record(chat.id, { kind: "whistlebot", author: "WhistleBot", text: LAZER_CHAT_TEXT.roomClosed });
  }
  reconcile(liveRoomIds: number[]): void {
    const live = new Set(liveRoomIds);
    for (const chat of this.options.chatService.listChats(["active"]).filter((item) => item.platform === "lazer")) {
      if (live.has(chat.externalId)) continue;
      const result = this.options.chatService.markRoomClosed(chat.id);
      if (result.changed) this.record(chat.id, { kind: "whistlebot", author: "WhistleBot", text: LAZER_CHAT_TEXT.roomClosed });
    }
  }
  onLiveMessage(roomId: number, message: Record<string, unknown>, users: unknown[] = []): void {
    const chat = this.findChat(roomId);
    if (!chat || chat.status === "archived") return;
    const text = String(message.content ?? "");
    if (!text.trim()) return;
    const senderId = Number(message.sender_id);
    const externalId = Number(message.message_id);
    if (!Number.isSafeInteger(externalId) || externalId <= 0) return;
    for (const item of users) {
      const user = item as Record<string, unknown>;
      const id = Number(user.user_id ?? user.id);
      if (Number.isSafeInteger(id) && typeof user.username === "string") this.options.rememberName(id, user.username);
    }
    const author = this.messageAuthor(message, users, senderId);
    if (Number.isSafeInteger(senderId) && author && !author.startsWith("User ")) this.options.rememberName(senderId, author);
    const input: RecordMessageInput = {
      externalId,
      senderId: Number.isSafeInteger(senderId) ? senderId : null,
      author,
      text,
      kind: message.is_action === true ? "action" : "message",
      createdAt: String(message.timestamp ?? this.now()),
    };
    if (this.backfills.has(chat.id)) this.queued.set(chat.id, [...(this.queued.get(chat.id) ?? []), input]);
    else this.record(chat.id, input);
  }
  async onRoll(payload: { room_id: number; user_id: number; max: number; result: number }): Promise<void> {
    const chat = this.findChat(payload.room_id);
    if (!chat || chat.status === "archived") return;
    const name = await this.options.resolveName(payload.user_id);
    this.record(chat.id, { kind: "roll", author: "system", text: LAZER_CHAT_TEXT.roll(name, payload.result, payload.max) });
  }
  async recordEvent(roomId: number, text: string): Promise<void> {
    try {
      const chat = this.findChat(roomId);
      if (chat && chat.status !== "archived") {
        this.record(chat.id, { kind: "whistlebot", author: "WhistleBot", text });
      }
    } catch (error) {
      this.options.logger.warn("Lazer chat event could not be recorded", { roomId, error });
    }
  }
  async recordAction(roomId: number, text: (name: string) => string, userId?: number): Promise<void> {
    try {
      await this.recordEvent(roomId, text(userId === undefined ? "" : await this.options.resolveName(userId)));
    } catch (error) {
      this.options.logger.warn("Lazer chat action could not be recorded", { roomId, error });
    }
  }

  private startBackfill(chatId: number, channelId: number): void {
    if (this.backfills.has(chatId)) return;
    const task = (async () => {
      try {
        await this.options.roomManager.waitForChatChannel(channelId);
        const since = this.options.chatService.getHighestExternalId(chatId) ?? 0;
        const messages = await this.options.fetchHistory(channelId, since);
        for (const message of messages) {
          const currentChat = this.findChatById(chatId);
          if (!currentChat || currentChat.status === "archived") break;
          const normalized = this.normalizeHistoryMessage(message);
          if (normalized) this.record(chatId, normalized);
        }
      } catch (error) {
        this.options.logger.warn("Lazer chat backfill failed", { chatId, error });
      } finally {
        this.backfills.delete(chatId);
        try {
          const currentChat = this.findChatById(chatId);
          if (currentChat && currentChat.status !== "archived") {
            for (const message of this.queued.get(chatId) ?? []) this.record(chatId, message);
          }
        } catch (error) {
          this.options.logger.warn("Queued lazer chat messages could not be recorded", { chatId, error });
        } finally {
          this.queued.delete(chatId);
        }
      }
    })();
    this.backfills.set(chatId, task);
  }
  private normalizeHistoryMessage(message: Record<string, unknown>): RecordMessageInput | null {
    const text = String(message.content ?? "");
    if (!text.trim()) return null;
    const externalId = Number(message.message_id);
    if (!Number.isSafeInteger(externalId) || externalId <= 0) return null;
    const senderId = Number(message.sender_id);
    const author = this.messageAuthor(message, [], senderId);
    if (Number.isSafeInteger(senderId) && author && !author.startsWith("User ")) this.options.rememberName(senderId, author);
    return {
      externalId,
      senderId: Number.isSafeInteger(senderId) ? senderId : null,
      author,
      text,
      kind: message.is_action === true ? "action" : "message",
      createdAt: String(message.timestamp ?? this.now()),
    };
  }
  private messageAuthor(message: Record<string, unknown>, users: unknown[], senderId: number): string {
    const nested = (message.sender as Record<string, unknown> | undefined)?.username;
    const user = users.find((item) => {
      const entry = item as Record<string, unknown>;
      return Number(entry.user_id ?? entry.id) === senderId;
    }) as Record<string, unknown> | undefined;
    for (const username of [message.username, message.sender_username, nested, user?.username]) {
      if (typeof username === "string" && username) return username;
    }
    return `User ${senderId}`;
  }
  private findChat(externalId: number): ChatWire | undefined {
    return this.options.chatService.listChats().find((chat) => chat.platform === "lazer" && chat.externalId === externalId);
  }
  private findChatById(chatId: number): ChatWire | undefined {
    return this.options.chatService.listChats().find((chat) => chat.id === chatId);
  }
  private record(chatId: number, input: RecordMessageInput): void {
    this.options.chatService.recordMessage(chatId, input);
  }
}
