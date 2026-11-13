import type { ConnectionState, ChatWire, LobbyState } from "../types/index.js";
import type { ChatService } from "./chatService.js";

export const STABLE_CHAT_SERVICE_TEXT = {
  connectionLost: "Connection to the chat was lost. Messages sent while you were away may be missing.",
} as const;

export const STABLE_CHAT_SYSTEM_TEXT = {
  roomClosed: "Room closed",
} as const;

export const STABLE_CHAT_RESTORE_TIMEOUT_MS = 10_000;

export function parseMultiplayerChannel(channel: string | null | undefined): number | null {
  const normalized = String(channel ?? "")
    .replace(/^:/, "")
    .toLowerCase();
  const match = normalized.match(/^#?mp[-_](\d+)$/);
  return match ? Number(match[1]) : null;
}

export function formatMultiplayerChannel(externalId: number): string {
  return `#mp_${externalId}`;
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
  clock?: () => string;
  logger: StableChatLogger;
}

type PendingRestore = { chatId: number; timer: ReturnType<typeof setTimeout> };

export class StableChatBridge {
  private readonly setTimer: typeof setTimeout;
  private readonly clearTimer: typeof clearTimeout;
  private readonly now: () => string;
  private readonly gaps = new Set<string>();
  private readonly pending = new Map<string, PendingRestore>();
  private readonly outgoingEchoes = new Map<string, number[]>();
  private previousState: ConnectionState = "disconnected";
  private shuttingDown = false;

  constructor(private readonly options: StableChatBridgeOptions) {
    this.setTimer = options.setTimeout ?? setTimeout;
    this.clearTimer = options.clearTimeout ?? clearTimeout;
    this.now = options.clock ?? (() => new Date().toISOString());
  }

  onMatchStateChanged(channel: string, matchFields: Pick<LobbyState, "teamRed" | "teamBlue" | "teamRedScore" | "teamBlueScore" | "bestOf" | "nextPickTeam" | "lastPlay">): void {
    const externalId = parseMultiplayerChannel(channel);
    const chat = this.findChat(externalId);
    if (!chat || chat.status === "archived") return;
    this.options.chatService.replaceMatch(chat.id, {
      teamRed: matchFields.teamRed,
      teamBlue: matchFields.teamBlue,
      teamRedScore: matchFields.teamRedScore,
      teamBlueScore: matchFields.teamBlueScore,
      bestOf: matchFields.bestOf,
      nextPickTeam: matchFields.nextPickTeam,
      lastPlay: matchFields.lastPlay,
    });
  }

  restoreMatchState(channel: string): Partial<LobbyState> | null {
    const chat = this.findChat(parseMultiplayerChannel(channel));
    if (!chat) return null;
    const match = this.options.chatService.getLobbyState(chat.id).match;
    if (Object.keys(match).length === 0) return null;
    return { ...match, lastPlay: match.lastPlay as LobbyState["lastPlay"] };
  }

  onOwnJoin(channel: string, titleHint?: string): void {
    const externalId = parseMultiplayerChannel(channel);
    if (externalId === null) return;
    const key = formatMultiplayerChannel(externalId);
    this.options.chatService.openOrCreateChat({ platform: "stable", externalId, title: titleHint?.trim() || key });
    this.clearRestore(key);
    this.gaps.delete(key);
  }

  onOwnPart(channel: string): void {
    const externalId = parseMultiplayerChannel(channel);
    if (externalId === null) return;
    const key = formatMultiplayerChannel(externalId);
    this.clearRestore(key);
    this.gaps.delete(key);
    const chat = this.findChat(externalId);
    if (!chat || chat.status === "archived") return;
    const result = this.options.chatService.markRoomClosed(chat.id);
    if (result.changed) this.record(chat.id, "system", STABLE_CHAT_SYSTEM_TEXT.roomClosed);
  }

  onChannelMessage(channel: string, nick: string | null, text: string, timestamp?: string): void {
    this.pruneOutgoingEchoes();
    if (nick && nick.toLowerCase() === this.options.irc.ownNick()?.toLowerCase()) {
      const key = this.echoKey(channel, text);
      const timestamps = this.outgoingEchoes.get(key);
      if (timestamps?.length) {
        timestamps.shift();
        if (timestamps.length === 0) this.outgoingEchoes.delete(key);
        return;
      }
    }
    this.recordIncoming(channel, nick, text, timestamp);
  }

  onOutgoingMessage(channel: string, text: string): void {
    const nick = this.options.irc.ownNick();
    if (!nick) {
      this.options.logger.warn("Stable chat message could not be recorded without an IRC nickname", { channel });
      return;
    }
    this.pruneOutgoingEchoes();
    const key = this.echoKey(channel, text);
    this.outgoingEchoes.set(key, [...(this.outgoingEchoes.get(key) ?? []), Date.now()]);
    this.recordIncoming(channel, nick, text);
  }

  onSystemLine(channel: string, text: string): void {
    const chat = this.findChat(parseMultiplayerChannel(channel));
    if (!chat || chat.status === "archived") return;
    this.record(chat.id, "system", text);
  }

  onConnectionState(state: ConnectionState): void {
    if (state === "ready" && this.previousState !== "ready") this.restoreActiveChats();
    if (!this.shuttingDown && this.previousState === "ready" && (state === "disconnected" || state === "error")) {
      for (const chat of this.options.chatService.listChats(["active"]).filter((item) => item.platform === "stable")) {
        const key = formatMultiplayerChannel(chat.externalId);
        if (this.gaps.has(key)) continue;
        this.record(chat.id, "system", STABLE_CHAT_SERVICE_TEXT.connectionLost);
        this.gaps.add(key);
      }
    }
    this.previousState = state;
  }

  restoreActiveChats(): void {
    if (this.shuttingDown || !this.options.irc.isReady()) return;
    for (const chat of this.options.chatService.listChats(["active"]).filter((item) => item.platform === "stable")) {
      const channel = formatMultiplayerChannel(chat.externalId);
      if (this.pending.has(channel)) continue;
      this.gaps.add(channel);
      const timer = this.setTimer(() => this.failRestore(channel), STABLE_CHAT_RESTORE_TIMEOUT_MS);
      this.pending.set(channel, { chatId: chat.id, timer });
      try {
        this.options.irc.joinChannel(channel);
      } catch (error) {
        this.options.logger.warn("Stable chat restore join failed", { channel, error });
      }
    }
  }

  onJoinFailed(channel: string): void {
    const key = this.normalizeKey(channel);
    if (key && this.pending.has(key)) this.failRestore(key);
  }

  onTitle(channel: string, title: string): void {
    const externalId = parseMultiplayerChannel(channel);
    if (externalId === null || !title.trim()) return;
    const chat = this.findChat(externalId);
    if (chat && chat.title !== title) this.options.chatService.updateTitle(chat.id, title);
  }

  setShuttingDown(): void {
    this.shuttingDown = true;
    for (const key of this.pending.keys()) this.clearRestore(key);
  }

  detach(chat: ChatWire): void {
    if (!this.options.irc.isReady()) return;
    try {
      this.options.irc.leaveChannel(formatMultiplayerChannel(chat.externalId));
    } catch (error) {
      this.options.logger.warn("Stable chat detach failed", { chatId: chat.id, error });
    }
  }

  private recordIncoming(channel: string, nick: string | null, text: string, timestamp?: string): void {
    const chat = this.findChat(parseMultiplayerChannel(channel));
    if (!chat) {
      this.options.logger.debug("Stable chat message received for an unknown chat", { channel });
      return;
    }
    if (chat.status === "archived") return;
    this.record(chat.id, "message", text, nick, timestamp);
  }

  private record(chatId: number, kind: "message" | "system", text: string, author: string | null = null, createdAt?: string): void {
    this.options.chatService.recordMessage(chatId, { kind, text, author, ...(createdAt ? { createdAt } : { createdAt: this.now() }) });
  }

  private findChat(externalId: number | null): ChatWire | undefined {
    return externalId === null ? undefined : this.options.chatService.listChats().find((chat) => chat.platform === "stable" && chat.externalId === externalId);
  }

  private normalizeKey(channel: string): string | null {
    const externalId = parseMultiplayerChannel(channel);
    return externalId === null ? null : formatMultiplayerChannel(externalId);
  }

  private echoKey(channel: string, text: string): string {
    return `${this.normalizeKey(channel) ?? channel.toLowerCase()}\0${text}`;
  }

  private pruneOutgoingEchoes(): void {
    const cutoff = Date.now() - 15_000;
    for (const [key, timestamps] of this.outgoingEchoes) {
      const fresh = timestamps.filter((timestamp) => timestamp >= cutoff);
      if (fresh.length) this.outgoingEchoes.set(key, fresh);
      else this.outgoingEchoes.delete(key);
    }
  }

  private clearRestore(channel: string): void {
    const restore = this.pending.get(channel);
    if (!restore) return;
    this.clearTimer(restore.timer);
    this.pending.delete(channel);
  }

  private failRestore(channel: string): void {
    const restore = this.pending.get(channel);
    if (!restore) return;
    this.clearRestore(channel);
    this.gaps.delete(channel);
    const result = this.options.chatService.markReconnectFailed(restore.chatId);
    if (result.changed) this.record(restore.chatId, "system", STABLE_CHAT_SYSTEM_TEXT.roomClosed);
  }
}
