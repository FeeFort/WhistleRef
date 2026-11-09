import type { DatabaseSync } from "node:sqlite";
import { closeDatabase } from "../db/database.js";
import { deleteArchivedOlderThan, deleteChats as deleteArchivedChats, findChat, getChat, listChats as readChats, readLobbyState, writeLobbyState } from "../db/chatsRepo.js";
import { getAllSettings, getSetting as readSetting, setSetting as writeSetting } from "../db/settingsRepo.js";
import { getMessagesPage, getHighestExternalId as readHighestExternalId } from "../db/messagesRepo.js";
import type { Chat, ChatSettings, ChatStatus, ChatWire, Message, MessageWire, OpenOrCreateChatInput, RecordMessageInput, ChatDeleteResult } from "../types/index.js";
import { ChatLifecycle } from "./chatLifecycle.js";
import { MessageRecorder } from "./messageRecorder.js";
import { toChatWire, toMessageWire } from "./chatMapper.js";
import { applyMatchPatch, clearMapStates, importMaps as importMapDocument, isMapsEmpty, normalize, replaceMatch, setActivePool, setMapSlot, setQualificationMode, type LobbyStateDocument } from "./lobbyState.js";

type Clock = () => string;
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

export class ChatService {
  readonly lifecycle: ChatLifecycle;
  readonly recorder: MessageRecorder;
  private readonly adapters = new Map<string, PlatformAdapter>();
  private closed = false;

  constructor(
    private readonly database: DatabaseSync,
    private readonly callbacks: ChatServiceCallbacks = {},
    private readonly now: Clock = () => new Date().toISOString(),
  ) {
    this.lifecycle = new ChatLifecycle(database, now);
    this.recorder = new MessageRecorder(database, now);
  }

  registerPlatformAdapter(platform: string, adapter: PlatformAdapter): void {
    this.adapters.set(platform, adapter);
  }
  openOrCreateChat(input: OpenOrCreateChatInput) {
    const result = this.lifecycle.openOrCreateChat(input);
    if (result.changed) this.callbacks.onChatUpdated?.(toChatWire(result.chat));
    return result;
  }
  markRoomClosed(chatId: number) {
    return this.updateLifecycle(() => this.lifecycle.markRoomClosed(chatId));
  }
  rejoinChat(chatId: number) {
    return this.updateLifecycle(() => this.lifecycle.rejoinChat(chatId));
  }
  markReconnectFailed(chatId: number) {
    return this.updateLifecycle(() => this.lifecycle.markReconnectFailed(chatId));
  }
  updateTitle(chatId: number, title: string) {
    return this.updateLifecycle(() => this.lifecycle.updateTitle(chatId, title));
  }
  archiveChat(chatId: number) {
    const result = this.updateLifecycle(() => this.lifecycle.archiveChat(chatId));
    if (result.changed) this.adapters.get(result.chat.platform)?.detach(toChatWire(result.chat));
    return result;
  }
  recordMessage(chatId: number, input: RecordMessageInput) {
    const result = this.recorder.recordMessage(chatId, input);
    if (result.inserted) this.callbacks.onMessage?.(toMessageWire(result.message));
    return result;
  }
  recordEvent(chatId: number, text: string) {
    const result = this.recorder.recordEvent(chatId, text);
    if (result.inserted) this.callbacks.onMessage?.(toMessageWire(result.message));
    return result;
  }
  recordMessages(chatId: number, inputs: readonly RecordMessageInput[]): number {
    const lastId = Number((this.database.prepare("SELECT COALESCE(MAX(id), 0) AS id FROM messages WHERE chat_id = ?").get(chatId) as { id: number }).id);
    const inserted = this.recorder.recordMessages(chatId, inputs);
    if (inserted > 0) {
      const messages = this.database.prepare("SELECT * FROM messages WHERE chat_id = ? AND id > ? ORDER BY id").all(chatId, lastId) as unknown as Message[];
      for (const message of messages) this.callbacks.onMessage?.(toMessageWire(message));
    }
    return inserted;
  }
  listChats(statuses?: readonly ChatStatus[]): ChatWire[] {
    const rows: Chat[] = readChats(this.database);
    return rows.filter((chat) => !statuses || statuses.includes(chat.status)).map(toChatWire);
  }
  getChatHistory(chatId: number): MessageWire[] {
    if (!getChat(this.database, chatId)) throw new Error(`Chat ${chatId} not found`);
    return getMessagesPage(this.database, chatId, Number.MAX_SAFE_INTEGER).map(toMessageWire);
  }
  getHighestExternalId(chatId: number): number | null {
    return readHighestExternalId(this.database, chatId);
  }
  getLobbyState(chatId: number): LobbyStateDocument {
    const chat = getChat(this.database, chatId);
    if (!chat) throw new Error(`Chat ${chatId} not found`);
    return normalize(readLobbyState(this.database, chatId));
  }
  setMatch(chatId: number, patch: unknown): LobbyStateDocument {
    return this.mutateLobbyState(chatId, (doc) => applyMatchPatch(doc, patch));
  }
  replaceMatch(chatId: number, match: unknown): LobbyStateDocument {
    return this.mutateLobbyState(chatId, (doc) => replaceMatch(doc, match));
  }
  setMapSlot(chatId: number, slot: string, patch: unknown): LobbyStateDocument {
    return this.mutateLobbyState(chatId, (doc) => setMapSlot(doc, slot, patch));
  }
  clearMapStates(chatId: number): LobbyStateDocument {
    return this.mutateLobbyState(chatId, clearMapStates);
  }
  setActivePool(chatId: number, poolId: string | null): LobbyStateDocument {
    return this.mutateLobbyState(chatId, (doc) => setActivePool(doc, poolId));
  }
  setQualificationMode(chatId: number, enabled: boolean): LobbyStateDocument {
    return this.mutateLobbyState(chatId, (doc) => setQualificationMode(doc, enabled));
  }
  importMaps(lobbies: unknown): { applied: number; skipped: number } {
    if (!Array.isArray(lobbies)) throw new Error("lobbies must be an array.");
    if (lobbies.length > 500) throw new Error("lobbies must contain at most 500 items.");
    let applied = 0;
    let skipped = 0;
    for (const item of lobbies) {
      if (!item || typeof item !== "object" || Array.isArray(item)) throw new Error("Each lobby import item must be an object.");
      const serializedItem = JSON.stringify(item);
      if (typeof serializedItem !== "string" || Buffer.byteLength(serializedItem, "utf8") > 64 * 1024) throw new Error("Each lobby import item must be at most 64 KB.");
      const value = item as Record<string, unknown>;
      if ((value.platform !== "stable" && value.platform !== "lazer") || !Number.isSafeInteger(value.externalId) || !value.maps || typeof value.maps !== "object" || Array.isArray(value.maps)) throw new Error("Each lobby import item requires platform, externalId and maps.");
      const chat = findChat(this.database, value.platform, value.externalId as number);
      if (!chat || chat.status === "archived") {
        skipped++;
        continue;
      }
      const current = normalize(readLobbyState(this.database, chat.id));
      if (!isMapsEmpty(current.maps)) {
        skipped++;
        continue;
      }
      const maps = value.maps as Record<string, unknown>;
      let operation = importMapDocument(current, {});
      if (maps.slots !== undefined) {
        if (!maps.slots || typeof maps.slots !== "object" || Array.isArray(maps.slots)) throw new Error("maps.slots must be a plain object.");
        operation = importMapDocument(operation.doc, { slots: {} });
        for (const [slot, patch] of Object.entries(maps.slots as Record<string, unknown>)) operation = setMapSlot(operation.doc, slot, patch);
      }
      if (maps.activePoolId !== undefined) operation = setActivePool(operation.doc, maps.activePoolId);
      if (maps.qualificationMode !== undefined) operation = setQualificationMode(operation.doc, maps.qualificationMode);
      if (operation.changed) {
        writeLobbyState(this.database, chat.id, operation.doc);
        this.callbacks.onLobbyStateUpdated?.(chat.id, operation.doc);
        applied++;
      } else skipped++;
    }
    return { applied, skipped };
  }
  deleteChats(ids: readonly number[]): ChatDeleteResult {
    const deleted = deleteArchivedChats(this.database, ids);
    for (const id of deleted) this.callbacks.onChatDeleted?.(id);
    return { deleted, skipped: [...new Set(ids)].filter((id) => !deleted.includes(id)) };
  }
  getSettings(): ChatSettings {
    return getAllSettings(this.database);
  }
  setSetting(key: string, value: unknown): ChatSettings {
    this.validateSetting(key, value);
    if (JSON.stringify(readSetting(this.database, key)) !== JSON.stringify(value)) {
      writeSetting(this.database, key, value);
      const settings = this.getSettings();
      this.callbacks.onSettingsUpdated?.(settings);
    }
    return this.getSettings();
  }
  startup(): ChatWire[] {
    const closedBeforeRecovery = readChats(this.database, "closed");
    const recovered = this.lifecycle.startupRecovery();
    for (const closed of closedBeforeRecovery) {
      const chat = getChat(this.database, closed.id);
      if (chat) this.callbacks.onChatUpdated?.(toChatWire(chat));
    }
    const days = readSetting<number | null>(this.database, "archive.autoDeleteDays");
    if (days !== undefined && days !== null) {
      const cutoff = new Date(new Date(this.now()).getTime() - days * 86400000).toISOString();
      for (const id of deleteArchivedOlderThan(this.database, cutoff)) this.callbacks.onChatDeleted?.(id);
    }
    return recovered.activeChats.map(toChatWire);
  }
  shutdown(): void {
    if (this.closed) return;
    this.closed = true;
    try {
      this.lifecycle.gracefulShutdown();
    } catch {
      this.closed = true;
    }
    try {
      closeDatabase(this.database);
    } catch {
      this.closed = true;
    }
  }

  private updateLifecycle<T extends { chat: Chat; changed: boolean }>(invoke: () => T): T {
    const result = invoke();
    if (result.changed) this.callbacks.onChatUpdated?.(toChatWire(result.chat));
    return result;
  }
  private validateSetting(key: string, value: unknown): void {
    if (key !== "archive.autoDeleteDays") throw new Error(`Unknown setting: ${key}`);
    if (value !== null && (!Number.isSafeInteger(value) || (value as number) <= 0)) throw new Error("archive.autoDeleteDays must be null or a positive integer.");
  }
  private mutateLobbyState(chatId: number, operation: (doc: LobbyStateDocument) => { doc: LobbyStateDocument; changed: boolean }): LobbyStateDocument {
    const chat = getChat(this.database, chatId);
    if (!chat) throw new Error(`Chat ${chatId} not found`);
    if (chat.status === "archived") throw new Error(`Chat ${chatId} is archived and cannot be changed.`);
    const current = normalize(readLobbyState(this.database, chatId));
    const result = operation(current);
    if (result.changed) {
      writeLobbyState(this.database, chatId, result.doc);
      this.callbacks.onLobbyStateUpdated?.(chatId, result.doc);
    }
    return result.doc;
  }
}
