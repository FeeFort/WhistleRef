import http from "node:http";
import net from "node:net";
import path from "node:path";
import os from "node:os";
import packageInfo from "../package.json" with { type: "json" };
import { logger } from "./logger/logger.js";
import express, { Request, Response } from "express";
import { WebSocket, WebSocketServer } from "ws";
import { parseBanchoBotMessage, parseLobbyCommand } from "./banchoBotParser.js";
import { login as loginOsu, logout as logoutOsu, getAccessToken, restoreSession, getState } from "./auth/auth.js";
import { fetchApi } from "./osu-api/osuApiClient.js";
import { config } from "./config.js";
import { ClientMessage, ConnectionState, IrcCredentials, IrcLine, LobbyState, ParsedBanchoBotMessage, Player, PlayerScore, Team, WinConditionContext } from "./types/index.js";
import { fileURLToPath } from "node:url";
import { UpdateError, UpdateManager } from "./updater/updateManager.js";
import { applyPendingUpdate } from "./updater/applyUpdate.js";
import { openInBrowser } from "./browser.js";
import { createTray } from "./tray/index.js";
import { evaluateWinCondition } from "./match-result/winConditionRunner.js";
import { addClient, removeClient, sendJson, broadcast, clientCount, requestContext } from "./wsGateway.js";
import { connectToRefereeHub, disconnectFromRefereeHub } from "./lazer/refereeHubClient.js";
import { roomManager } from "./lazer/roomManager.js";
import * as lazerHandlers from "./lazer/handlers.js";
import { handleLazerMpCommand } from "./lazer/mpCommandHandler.js";
import type { LazerConnectionStateEvent, LazerSyncStateEvent, LazerRoomsEvent } from "./types/index.js";
import { ChatSocket } from "./lazer/chatSocket.js";
import { openDatabase } from "./db/database.js";
import { ChatService } from "./chats/chatService.js";
import { StableChatBridge } from "./chats/stableChatBridge.js";
import { LazerChatBridge, setLazerChatBridge } from "./chats/lazerChatBridge.js";
import { UserNameResolver } from "./chats/userNameResolver.js";
import { fetchChatMessagesSince } from "./lazer/chatApi.js";
import { createLobbyHandlers, validateLobbyCommand, validateMatchScores } from "./chats/lobbyHandlers.js";

const launchedAfterUpdate = process.argv.includes("--updated");
const sessionLog = logger.child("lazer", "session");
const ircLog = logger.child("stable", "irc");
const winConditionLog = logger.child("stable", "winCondition");
const chatLog = logger.child("lazer", "chatSocket");
const authLog = logger.child("core", "auth");
const apiLog = logger.child("core", "osuApi");
const wsLog = logger.child("core", "webSocket");
const updateLog = logger.child("core", "updater");
const chatServiceLog = logger.child("core", "chatService");
let chatSocket: ChatSocket | null = null;
let chatService!: ChatService;
let stableChatBridge!: StableChatBridge;
let lazerChatBridge!: LazerChatBridge;
let deferredChatEvents: unknown[] | null = null;

function emitChatEvent(event: unknown): void {
  if (deferredChatEvents) deferredChatEvents.push(event);
  else broadcast(event);
}

function flushChatEvents(): void {
  const events = deferredChatEvents ?? [];
  deferredChatEvents = null;
  for (const event of events) broadcast(event);
}

function startChatSocket(): void {
  if (shuttingDown) return;
  chatSocket?.close();
  chatSocket = new ChatSocket({
    accessToken: getAccessToken,
    onNotification: (notification) => {
      const data = notification.data as Record<string, unknown> | undefined;
      if (notification.event === "chat.channel.join") {
        const channel = (data?.channel ?? data) as Record<string, unknown> | undefined;
        const channelId = Number(channel?.channel_id);
        if (Number.isInteger(channelId) && channelId > 0) roomManager.markChatChannelJoined(channelId);
        return;
      }
      if (notification.event === "chat.message.new") {
        const messages = Array.isArray(data?.messages) ? data.messages : [];
        for (const message of messages) {
          const channelId = Number((message as Record<string, unknown>)?.channel_id);
          const room = Number.isInteger(channelId) ? roomManager.getRoomByChatChannel(channelId) : undefined;
          if (room) {
            // TODO(client-migration): Remove this legacy event after the client uses chat_message.
            broadcast({ type: "lazer_chat_message", roomId: room.room_id, message, users: data?.users ?? [] });
            lazerChatBridge?.onLiveMessage(room.room_id, message as Record<string, unknown>, Array.isArray(data?.users) ? data.users : []);
          }
        }
      }
    },
    onError: (error) => chatLog.warn("Chat socket error", { error }),
  });
  void chatSocket.connect().catch((error) => chatLog.warn("Chat socket connection failed", { error }));
}

// TODO: add actual normal comments to this mess
if (process.argv[2] === "--apply-update") {
  try {
    await applyPendingUpdate(process.argv[3], process.argv[4]);
    process.exit(0);
  } catch (error) {
    updateLog.critical("Update installation failed", { error });
    await logger.flush();
    process.exit(1);
  }
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const httpServer = http.createServer(app);
httpServer.on("error", (error) => {
  logger.critical("HTTP server failed", { host: config.httpHost, port: config.httpPort, error });
  void logger.flush().finally(() => process.exit(1));
});
const staticDirectory = path.join(__dirname, "..", "static");
const webSocketServer = new WebSocketServer({
  server: httpServer,
  path: "/ws",
});

app.use(express.static(staticDirectory));

app.get("/", (_request: Request, response: Response) => {
  response.sendFile(path.join(staticDirectory, "index.html"));
});

app.get("/health", (_request: Request, response: Response) => {
  response.status(200).send("ok");
});

function parseIrcLine(line: string): IrcLine {
  let rest = line;
  let prefix = null;

  if (rest.startsWith(":")) {
    const prefixEnd = rest.indexOf(" ");
    if (prefixEnd === -1) {
      return { prefix: rest.slice(1), command: "", params: [] };
    }
    prefix = rest.slice(1, prefixEnd);
    rest = rest.slice(prefixEnd + 1);
  }

  const params = [];
  while (rest.length > 0) {
    if (rest.startsWith(":")) {
      params.push(rest.slice(1));
      break;
    }

    const separator = rest.indexOf(" ");
    if (separator === -1) {
      params.push(rest);
      break;
    }

    params.push(rest.slice(0, separator));
    rest = rest.slice(separator + 1).replace(/^ +/, "");
  }

  return {
    prefix,
    command: params.shift() || "",
    params,
  };
}

function getNick(prefix: string | null): string | null {
  if (!prefix) {
    return null;
  }
  return prefix.split("!", 1)[0];
}

function normalizeChannel(channel: string | null | undefined): string {
  const normalized = String(channel || "")
    .replace(/^:/, "")
    .toLowerCase();
  const multiplayer = normalized.match(/^#?mp[-_](\d+)$/);
  return multiplayer ? `#mp_${multiplayer[1]}` : normalized;
}

function getMultiplayerId(channel: string): number | null {
  const match = normalizeChannel(channel).match(/^#?mp_(\d+)$/);
  return match ? Number(match[1]) : null;
}

function isMultiplayerChannel(channel: string): boolean {
  return getMultiplayerId(channel) !== null;
}

function getOppositePickTeam(state: Pick<LobbyState, "nextPickTeam" | "teamRed" | "teamBlue">): string | null {
  if (!state.nextPickTeam || !state.teamRed || !state.teamBlue) return null;
  if (state.nextPickTeam.toLowerCase() === state.teamRed.toLowerCase()) {
    return state.teamBlue;
  }
  if (state.nextPickTeam.toLowerCase() === state.teamBlue.toLowerCase()) {
    return state.teamRed;
  }
  return null;
}

function getWinningScore(bestOf: number | null): number | null {
  const value = Number(bestOf);
  return Number.isInteger(value) && value > 0 ? Math.ceil(value / 2) : null;
}

function getMatchStatus(state: LobbyState): string | null {
  const winningScore = getWinningScore(state.bestOf);
  const teamRedScore = Number(state.teamRedScore) || 0;
  const teamBlueScore = Number(state.teamBlueScore) || 0;

  if (winningScore && teamRedScore >= winningScore && teamRedScore > teamBlueScore) {
    return `${state.teamRed} wins the match! GG and WP!`;
  }
  if (winningScore && teamBlueScore >= winningScore && teamBlueScore > teamRedScore) {
    return `${state.teamBlue} wins the match! GG and WP!`;
  }
  return state.nextPickTeam ? `Next Pick: ${state.nextPickTeam}` : null;
}

function createLobbyState(channel: string): LobbyState {
  return {
    id: getMultiplayerId(channel),
    name: "",
    qualifiers: false,
    teamRed: "",
    teamBlue: "",
    teamRedScore: 0,
    teamBlueScore: 0,
    bestOf: null,
    nextPickTeam: null,
    matchStatus: null,
    teamRedPlayers: [],
    teamBluePlayers: [],
    lastPlay: {
      teamRedScore: null,
      teamBlueScore: null,
      scoreDifference: null,
      winnerTeam: null,
    },
    players: [],
    currentBeatmap: null,
    activeMods: null,
    host: null,
    teamMode: "HeadToHead",
    scoreMode: "Score",
    mode: "osu!",
    size: 16,
    slots: Array.from({ length: 16 }, () => null),
    slotLocks: Array.from({ length: 16 }, () => false),
    timer: { active: false, endsAt: null },
    status: "active",
  };
}

function cloneLobbyState(state: LobbyState): LobbyState {
  return {
    ...state,
    timer: { ...state.timer },
    lastPlay: { ...state.lastPlay },
    currentBeatmap: state.currentBeatmap ? { ...state.currentBeatmap } : null,
    teamRedPlayers: [...state.teamRedPlayers],
    teamBluePlayers: [...state.teamBluePlayers],
    players: state.players.map((player) => ({ ...player })),
    slots: [...state.slots],
    slotLocks: [...state.slotLocks],
  };
}

function sameLobbyValue(left: unknown, right: unknown): boolean {
  if (left === right) return true;
  if (!left || !right || typeof left !== "object" || typeof right !== "object") {
    return false;
  }
  return JSON.stringify(left) === JSON.stringify(right);
}

let lazerConnectionState: LazerConnectionStateEvent = { type: "lazer_connection_state", state: "disconnected" };
let lazerSyncState: LazerSyncStateEvent = { type: "lazer_sync_state", state: "idle" };

let osuSessionTransition: Promise<void> = Promise.resolve();

async function stopLazerSession(): Promise<void> {
  sessionLog.separator("Stopping session");
  chatSocket?.close();
  chatSocket = null;
  roomManager.reset();
  await disconnectFromRefereeHub();
  sessionLog.separator("Session stopped");
}

async function startLazerSession(): Promise<void> {
  if (shuttingDown) return;
  const auth = getState();
  if (auth.status !== "authenticated") return;
  sessionLog.separator("Starting session");
  roomManager.setCurrentUserId(auth.user.id);
  roomManager.setListeners(
    (room) => {
      broadcast({ type: "lazer_room_state", room });
      lazerChatBridge?.onRoomChanged(room);
    },
    (roomId, reason) => {
      // TODO(client-migration): Remove this legacy event after the client uses chat_updated.
      if (reason === "closed" || reason === "reset") broadcast({ type: "lazer_room_closed", roomId });
      lazerChatBridge?.onRoomRemoved(roomId, reason);
    },
    (event) => {
      if (event.type === "lazer_sync_state") {
        lazerSyncState = event;
        if (event.state === "synced") broadcast({ type: "lazer_rooms", roomIds: roomManager.getAllRooms().map((room) => room.room_id) } satisfies LazerRoomsEvent);
      }
      broadcast(event);
    },
    (event) => broadcast(event),
    (room, explicit) => lazerChatBridge?.onRoomJoined(room, { explicit }),
  );
  roomManager.setArchivedRoomProvider(
    () => lazerChatBridge?.archivedRoomIds() ?? new Set(),
    (roomIds) => lazerChatBridge?.reconcile(roomIds),
  );

  await connectToRefereeHub(
    (event) => {
      if (roomManager.handleHubEvent(event.eventType, event.payload)) broadcast(event);
      if (event.eventType === "RollCompleted")
        void lazerChatBridge?.onRoll(event.payload as import("./types/index.js").RollCompletedEvent).catch((error) => sessionLog.warn("Lazer roll could not be recorded", { error }));
    },
    () => roomManager.resync(),
    (event) => {
      if (event.type === "lazer_connection_state") {
        lazerConnectionState = event;
        if (event.state !== "connected") {
          lazerSyncState = { type: "lazer_sync_state", state: "idle" };
          broadcast(lazerSyncState);
        }
      }
      broadcast(event);
    },
  );
  if (shuttingDown) {
    await stopLazerSession();
    return;
  }
  // Initial hub connection must discover rooms without a frontend request.
  try {
    await roomManager.resync();
    sessionLog.separator("Session ready");
  } catch (error) {
    sessionLog.warn("Initial room sync failed", { error });
  }
}

class BanchoConnection {
  socket: net.Socket | null = null;
  state: ConnectionState = "disconnected";
  buffer = "";
  intentionalClose = false;
  credentials: IrcCredentials | null = null;
  lobbyStates: Map<string, LobbyState> = new Map();
  matchScoreBuffers: Map<string, Map<string, number>> = new Map();
  activeWinConditions: Map<string, { beatmapId: number; source: string }> = new Map();
  pendingAutoSettings: Set<string> = new Set();

  sendStatus(client: WebSocket | null = null, detail: string | null = null) {
    const payload: { type: string; state: ConnectionState; detail?: string } = { type: "status", state: this.state };
    if (detail) {
      payload.detail = detail;
    }

    if (client) {
      sendJson(client, payload);
    } else {
      broadcast(payload);
    }
  }

  setState(state: ConnectionState, detail: string | null = null): void {
    ircLog.log(state === "error" ? "WARN" : "INFO", "Connection state changed", { previous: this.state, state, detail });
    this.state = state;
    stableChatBridge?.onConnectionState(state);
    this.sendStatus(null, detail);
  }

  ownNick(): string | null {
    return this.credentials?.login ?? null;
  }

  isReady(): boolean {
    return this.state === "ready";
  }

  isOwnNick(nick: string | null): boolean {
    return Boolean(nick && this.credentials?.login && nick.toLowerCase() === this.credentials.login.toLowerCase());
  }

  getLobbyState(channel: string, reset = false): LobbyState {
    const key = normalizeChannel(channel);
    if (!this.lobbyStates.has(key) || reset) {
      this.lobbyStates.set(key, createLobbyState(channel));
      this.matchScoreBuffers.set(key, new Map());
      this.activeWinConditions.delete(key);
    }
    return this.lobbyStates.get(key)!;
  }

  sendLobbyState(channel: string, state: LobbyState | undefined = this.lobbyStates.get(normalizeChannel(channel)), client: WebSocket | null = null): void {
    if (!state) return;
    // TODO(client-migration): Remove this legacy event after the client uses chat_lobby_state_updated.
    const payload = {
      type: "lobby_state",
      channel: channel.replace(/^:/, ""),
      state: cloneLobbyState(state),
    };
    if (client) {
      sendJson(client, payload);
    } else {
      broadcast(payload);
    }
  }

  updateLobbyState(channel: string, update: Partial<LobbyState>): void {
    const state = this.getLobbyState(channel);
    let changed = false;

    const keys: (keyof LobbyState)[] = [
      "name",
      "qualifiers",
      "teamRed",
      "teamBlue",
      "teamRedScore",
      "teamBlueScore",
      "bestOf",
      "nextPickTeam",
      "teamRedPlayers",
      "teamBluePlayers",
      "lastPlay",
      "players",
      "currentBeatmap",
      "activeMods",
      "host",
      "teamMode",
      "scoreMode",
      "mode",
      "size",
      "slots",
      "slotLocks",
      "status",
    ];

    for (const key of keys) {
      if (Object.prototype.hasOwnProperty.call(update, key)) {
        const sameValue =
          key === "activeMods" && typeof state[key] === "string" && typeof update[key] === "string"
            ? (state[key] as string).toLowerCase() === (update[key] as string).toLowerCase()
            : sameLobbyValue(state[key], update[key]);
        if (!sameValue) changed = true;
        (state[key] as unknown) = update[key];
      }
    }

    if (update.timer) {
      const nextTimer = { ...state.timer, ...update.timer };
      if (state.timer.active !== nextTimer.active || state.timer.endsAt !== nextTimer.endsAt) {
        changed = true;
      }
      state.timer = nextTimer;
    }

    if (update.size !== undefined) {
      const size = Math.max(0, Math.min(16, Number(update.size) || 0));
      const slotLocks = Array.from({ length: 16 }, (_, index) => index >= size);
      if (JSON.stringify(state.slotLocks) !== JSON.stringify(slotLocks)) {
        state.slotLocks = slotLocks;
        changed = true;
      }
    }

    const matchStatus = getMatchStatus(state);
    if (state.matchStatus !== matchStatus) {
      state.matchStatus = matchStatus;
      changed = true;
    }

    ircLog.trace(changed ? "Lobby state update applied" : "Lobby state update unchanged", () => ({ channel, fields: Object.keys(update) }));
    if (changed) {
      stableChatBridge?.onMatchStateChanged(channel, {
        teamRed: state.teamRed,
        teamBlue: state.teamBlue,
        teamRedScore: state.teamRedScore,
        teamBlueScore: state.teamBlueScore,
        bestOf: state.bestOf,
        nextPickTeam: state.nextPickTeam,
        lastPlay: state.lastPlay,
      });
      this.sendLobbyState(channel, state);
    }
  }

  closeLobby(channel: string): void {
    ircLog.trace("Closing lobby, clearing timer and scores", { channel });
    const state = this.getLobbyState(channel);
    const changed = state.status !== "closed" || state.timer.active || state.timer.endsAt !== null;
    state.status = "closed";
    state.timer = { active: false, endsAt: null };
    this.matchScoreBuffers.set(normalizeChannel(channel), new Map());
    this.activeWinConditions.delete(normalizeChannel(channel));
    if (changed) this.sendLobbyState(channel, state);
  }

  updatePlayers(channel: string, players: Player[]): void {
    const normalizedPlayers = players
      .map((player) => ({ ...player }))
      .sort((left, right) => {
        const leftSlot = Number.isFinite(left.slot) ? left.slot : Number.POSITIVE_INFINITY;
        const rightSlot = Number.isFinite(right.slot) ? right.slot : Number.POSITIVE_INFINITY;
        if (leftSlot !== rightSlot) return leftSlot - rightSlot;
        return left.username.localeCompare(right.username);
      });
    const slots = Array.from({ length: 16 }, (_, index) => normalizedPlayers.find((player) => player.slot === index + 1)?.username || null);
    this.updateLobbyState(channel, {
      players: normalizedPlayers,
      teamRedPlayers: normalizedPlayers.filter((player) => player.team === "red").map((player) => player.username),
      teamBluePlayers: normalizedPlayers.filter((player) => player.team === "blue").map((player) => player.username),
      slots,
    });
  }

  setLobbyHost(channel: string, username: string | null): void {
    const state = this.getLobbyState(channel);
    const normalizedName = username?.toLowerCase() ?? null;
    this.updatePlayers(
      channel,
      state.players.map((player) => ({
        ...player,
        isHost: normalizedName !== null && player.username.toLowerCase() === normalizedName,
      })),
    );
    this.updateLobbyState(channel, { host: username });
  }

  upsertPlayer(channel: string, player: Partial<Player> & Pick<Player, "username" | "slot">): void {
    const state = this.getLobbyState(channel);
    const normalizedName = player.username.toLowerCase();
    const players = state.players.filter((item) => item.slot !== player.slot && item.username.toLowerCase() !== normalizedName);
    const previous = state.players.find((item) => item.slot === player.slot || item.username.toLowerCase() === normalizedName);
    this.updatePlayers(channel, [
      ...players,
      {
        ...previous,
        ...player,
        ready: player.ready ?? previous?.ready ?? false,
        noMap: player.noMap ?? previous?.noMap ?? false,
        isHost: player.isHost ?? previous?.isHost ?? false,
        team: Object.prototype.hasOwnProperty.call(player, "team") ? (player.team ?? null) : (previous?.team ?? null),
        mods: player.mods?.length || !previous?.mods ? (player.mods ?? []) : previous.mods,
        profileUrl: player.profileUrl || previous?.profileUrl || null,
        userId: player.userId ?? previous?.userId ?? null,
        avatarUrl: player.avatarUrl || previous?.avatarUrl || (player.userId ? `https://a.ppy.sh/${player.userId}` : null),
      },
    ]);
  }

  updatePlayerTeam(channel: string, username: string, team: Team): void {
    const state = this.getLobbyState(channel);
    const normalizedName = username.toLowerCase();
    const existing = state.players.find((item) => item.username.toLowerCase() === normalizedName);
    if (!existing) return;
    this.upsertPlayer(channel, { ...existing, team });
  }

  removePlayer(channel: string, username: string): void {
    const state = this.getLobbyState(channel);
    const players = state.players.filter((player) => player.username.toLowerCase() !== username.toLowerCase());
    if (players.length !== state.players.length) this.updatePlayers(channel, players);
  }

  recordPlayerScore(channel: string, result: PlayerScore): void {
    ircLog.trace("Player score recorded", { channel, username: result.username, score: result.score });
    const key = normalizeChannel(channel);
    const scores = this.matchScoreBuffers.get(key) || new Map();
    scores.set(result.username.toLowerCase(), result.score);
    this.matchScoreBuffers.set(key, scores);
  }

  async finishMatch(channel: string): Promise<void> {
    const state = this.getLobbyState(channel);
    const channelKey = normalizeChannel(channel);
    const scores = this.matchScoreBuffers.get(channelKey) || new Map();
    if (!scores.size) {
      ircLog.trace("Match completion has no scores, skipping", { channel });
      this.activeWinConditions.delete(channelKey);
      return;
    }

    const sumTeam = (players: string[]) => players.reduce((total, username) => total + (scores.get(username.toLowerCase()) || 0), 0);
    const teamRedScore = sumTeam(state.teamRedPlayers);
    const teamBlueScore = sumTeam(state.teamBluePlayers);
    let winnerTeam: Team | null = teamRedScore === teamBlueScore ? null : teamRedScore > teamBlueScore ? "red" : "blue";
    let scoreDifference = winnerTeam ? Math.abs(teamRedScore - teamBlueScore) : 0;
    let resultRedScore = teamRedScore;
    let resultBlueScore = teamBlueScore;
    ircLog.trace("Team scores calculated", { channel, teamRedScore, teamBlueScore, winnerTeam, scoreDifference });
    const activeWinCondition = this.activeWinConditions.get(channelKey);

    if (activeWinCondition && activeWinCondition.beatmapId === state.currentBeatmap?.id) {
      const outcome = await evaluateWinCondition(activeWinCondition.source, {
        redScore: teamRedScore,
        blueScore: teamBlueScore,
        redCombo: 0,
        blueCombo: 0,
        redAccuracy: 0,
        blueAccuracy: 0,
        redMisses: 0,
        blueMisses: 0,
        matchId: state.id ?? undefined,
        players: state.players,
      });
      winnerTeam = outcome.winner === "tie" ? null : outcome.winner;
      resultRedScore = outcome.result?.beatmapTeamRedScore ?? teamRedScore;
      resultBlueScore = outcome.result?.beatmapTeamBlueScore ?? teamBlueScore;
      scoreDifference = outcome.result?.scoreDifference ?? (winnerTeam ? Math.abs(resultRedScore - resultBlueScore) : 0);
      for (const text of outcome.systemMessages) stableChatBridge?.onSystemLine(channel, text);
      broadcast({
        type: "win_condition_result",
        channel: channel.replace(/^:/, ""),
        winner: outcome.winner,
        result: outcome.result,
        systemMessages: outcome.systemMessages,
        error: outcome.error,
      });
      winConditionLog.log(outcome.error ? "WARN" : "INFO", "Win condition evaluated", {
        channel,
        beatmapId: activeWinCondition.beatmapId,
        matchId: state.id,
        winner: outcome.winner,
        ...(outcome.error ? { error: outcome.error } : {}),
      });
    } else if (activeWinCondition) {
      winConditionLog.warn("Win condition skipped, beatmap changed", { channel, activeBeatmapId: activeWinCondition.beatmapId, currentBeatmapId: state.currentBeatmap?.id });
    }
    const nextPickTeam = getOppositePickTeam(state);
    ircLog.trace("Match result applied", { channel, winnerTeam, nextPickTeam, resultRedScore, resultBlueScore });
    const winningScore = getWinningScore(state.bestOf);

    this.updateLobbyState(channel, {
      lastPlay: {
        teamRedScore: resultRedScore,
        teamBlueScore: resultBlueScore,
        scoreDifference,
        winnerTeam,
      },
      ...(nextPickTeam ? { nextPickTeam } : {}),
      ...(winnerTeam === "red" && (!winningScore || state.teamRedScore < winningScore) ? { teamRedScore: state.teamRedScore + 1 } : {}),
      ...(winnerTeam === "blue" && (!winningScore || state.teamBlueScore < winningScore) ? { teamBlueScore: state.teamBlueScore + 1 } : {}),
    });
    scores.clear();
    this.activeWinConditions.delete(channelKey);
  }

  async refreshLobbyTitle(channel: string): Promise<void> {
    const matchId = getMultiplayerId(channel);
    if (!matchId) return;

    let lastError: unknown = null;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        const response = (await Promise.race([
          fetchApi(await getAccessToken(), `/matches/${matchId}`),
          new Promise((_, reject) => setTimeout(() => reject(new Error("osu! API request timed out.")), 10000)),
        ])) as { match?: { name?: string } };
        const name = response.match?.name?.trim();
        if (!name) throw new Error("osu! API returned no room title.");
        const parsed = parseBanchoBotMessage(`Room name: ${name}`);
        if (parsed?.type !== "room") throw new Error("Unable to parse the room title returned by osu! API.");
        this.updateLobbyState(channel, parsed.value);
        stableChatBridge?.onTitle(channel, parsed.value.name);
        return;
      } catch (error) {
        lastError = error;
        const message = error instanceof Error ? error.message : String(error);
        const retryable = /timed out|timeout|fetch failed|network|socket|connect/i.test(message);
        if (!retryable || attempt >= 2) {
          const text = `Unable to load the room title from osu! API after ${attempt + 1} attempt${attempt ? "s" : ""}: ${message}. Falling back to IRC.`;
          stableChatBridge?.onSystemLine(channel, text);
          broadcast({
            type: "lobby_system_message",
            channel: channel.replace(/^:/, ""),
            text,
          });
          break;
        }
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }
    }

    ircLog.warn("Lobby title refresh failed", { channel, error: lastError });
    try {
      this.sendMessage(channel, "!mp settings");
    } catch (error) {
      const text = `Unable to request the room title through IRC: ${(error as Error).message}`;
      stableChatBridge?.onSystemLine(channel, text);
      broadcast({
        type: "lobby_system_message",
        channel: channel.replace(/^:/, ""),
        text,
      });
    }
  }

  handleLobbyMessage(channel: string, nick: string | null, text: string): void {
    const command = parseLobbyCommand(text);
    if (command) {
      this.updateLobbyState(channel, command.value);
    }

    if (nick?.toLowerCase() !== "banchobot") return;
    const parsed: ParsedBanchoBotMessage = parseBanchoBotMessage(text);
    ircLog.trace("BanchoBot message processed", () => ({ channel, type: parsed?.type ?? "unknown" }));
    if (!parsed) return;

    if (parsed.type === "room") {
      this.updateLobbyState(channel, {
        players: [],
        teamRedPlayers: [],
        teamBluePlayers: [],
        activeMods: null,
        currentBeatmap: null,
        host: null,
        ...parsed.value,
      });
      stableChatBridge?.onTitle(channel, parsed.value.name);
    } else if (parsed.type === "settings" || parsed.type === "size") {
      this.updateLobbyState(channel, parsed.value);
      if (parsed.type === "settings" && this.pendingAutoSettings.has(normalizeChannel(channel))) {
        broadcast({
          type: "lobby_settings_synced",
          channel: channel.replace(/^:/, ""),
        });
      }
    } else if (parsed.type === "slot_lock") {
      const slotLocks = [...this.getLobbyState(channel).slotLocks];
      slotLocks[parsed.value.slot - 1] = parsed.value.locked;
      this.updateLobbyState(channel, { slotLocks });
    } else if (parsed.type === "mode") {
      this.updateLobbyState(channel, { mode: parsed.value });
    } else if (parsed.type === "beatmap" || parsed.type === "mods") {
      this.updateLobbyState(channel, parsed.value);
    } else if (parsed.type === "player") {
      this.upsertPlayer(channel, parsed.value);
      if (parsed.value.isHost) this.setLobbyHost(channel, parsed.value.username);
    } else if (parsed.type === "host") {
      this.setLobbyHost(channel, parsed.value.host);
    } else if (parsed.type === "player_joined") {
      this.upsertPlayer(channel, { ...parsed.value, ready: false, noMap: false, isHost: false });
    } else if (parsed.type === "player_team_changed") {
      this.updatePlayerTeam(channel, parsed.value.username, parsed.value.team);
    } else if (parsed.type === "player_moved") {
      this.upsertPlayer(channel, parsed.value);
    } else if (parsed.type === "player_left") {
      this.removePlayer(channel, parsed.value.username);
    } else if (parsed.type === "player_score") {
      this.recordPlayerScore(channel, parsed.value);
    } else if (parsed.type === "match_finished") {
      void this.finishMatch(channel);
    } else if (parsed.type === "metadata") {
      this.updateLobbyState(channel, parsed.value);
    } else if (parsed.type === "timer") {
      const timer = parsed.value;
      ircLog.trace("Lobby timer event", { channel, ...timer });
      if (timer.type === "started") {
        this.updateLobbyState(channel, {
          timer: {
            active: true,
            endsAt: Date.now() + timer.seconds * 1000,
          },
        });
      } else {
        this.updateLobbyState(channel, {
          timer: { active: false, endsAt: null },
        });
      }
    }
  }

  requestLobbySettings(channel: string): void {
    const key = normalizeChannel(channel);
    this.pendingAutoSettings.add(key);
    try {
      this.sendMessage(channel, "!mp settings");
      ircLog.traceOut("Automatic settings request", { channel });
    } catch (error) {
      this.pendingAutoSettings.delete(key);
      ircLog.warn("Automatic settings request failed", { channel, error });
    }
  }

  consumeAutoSettings(channel: string, nick: string | null, text: string): boolean {
    const key = normalizeChannel(channel);
    if (!this.isOwnNick(nick) || !this.pendingAutoSettings.has(key)) {
      return false;
    }
    if (!/^!mp\s+settings(?:\s|$)/i.test(text)) return false;
    this.pendingAutoSettings.delete(key);
    return true;
  }

  connect(login: string, password: string): void {
    if (this.state !== "disconnected" && this.state !== "error") {
      throw new Error("IRC connection is already active.");
    }

    this.buffer = "";
    this.intentionalClose = false;
    this.credentials = { login: login.replaceAll(" ", "_"), password };
    this.lobbyStates.clear();
    this.matchScoreBuffers.clear();
    this.activeWinConditions.clear();
    this.pendingAutoSettings.clear();
    this.setState("connecting");

    const socket = net.createConnection({ host: config.ircHost, port: config.ircPort });
    this.socket = socket;

    socket.setEncoding("utf8");
    socket.on("connect", () => {
      if (this.socket !== socket) {
        return;
      }

      this.setState("authenticating");
      this.sendRaw(`PASS ${this.credentials!.password}`);
      this.sendRaw(`NICK ${this.credentials!.login}`);
      this.sendRaw(`USER ${this.credentials!.login} 0 * :${this.credentials!.login}`);
    });

    socket.on("data", (chunk: Buffer | string) => {
      if (this.socket !== socket) {
        return;
      }
      this.handleData(chunk.toString());
    });

    socket.on("error", (error: Error) => {
      if (this.socket !== socket || this.intentionalClose) {
        return;
      }
      this.setState("error", error.message);
    });

    socket.on("close", () => {
      if (this.socket !== socket) {
        return;
      }
      this.socket = null;
      this.buffer = "";
      if (!this.intentionalClose && this.state !== "error") {
        this.setState("disconnected", "IRC connection closed.");
      }
      this.intentionalClose = false;
    });
  }

  handleData(chunk: string): void {
    ircLog.trace("IRC chunk received", { bytes: Buffer.byteLength(chunk), buffered: this.buffer.length });
    this.buffer += chunk;
    while (this.buffer.includes("\n")) {
      const lineEnd = this.buffer.indexOf("\n");
      const line = this.buffer.slice(0, lineEnd).replace(/\r$/, "");
      this.buffer = this.buffer.slice(lineEnd + 1);
      this.handleLine(line);
    }
  }

  handleLine(line: string): void {
    const message = parseIrcLine(line);

    if (message.command.toUpperCase() !== "QUIT") {
      ircLog.traceIn(line);
    }

    if (line.startsWith("PING")) {
      const payload = line.slice(4).trimStart();
      const pong = payload ? `PONG ${payload}` : "PONG";
      try {
        this.sendRaw(pong);
      } catch (error) {
        ircLog.warn("PONG failed", { error });
      }
      return;
    }

    if (message.command === "001") {
      this.setState("ready");
    }

    if (/^[45]\d\d$/.test(message.command)) {
      for (const param of message.params) stableChatBridge?.onJoinFailed(param);
    }

    if (["433", "451", "464"].includes(message.command)) {
      this.setState("error", config.authError);
    }

    if (message.command === "372" && message.params.some((param) => param.toLowerCase().includes("required to authenticate"))) {
      this.setState("error", config.authError);
    }

    if (message.command !== "QUIT") {
      broadcast({
        type: "irc_event",
        raw: line,
        command: message.command,
        prefix: message.prefix,
        nick: getNick(message.prefix),
        params: message.params,
      });
    }

    if (message.command === "PRIVMSG" && message.params.length >= 2) {
      const target = message.params[0];
      const nick = getNick(message.prefix);
      const text = message.params[1];
      const isDirectMessage = Boolean(this.credentials?.login && target.toLowerCase() === this.credentials.login.toLowerCase());
      const channel = isDirectMessage ? (nick?.toLowerCase() === "banchobot" ? "BanchoBot" : nick || target) : target;
      if (isMultiplayerChannel(channel)) {
        this.handleLobbyMessage(channel, nick, text);
      }
      const consumed = this.consumeAutoSettings(channel, nick, text);
      const timestamp = new Date().toISOString();
      if (!consumed && isMultiplayerChannel(channel)) {
        stableChatBridge?.onChannelMessage(channel, nick, text, timestamp);
      }
      if (!consumed) {
        // TODO(client-migration): Remove this legacy event for multiplayer channels after the client uses chat_message.
        broadcast({
          type: "message",
          channel,
          nick,
          text,
          isDirectMessage,
          timestamp,
        });
      }
    }

    if (["JOIN", "PART"].includes(message.command) && message.params[0]) {
      const channel = message.params[0].replace(/^:/, "");
      const nick = getNick(message.prefix);
      ircLog.debug(message.command === "JOIN" ? "User joined channel" : "User left channel", { channel, nick });
      if (isMultiplayerChannel(channel) && this.isOwnNick(nick)) {
        if (message.command === "JOIN") {
          this.getLobbyState(channel, true);
          stableChatBridge?.onOwnJoin(channel);
          const restored = stableChatBridge?.restoreMatchState(channel);
          if (restored) this.updateLobbyState(channel, restored);
        } else {
          this.closeLobby(channel);
          stableChatBridge?.onOwnPart(channel);
        }
      }
      // TODO(client-migration): Remove these legacy events after the client uses chat_updated.
      broadcast({
        type: message.command === "JOIN" ? "channel_joined" : "channel_parted",
        channel,
        nick,
      });
      if (message.command === "JOIN" && isMultiplayerChannel(channel) && this.isOwnNick(nick)) {
        this.sendLobbyState(channel);
      }
      if (message.command === "JOIN" && isMultiplayerChannel(channel) && this.isOwnNick(nick)) {
        this.requestLobbySettings(channel);
      }
    }
  }

  sendRaw(line: string): void {
    if (!this.socket || this.socket.destroyed) {
      throw new Error("IRC connection is not open.");
    }
    ircLog.traceOut(line.replace(/^(PASS )[^\r\n]*/i, "$1[redacted]").replace(/(!mp password) .*/i, "$1 [redacted]"));
    this.socket.write(`${line}\r\n`, "utf8");
  }

  sendMessage(channel: string, text: string): void {
    this.sendRaw(`PRIVMSG ${channel} :${text}`);
    if (isMultiplayerChannel(channel)) stableChatBridge?.onOutgoingMessage(channel, text);
    if (isMultiplayerChannel(channel)) {
      const command = parseLobbyCommand(text);
      if (command) this.updateLobbyState(channel, command.value);
    }
  }

  joinChannel(channel: string): void {
    this.sendRaw(`JOIN ${channel}`);
  }

  leaveChannel(channel: string): void {
    this.sendRaw(`PART ${channel}`);
  }

  logout(): void {
    if (!this.socket) {
      this.credentials = null;
      this.lobbyStates.clear();
      this.matchScoreBuffers.clear();
      this.pendingAutoSettings.clear();
      this.setState("disconnected");
      return;
    }

    const socket = this.socket;
    this.intentionalClose = true;
    if (!socket.destroyed) {
      socket.write("QUIT :Client logout\r\n", "utf8");
      socket.end();
    }
    this.socket = null;
    this.buffer = "";
    this.credentials = null;
    this.lobbyStates.clear();
    this.matchScoreBuffers.clear();
    this.pendingAutoSettings.clear();
    this.setState("disconnected");
  }
}

const banchoConnection = new BanchoConnection();
const updateManager = new UpdateManager();
let shuttingDown = false;

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function validateLazerRoomId(message: Record<string, unknown>): string | null {
  return Number.isSafeInteger(message.room_id) && (message.room_id as number) > 0 ? null : "room_id must be a positive integer.";
}

function validateLazerUserAction(message: Record<string, unknown>): string | null {
  const roomError = validateLazerRoomId(message);
  if (roomError) return roomError;
  return Number.isSafeInteger(message.user_id) && (message.user_id as number) > 0 ? null : "user_id must be a positive integer.";
}

function validateLazerOptionalMods(message: Record<string, unknown>): string | null {
  for (const field of ["required_mods", "allowed_mods"]) {
    const value = message[field];
    if (value === undefined || value === null) continue;
    if (!Array.isArray(value)) return `${field} must be an array or null.`;
    for (const [index, mod] of value.entries()) {
      if (!isRecord(mod) || !isNonEmptyString(mod.acronym)) return `${field}[${index}].acronym must be a non-empty string.`;
      if (mod.settings !== undefined && !isRecord(mod.settings)) return `${field}[${index}].settings must be an object.`;
    }
  }
  return null;
}

function validateLazerOptionalPlaylistFields(message: Record<string, unknown>): string | null {
  const rulesetError =
    message.ruleset_id !== undefined && message.ruleset_id !== null && (!Number.isSafeInteger(message.ruleset_id) || (message.ruleset_id as number) < 0 || (message.ruleset_id as number) > 3)
      ? "ruleset_id must be an integer from 0 to 3 or null."
      : null;
  if (rulesetError) return rulesetError;
  if (message.beatmap_id !== undefined && message.beatmap_id !== null && (!Number.isSafeInteger(message.beatmap_id) || (message.beatmap_id as number) <= 0))
    return "beatmap_id must be a positive integer or null.";
  if (message.freestyle !== undefined && message.freestyle !== null && typeof message.freestyle !== "boolean") return "freestyle must be a boolean or null.";
  return validateLazerOptionalMods(message);
}

function validateLazerPlaylistItem(message: Record<string, unknown>): string | null {
  const roomError = validateLazerRoomId(message);
  if (roomError) return roomError;
  return validateLazerOptionalPlaylistFields(message);
}

function validateMessage(message: unknown): string | null {
  if (!isRecord(message)) {
    return "Message must be a JSON object.";
  }

  if (message.requestId !== undefined && (!isNonEmptyString(message.requestId) || message.requestId.length > 128)) {
    return "requestId must be a non-empty string of at most 128 characters.";
  }

  if (!isNonEmptyString(message.type)) {
    return "Message type must be a non-empty string.";
  }

  if (message.method === "POST" && message.body === undefined) {
    return "body is required.";
  }

  const validators: Record<string, () => string | null> = {
    login: () => {
      if (!isNonEmptyString(message.login)) {
        return "login must be a non-empty string.";
      }
      if (!isNonEmptyString(message.password)) {
        return "password must be a non-empty string.";
      }
      return null;
    },
    logout: () => null,
    osu_login: () => {
      if (!isNonEmptyString(message.clientId)) return "clientId must be a non-empty string.";
      if (!isNonEmptyString(message.clientSecret)) return "clientSecret must be a non-empty string.";
      if (!isNonEmptyString(message.code)) return "code must be a non-empty string.";
      if (!isNonEmptyString(message.redirectUri)) return "redirectUri must be a non-empty string.";
      return null;
    },
    osu_logout: () => null,
    api_request: () => {
      if (!isNonEmptyString(message.endpoint)) return "endpoint must be a non-empty string.";
      return null;
    },
    send_message: () => {
      if (!isNonEmptyString(message.channel)) {
        return "channel must be a non-empty string.";
      }
      if (!isNonEmptyString(message.message)) {
        return "message must be a non-empty string.";
      }
      return null;
    },
    join_channel: () => {
      if (!isNonEmptyString(message.channel)) {
        return "channel must be a non-empty string.";
      }
      return null;
    },
    // TODO(client-migration): Replace this validator with chat_archive because both handlers are identical.
    leave_channel: () => {
      if (!isNonEmptyString(message.channel)) {
        return "channel must be a non-empty string.";
      }
      return null;
    },
    // TODO(client-migration): Replace this validator with chat_archive because both handlers are identical.
    part_channel: () => {
      if (!isNonEmptyString(message.channel)) {
        return "channel must be a non-empty string.";
      }
      return null;
    },
    refresh_lobby_title: () => {
      if (!isNonEmptyString(message.channel)) return "channel must be a non-empty string.";
      return null;
    },
    // TODO(client-migration): Decide whether to re-key this validator to chatId for the new protocol.
    set_lobby_score: () => {
      if (!isNonEmptyString(message.channel)) {
        return "channel must be a non-empty string.";
      }
      if (!Number.isSafeInteger(message.teamRedScore) || (message.teamRedScore as number) < 0) {
        return "teamRedScore must be a non-negative integer.";
      }
      if (!Number.isSafeInteger(message.teamBlueScore) || (message.teamBlueScore as number) < 0) {
        return "teamBlueScore must be a non-negative integer.";
      }
      return null;
    },
    // TODO(client-migration): Decide whether to re-key this validator to chatId for the new protocol.
    set_lobby_settings: () => {
      if (!isNonEmptyString(message.channel)) {
        return "channel must be a non-empty string.";
      }
      if (message.bestOf !== null && (!Number.isSafeInteger(message.bestOf) || (message.bestOf as number) < 1)) {
        return "bestOf must be null or a positive integer.";
      }
      if (message.nextPickTeam !== null && !isNonEmptyString(message.nextPickTeam)) {
        return "nextPickTeam must be null or a non-empty string.";
      }
      return null;
    },
    chat_lobby_state_get: () => validateLobbyCommand(String(message.type), message),
    lobby_match_set: () => validateLobbyCommand(String(message.type), message),
    lobby_map_state_set: () => validateLobbyCommand(String(message.type), message),
    lobby_map_state_clear: () => validateLobbyCommand(String(message.type), message),
    lobby_active_pool_set: () => validateLobbyCommand(String(message.type), message),
    lobby_qualification_mode_set: () => validateLobbyCommand(String(message.type), message),
    lobby_state_import: () => validateLobbyCommand(String(message.type), message),
    set_active_win_condition: () => {
      if (!isNonEmptyString(message.channel)) return "channel must be a non-empty string.";
      if (!Number.isSafeInteger(message.beatmapId) || (message.beatmapId as number) <= 0) return "beatmapId must be a positive integer.";
      if (message.source !== null && typeof message.source !== "string") return "source must be a string or null.";
      return null;
    },
    check_update: () => null,
    start_update: () => null,
    cancel_update: () => null,
    chats_list: () => {
      if (message.statuses !== undefined && (!Array.isArray(message.statuses) || message.statuses.some((status) => !["active", "closed", "archived"].includes(String(status)))))
        return "statuses must contain only active, closed, or archived values.";
      return null;
    },
    chat_history: () => (Number.isSafeInteger(message.chatId) && (message.chatId as number) > 0 ? null : "chatId must be a positive integer."),
    chat_archive: () => (Number.isSafeInteger(message.chatId) && (message.chatId as number) > 0 ? null : "chatId must be a positive integer."),
    chat_delete: () => (Array.isArray(message.chatIds) && message.chatIds.every((id) => Number.isSafeInteger(id) && (id as number) > 0) ? null : "chatIds must be an array of positive integers."),
    settings_get: () => null,
    settings_set: () => (isNonEmptyString(message.key) && Object.hasOwn(message, "value") ? null : "key must be a non-empty string and value is required."),
    confirm_install: () => null,
    test_win_condition: () => {
      if (!isNonEmptyString(message.slotId) || typeof message.source !== "string" || !isRecord(message.sampleContext)) return "slotId, source and sampleContext are required.";
      return null;
    },
    lazer_mp_command: () => {
      const roomError = validateLazerRoomId(message);
      if (roomError) return roomError;
      if (!isNonEmptyString(message.command) || message.command.length > 2000 || !/^!mp\s+/i.test(message.command.trim())) {
        return "command must be a !mp command of at most 2000 characters.";
      }
      return null;
    },
    lazer_make_room: () => {
      if (!Number.isSafeInteger(message.ruleset_id) || (message.ruleset_id as number) < 0 || (message.ruleset_id as number) > 3) return "ruleset_id must be an integer from 0 to 3.";
      if (!Number.isSafeInteger(message.beatmap_id) || (message.beatmap_id as number) <= 0) return "beatmap_id must be a positive integer.";
      if (!isNonEmptyString(message.name)) return "name must be a non-empty string.";
      if (message.match_type !== undefined && message.match_type !== "head_to_head" && message.match_type !== "team_versus") {
        return "match_type must be head_to_head or team_versus.";
      }
      if (message.queue_mode !== undefined && !["host_only", "all_players", "all_players_round_robin"].includes(String(message.queue_mode))) {
        return "queue_mode must be host_only, all_players, or all_players_round_robin.";
      }
      if (message.max_participants !== undefined && (!Number.isSafeInteger(message.max_participants) || (message.max_participants as number) < 0))
        return "max_participants must be a non-negative integer.";
      return null;
    },
    // TODO(client-migration): Remove this validator once the backend backfills chat history itself.
    lazer_load_chat: () => validateLazerRoomId(message),
    lazer_join_room: () => validateLazerRoomId(message),
    // TODO(client-migration): Remove this validator because the referee hub has no LeaveRoom method.
    lazer_leave_room: () => validateLazerRoomId(message),
    lazer_close_room: () => validateLazerRoomId(message),
    lazer_invite_player: () => validateLazerUserAction(message),
    lazer_kick_player: () => validateLazerUserAction(message),
    lazer_ban_user: () => validateLazerUserAction(message),
    lazer_add_referee: () => validateLazerUserAction(message),
    lazer_remove_referee: () => validateLazerUserAction(message),
    lazer_change_room_settings: () => {
      const roomError = validateLazerRoomId(message);
      if (roomError) return roomError;
      if (message.name !== undefined && message.name !== null && typeof message.name !== "string") return "name must be a string or null.";
      if (message.password !== undefined && message.password !== null && typeof message.password !== "string") return "password must be a string or null.";
      if (message.match_type !== undefined && message.match_type !== null && message.match_type !== "head_to_head" && message.match_type !== "team_versus") {
        return "match_type must be head_to_head, team_versus, or null.";
      }
      if (message.queue_mode !== undefined && message.queue_mode !== null && !["host_only", "all_players", "all_players_round_robin"].includes(String(message.queue_mode))) {
        return "queue_mode must be host_only, all_players, all_players_round_robin, or null.";
      }
      if (message.max_participants !== undefined && message.max_participants !== null && (!Number.isSafeInteger(message.max_participants) || (message.max_participants as number) < 0))
        return "max_participants must be a non-negative integer or null.";
      return null;
    },
    lazer_edit_current_playlist_item: () => validateLazerPlaylistItem(message),
    lazer_add_playlist_item: () => {
      const roomError = validateLazerRoomId(message);
      if (roomError) return roomError;
      if (message.freestyle !== undefined && typeof message.freestyle !== "boolean") return "freestyle must be a boolean.";
      if (message.required_mods === null || message.allowed_mods === null) return "Playlist mods must be arrays when provided.";
      if (!Number.isSafeInteger(message.ruleset_id) || (message.ruleset_id as number) < 0 || (message.ruleset_id as number) > 3) return "ruleset_id must be an integer from 0 to 3.";
      if (!Number.isSafeInteger(message.beatmap_id) || (message.beatmap_id as number) <= 0) return "beatmap_id must be a positive integer.";
      return validateLazerOptionalMods(message);
    },
    lazer_edit_playlist_item: () => {
      const roomError = validateLazerRoomId(message);
      if (roomError) return roomError;
      if (!Number.isSafeInteger(message.playlist_item_id) || (message.playlist_item_id as number) <= 0) return "playlist_item_id must be a positive integer.";
      return validateLazerOptionalPlaylistFields(message);
    },
    lazer_remove_playlist_item: () => {
      const roomError = validateLazerRoomId(message);
      if (roomError) return roomError;
      return Number.isSafeInteger(message.playlist_item_id) && (message.playlist_item_id as number) > 0 ? null : "playlist_item_id must be a positive integer.";
    },
    lazer_roll: () => {
      const roomError = validateLazerRoomId(message);
      if (roomError) return roomError;
      if (message.max !== undefined && (!Number.isSafeInteger(message.max) || (message.max as number) <= 0)) return "max must be a positive integer.";
      return null;
    },
    lazer_move_user: () => {
      const roomError = validateLazerRoomId(message);
      if (roomError) return roomError;
      if (!Number.isSafeInteger(message.user_id) || (message.user_id as number) <= 0) return "user_id must be a positive integer.";
      if (message.slot !== undefined && message.slot !== null && (!Number.isSafeInteger(message.slot) || (message.slot as number) < 0)) return "slot must be null or a non-negative integer.";
      if (message.team !== undefined && message.team !== null && message.team !== "red" && message.team !== "blue") return "team must be red, blue, or null.";
      return null;
    },
    lazer_set_lock_state: () => {
      const roomError = validateLazerRoomId(message);
      if (roomError) return roomError;
      return typeof message.locked === "boolean" ? null : "locked must be a boolean.";
    },
    lazer_start_match: () => {
      const roomError = validateLazerRoomId(message);
      if (roomError) return roomError;
      if (message.countdown !== undefined && message.countdown !== null && (!Number.isSafeInteger(message.countdown) || (message.countdown as number) < 0))
        return "countdown must be null or a non-negative integer.";
      return null;
    },
    lazer_stop_match_countdown: () => validateLazerRoomId(message),
    lazer_abort_match: () => validateLazerRoomId(message),
    lazer_list_rooms: () => null,
    lazer_send_chat_message: () => {
      const roomError = validateLazerRoomId(message);
      if (roomError) return roomError;
      if (!isNonEmptyString(message.message)) return "message must be a non-empty string.";
      return message.is_action === undefined || typeof message.is_action === "boolean" ? null : "is_action must be a boolean.";
    },
  };

  const validator = validators[message.type];
  if (!validator) {
    return `Unknown message type: ${message.type}`;
  }

  return validator();
}

function sendUpdateError(client: WebSocket, error: unknown): void {
  const updateError = error instanceof UpdateError ? error : new UpdateError("UPDATE_FAILED", (error as Error).message);
  sendJson(client, { type: "update_error", code: updateError.code, message: updateError.message });
}

async function handleCheckUpdate(client: WebSocket): Promise<void> {
  try {
    sendJson(client, await updateManager.check());
  } catch (error) {
    sendUpdateError(client, error);
  }
}

async function handleStartUpdate(client: WebSocket): Promise<void> {
  try {
    await updateManager.download((payload) => sendJson(client, payload));
  } catch (error) {
    sendUpdateError(client, error);
  }
}

async function handleCancelUpdate(client: WebSocket): Promise<void> {
  try {
    await updateManager.cancel();
  } catch (error) {
    sendUpdateError(client, error);
  }
}

function handleConfirmInstall(client: WebSocket): void {
  try {
    updateManager.install((payload) => sendJson(client, payload));
    setTimeout(() => shutdown("update"), 250);
  } catch (error) {
    sendUpdateError(client, error);
  }
}

async function handleTestWinCondition(client: WebSocket, message: ClientMessage): Promise<void> {
  const payload = message as Extract<ClientMessage, { type: "test_win_condition" }>;
  const result = await evaluateWinCondition(payload.source, payload.sampleContext as unknown as WinConditionContext);
  if (result.error) {
    winConditionLog.warn("Win condition test failed", { slotId: payload.slotId, error: result.error });
  } else {
    winConditionLog.debug("Win condition test completed", () => ({ slotId: payload.slotId, winner: result.winner, messages: result.systemMessages }));
  }
  sendJson(client, { type: "win_condition_test_result", slotId: payload.slotId, ...result });
}

function handleSetActiveWinCondition(client: WebSocket, message: ClientMessage): void {
  const payload = message as Extract<ClientMessage, { type: "set_active_win_condition" }>;
  const channelKey = normalizeChannel(payload.channel);
  const source = payload.source?.trim() || "";
  if (source) {
    banchoConnection.activeWinConditions.set(channelKey, { beatmapId: payload.beatmapId, source });
  } else {
    banchoConnection.activeWinConditions.delete(channelKey);
  }
  winConditionLog.debug(source ? "Active win condition set" : "Active win condition cleared", { channel: channelKey, ...(source ? { beatmapId: payload.beatmapId } : {}) });
  sendJson(client, { type: "ack", received: message.type });
}

function handleLogin(client: WebSocket, message: ClientMessage): void {
  const { login, password } = message as Extract<ClientMessage, { type: "login" }>;
  try {
    addClient(client);
    banchoConnection.connect(login.trim(), password);
    sendJson(client, { type: "ack", received: message.type });
  } catch (error) {
    sendJson(client, { type: "error", message: (error as Error).message });
  }
}

function handleLogout(client: WebSocket): void {
  banchoConnection.logout();
  sendJson(client, { type: "ack", received: "logout" });
}

async function handleOsuLogin(client: WebSocket, message: ClientMessage): Promise<void> {
  const previous = osuSessionTransition;
  let release!: () => void;
  osuSessionTransition = new Promise<void>((resolve) => {
    release = resolve;
  });
  await previous;
  const { clientId, clientSecret, code, redirectUri } = message as Extract<ClientMessage, { type: "osu_login" }>;
  try {
    await stopLazerSession();
    const user = await loginOsu({ clientId: clientId.trim(), clientSecret: clientSecret, redirectUri: redirectUri.trim() }, code.trim());
    await startLazerSession();
    startChatSocket();
    sendJson(client, { type: "osu_user", user });
  } catch (error) {
    authLog.warn("OAuth request failed", { error });
    sendJson(client, { type: "error", request: "osu_login", message: (error as Error).message || "Unable to reach the osu! API." });
  } finally {
    release();
  }
}

async function handleOsuLogout(client: WebSocket): Promise<void> {
  const previous = osuSessionTransition;
  let release!: () => void;
  osuSessionTransition = new Promise<void>((resolve) => {
    release = resolve;
  });
  await previous;
  try {
    await stopLazerSession();
    const status = await logoutOsu();
    sendJson(client, { type: "ack", received: "osu_logout", status });
  } catch (error) {
    authLog.warn("Logout failed", { error });
    sendJson(client, { type: "error", request: "osu_logout", message: "Unable to log out from the osu! API." });
  } finally {
    release();
  }
}

async function handleApiRequest(client: WebSocket, message: ClientMessage): Promise<void> {
  const { endpoint, method, body } = message as Extract<ClientMessage, { type: "api_request" }>;
  if (!config.allowedApiEndpoints.some((pattern) => pattern.test(endpoint))) {
    sendJson(client, { type: "error", request: "api_request", message: "Endpoint not allowed" });
    return;
  }

  if (body !== undefined && (!body || typeof body !== "object" || Array.isArray(body))) {
    sendJson(client, { type: "error", request: "api_request", message: "Request body must be an object" });
    return;
  }

  if (method !== undefined && method !== "GET" && method !== "POST") {
    sendJson(client, { type: "error", request: "api_request", message: "Unsupported HTTP method" });
    return;
  }

  try {
    const accessToken = await getAccessToken();
    const response = await fetchApi(accessToken, endpoint, method, body as Record<string, unknown>);
    sendJson(client, { type: "api_response", endpoint, response });
  } catch (error) {
    apiLog.warn("API request failed", { error });
    const messageText = (error as Error)?.name === "NotAuthenticatedError" ? "You must be logged in to access the osu! API." : (error as Error).message || "Unable to reach the osu! API.";
    sendJson(client, {
      type: "error",
      request: "api_request",
      message: messageText,
      ...(error instanceof Error && "code" in error ? { code: error.code, outcomeUnknown: "outcomeUnknown" in error ? error.outcomeUnknown : false } : {}),
      ...(error instanceof Error && "retryAfterMs" in error ? { retryAfterMs: error.retryAfterMs } : {}),
    });
  }
}

function handleSendMessage(client: WebSocket, message: ClientMessage): void {
  const { channel, message: msg } = message as Extract<ClientMessage, { type: "send_message" }>;
  try {
    banchoConnection.sendMessage(channel.trim(), msg);
    sendJson(client, { type: "ack", received: message.type });
  } catch (error) {
    sendJson(client, { type: "error", message: (error as Error).message });
  }
}

function handleJoinChannel(client: WebSocket, message: ClientMessage): void {
  const { channel } = message as Extract<ClientMessage, { type: "join_channel" }>;
  try {
    banchoConnection.joinChannel(channel.trim());
    sendJson(client, { type: "ack", received: message.type });
  } catch (error) {
    sendJson(client, { type: "error", message: (error as Error).message });
  }
}

// TODO(client-migration): Replace this handler with chat_archive because both handlers are identical.
function handleLeaveChannel(client: WebSocket, message: ClientMessage): void {
  const { channel } = message as Extract<ClientMessage, { type: "leave_channel" }>;
  try {
    banchoConnection.leaveChannel(channel.trim());
    sendJson(client, { type: "ack", received: message.type });
  } catch (error) {
    sendJson(client, { type: "error", message: (error as Error).message });
  }
}

// TODO(client-migration): Replace this handler with chat_archive because both handlers are identical.
function handlePartChannel(client: WebSocket, message: ClientMessage): void {
  const { channel } = message as Extract<ClientMessage, { type: "part_channel" }>;
  try {
    banchoConnection.leaveChannel(channel.trim());
    sendJson(client, { type: "ack", received: message.type });
  } catch (error) {
    sendJson(client, { type: "error", message: (error as Error).message });
  }
}

function handleSetLobbyTitle(client: WebSocket, message: ClientMessage): void {
  const payload = message as Extract<ClientMessage, { type: "refresh_lobby_title" }>;
  void banchoConnection.refreshLobbyTitle(payload.channel.trim());
  sendJson(client, { type: "ack", received: message.type });
}

// TODO(client-migration): Decide whether to re-key this handler to chatId for the new protocol.
function handleSetLobbyScore(client: WebSocket, message: ClientMessage): void {
  const { channel, teamRedScore, teamBlueScore } = message as Extract<ClientMessage, { type: "set_lobby_score" }>;
  try {
    const state = banchoConnection.getLobbyState(channel.trim());
    validateMatchScores(state.bestOf, { teamRedScore, teamBlueScore });
    banchoConnection.updateLobbyState(channel.trim(), {
      teamRedScore,
      teamBlueScore,
    });
    sendJson(client, { type: "ack", received: message.type });
  } catch (error) {
    sendJson(client, { type: "error", message: (error as Error).message });
  }
}

// TODO(client-migration): Decide whether to re-key this handler to chatId for the new protocol.
function handleSetLobbySettings(client: WebSocket, message: ClientMessage): void {
  const { channel, bestOf, nextPickTeam } = message as Extract<ClientMessage, { type: "set_lobby_settings" }>;
  try {
    banchoConnection.updateLobbyState(channel.trim(), {
      bestOf,
      nextPickTeam,
    });
    sendJson(client, { type: "ack", received: message.type });
  } catch (error) {
    sendJson(client, { type: "error", message: (error as Error).message });
  }
}

function handleClientMessage(client: WebSocket, rawMessage: unknown): void {
  const validationError = validateMessage(rawMessage);
  if (validationError) {
    wsLog.warn("Invalid client message", { error: validationError });
    sendJson(client, {
      type: "error",
      ...(isRecord(rawMessage) && isNonEmptyString(rawMessage.type) ? { request: rawMessage.type } : {}),
      ...(isRecord(rawMessage) && typeof rawMessage.requestId === "string" ? { requestId: rawMessage.requestId } : {}),
      code: "VALIDATION_ERROR",
      message: validationError,
    });
    return;
  }

  const message = rawMessage as ClientMessage;

  wsLog.debug(`< ${message.type}`, () => {
    const logMessage: Record<string, unknown> = { ...message };
    delete logMessage.password;
    delete logMessage.clientSecret;
    delete logMessage.code;
    return { payload: logMessage };
  });

  const handlers: Record<string, (client: WebSocket, message: ClientMessage) => void | Promise<void>> = {
    login: handleLogin,
    logout: handleLogout,
    osu_login: handleOsuLogin,
    osu_logout: handleOsuLogout,
    api_request: handleApiRequest,
    send_message: handleSendMessage,
    join_channel: handleJoinChannel,
    // TODO(client-migration): Replace this registry entry with chat_archive because both handlers are identical.
    leave_channel: handleLeaveChannel,
    // TODO(client-migration): Replace this registry entry with chat_archive because both handlers are identical.
    part_channel: handlePartChannel,
    refresh_lobby_title: handleSetLobbyTitle,
    // TODO(client-migration): Decide whether to re-key this registry entry to chatId for the new protocol.
    set_lobby_score: handleSetLobbyScore,
    // TODO(client-migration): Decide whether to re-key this registry entry to chatId for the new protocol.
    set_lobby_settings: handleSetLobbySettings,
    set_active_win_condition: handleSetActiveWinCondition,
    check_update: handleCheckUpdate,
    start_update: handleStartUpdate,
    cancel_update: handleCancelUpdate,
    chats_list: (client, message) => {
      try {
        sendJson(client, { type: "chats_list_response", chats: chatService.listChats((message as Extract<ClientMessage, { type: "chats_list" }>).statuses) });
      } catch (error) {
        sendJson(client, { type: "error", message: (error as Error).message });
      }
    },
    chat_history: (client, message) => {
      try {
        const { chatId } = message as Extract<ClientMessage, { type: "chat_history" }>;
        sendJson(client, { type: "chat_history_response", chatId, messages: chatService.getChatHistory(chatId) });
      } catch (error) {
        sendJson(client, { type: "error", request: message.type, chatId: (message as Extract<ClientMessage, { type: "chat_history" }>).chatId, message: (error as Error).message });
      }
    },
    chat_archive: (client, message) => {
      deferredChatEvents = [];
      try {
        chatService.archiveChat((message as Extract<ClientMessage, { type: "chat_archive" }>).chatId);
        sendJson(client, { type: "ack", received: message.type });
      } catch (error) {
        sendJson(client, { type: "error", request: message.type, message: (error as Error).message });
      } finally {
        flushChatEvents();
      }
    },
    chat_delete: (client, message) => {
      deferredChatEvents = [];
      try {
        const { chatIds } = message as Extract<ClientMessage, { type: "chat_delete" }>;
        const known = new Set(chatService.listChats().map((chat) => chat.id));
        const unknown = [...new Set(chatIds)].filter((id) => !known.has(id));
        if (unknown.length) throw new Error(`Unknown chats: ${unknown.join(", ")}`);
        const { skipped } = chatService.deleteChats(chatIds);
        if (skipped.length) throw new Error(`Chats were not archived and could not be deleted: ${skipped.join(", ")}`);
        sendJson(client, { type: "ack", received: message.type });
      } catch (error) {
        sendJson(client, { type: "error", request: message.type, message: (error as Error).message });
      } finally {
        flushChatEvents();
      }
    },
    settings_get: (client) => sendJson(client, { type: "settings_response", settings: chatService.getSettings() }),
    settings_set: (client, message) => {
      try {
        const { key, value } = message as Extract<ClientMessage, { type: "settings_set" }>;
        chatService.setSetting(key, value);
        sendJson(client, { type: "ack", received: message.type });
      } catch (error) {
        sendJson(client, { type: "error", message: (error as Error).message });
      }
    },
    ...createLobbyHandlers(chatService, banchoConnection),
    confirm_install: handleConfirmInstall,
    test_win_condition: handleTestWinCondition,
    lazer_mp_command: handleLazerMpCommand,
    lazer_make_room: lazerHandlers.handleLazerMakeRoom,
    // TODO(client-migration): Remove this registry entry once the backend backfills chat history itself.
    lazer_load_chat: lazerHandlers.handleLazerLoadChat,
    lazer_join_room: lazerHandlers.handleLazerJoinRoom,
    // TODO(client-migration): Remove this registry entry because the referee hub has no LeaveRoom method.
    lazer_leave_room: lazerHandlers.handleLazerLeaveRoom,
    lazer_close_room: lazerHandlers.handleLazerCloseRoom,
    lazer_invite_player: lazerHandlers.handleLazerInvitePlayer,
    lazer_kick_player: lazerHandlers.handleLazerKickPlayer,
    lazer_ban_user: lazerHandlers.handleLazerBanUser,
    lazer_add_referee: lazerHandlers.handleLazerAddReferee,
    lazer_remove_referee: lazerHandlers.handleLazerRemoveReferee,
    lazer_change_room_settings: lazerHandlers.handleLazerChangeRoomSettings,
    lazer_edit_current_playlist_item: lazerHandlers.handleLazerEditCurrentPlaylistItem,
    lazer_add_playlist_item: lazerHandlers.handleLazerAddPlaylistItem,
    lazer_edit_playlist_item: lazerHandlers.handleLazerEditPlaylistItem,
    lazer_remove_playlist_item: lazerHandlers.handleLazerRemovePlaylistItem,
    lazer_roll: lazerHandlers.handleLazerRoll,
    lazer_move_user: lazerHandlers.handleLazerMoveUser,
    lazer_set_lock_state: lazerHandlers.handleLazerSetLockState,
    lazer_start_match: lazerHandlers.handleLazerStartMatch,
    lazer_stop_match_countdown: lazerHandlers.handleLazerStopMatchCountdown,
    lazer_abort_match: lazerHandlers.handleLazerAbortMatch,
    lazer_list_rooms: lazerHandlers.handleLazerListRooms,
    lazer_send_chat_message: lazerHandlers.handleLazerSendChatMessage,
  };

  const operation = wsLog.traceStart(`Handle ${message.type}`, { requestId: message.requestId });
  try {
    const result = handlers[message.type](client, message);
    if (result)
      void result.then(
        () => operation.end(),
        (error) => operation.fail(error),
      );
    else operation.end();
  } catch (error) {
    operation.fail(error);
    throw error;
  }
}

webSocketServer.on("connection", (client) => {
  addClient(client);
  sendJson(client, lazerConnectionState);
  sendJson(client, lazerSyncState);
  // A browser reconnect reuses the live hub session and cached room snapshots.
  for (const room of roomManager.getAllRooms()) sendJson(client, { type: "lazer_room_state", room });
  sendJson(client, { type: "lazer_rooms", roomIds: roomManager.getAllRooms().map((room) => room.room_id) } satisfies LazerRoomsEvent);
  banchoConnection.sendStatus(client);
  for (const [channel, state] of banchoConnection.lobbyStates) {
    banchoConnection.sendLobbyState(channel, state, client);
  }

  client.on("message", (data) => {
    let message: unknown;
    try {
      message = JSON.parse(data.toString());
    } catch {
      wsLog.warn("Client sent invalid JSON");
      sendJson(client, {
        type: "error",
        message: "Message must be valid JSON.",
      });
      return;
    }
    requestContext.run({ requestId: isRecord(message) && typeof message.requestId === "string" ? message.requestId : undefined }, () => handleClientMessage(client, message));
  });

  client.on("close", () => {
    removeClient(client);
    if (clientCount() === 0) {
      banchoConnection.logout();
    }
  });
});

httpServer.listen(config.httpPort, config.httpHost, () => {
  logger.startupBanner({ version: packageInfo.version, url: `http://localhost:${config.httpPort}`, nodeVersion: process.version, os: `${os.type()} ${os.release()}`, arch: process.arch });
  logger.info("WebSocket endpoint ready", { url: `ws://${config.httpHost}:${config.httpPort}/ws` });

  const browserUrl = `http://localhost:${config.httpPort}${launchedAfterUpdate ? "?updated=1" : ""}`;

  openInBrowser(browserUrl);

  // Serve the frontend before restoring authentication or contacting osu!.
  const previous = osuSessionTransition;
  osuSessionTransition = (async () => {
    await previous;
    try {
      await restoreSession();
      if (shuttingDown || getState().status !== "authenticated") return;
      startChatSocket();
      await startLazerSession();
    } catch (error) {
      sessionLog.error("Session startup failed", { error });
    }
  })();
});

try {
  chatService = new ChatService(openDatabase(), {
    onChatUpdated: (chat) => emitChatEvent({ type: "chat_updated", chat }),
    onChatDeleted: (chatId) => emitChatEvent({ type: "chat_deleted", chatId }),
    onMessage: (message) => emitChatEvent({ type: "chat_message", message }),
    onSettingsUpdated: (settings) => emitChatEvent({ type: "settings_updated", settings }),
    onLobbyStateUpdated: (chatId, lobbyState) => emitChatEvent({ type: "chat_lobby_state_updated", chatId, lobbyState }),
  });
  stableChatBridge = new StableChatBridge({
    chatService,
    irc: banchoConnection,
    logger: ircLog,
  });
  const userNames = new UserNameResolver();
  lazerChatBridge = new LazerChatBridge({
    chatService,
    roomManager,
    fetchHistory: fetchChatMessagesSince,
    resolveName: (id) => userNames.resolve(id),
    rememberName: (id, username) => userNames.remember(id, username),
    logger: sessionLog,
  });
  setLazerChatBridge(lazerChatBridge);
  chatService.registerPlatformAdapter("lazer", { detach: (chat) => lazerChatBridge.detach(chat) });
  chatService.registerPlatformAdapter("stable", { detach: (chat) => stableChatBridge.detach(chat) });
  chatService.startup();
} catch (error) {
  chatServiceLog.critical("Chat database could not be opened", { error });
  void logger.flush().finally(() => process.exit(1));
}

createTray({ port: config.httpPort, onQuit: () => shutdown("tray") });

function shutdown(signal?: string): void {
  if (shuttingDown) {
    return;
  }
  shuttingDown = true;
  if (process.stdin.isTTY && typeof process.stdin.setRawMode === "function") {
    process.stdin.setRawMode(false);
  }
  logger.separator(`Shutting down${signal ? ` (${signal})` : ""}`);
  if (typeof stableChatBridge !== "undefined") stableChatBridge.setShuttingDown();
  banchoConnection.logout();

  for (const client of webSocketServer.clients) {
    logger.trace("Terminating frontend connection");
    client.terminate();
  }

  // Keep the process alive until the hub has sent its disconnect as well.
  // Abrupt termination leaves the old referee connection active remotely.
  let pendingClosures = 3;
  const finishClosure = (component: string) => {
    pendingClosures -= 1;
    logger.trace("Component closure completed", { component, pendingClosures });
    if (pendingClosures === 0) {
      chatService.shutdown();
      void logger.flush().finally(() => process.exit(0));
    }
  };

  const shutdownTimer = setTimeout(() => {
    logger.warn("Shutdown timed out, forcing exit", { pendingClosures });
    chatService.shutdown();
    void logger.flush().finally(() => process.exit(0));
  }, 5000);
  shutdownTimer.unref();

  logger.trace("Closing lazer session, WebSocket and HTTP servers", { pendingClosures });
  void stopLazerSession()
    .catch((error) => sessionLog.warn("Failed to stop session", { error }))
    .finally(() => finishClosure("lazer"));

  webSocketServer.close(() => finishClosure("webSocket"));
  if (httpServer.listening) {
    httpServer.close(() => finishClosure("http"));
  } else {
    finishClosure("http");
  }
}

if (process.stdin.isTTY && typeof process.stdin.setRawMode === "function") {
  process.stdin.setRawMode(true);
  process.stdin.resume();
  process.stdin.on("data", (data: Buffer) => {
    if (data.includes(0x03)) {
      shutdown("CTRL+C");
    }
  });
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGBREAK", () => shutdown("SIGBREAK"));
