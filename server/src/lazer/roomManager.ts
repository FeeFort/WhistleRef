import { logger } from "../logger/logger.js";
import type {
  RoomJoinedResponse as RoomState,
  RoomJoinedResponse,
  HubEventType,
  HubEventPayloads,
  PendingRoomJoin,
  MakeRoomRequest,
  RoomSettingsChangedEvent,
  MatchStateChangedEvent,
  PlaylistItemAddedEvent,
  PlaylistItemChangedEvent,
  PlaylistItemRemovedEvent,
  UserStatusChangedEvent,
  UserModsChangedEvent,
  UserStyleChangedEvent,
  UserTeamChangedEvent,
  UserJoinedEvent,
  UserLeftEvent,
  UserKickedEvent,
  UserBannedEvent,
  RefereeAddedEvent,
  RefereeRemovedEvent,
  LazerPlayer,
  LazerPlaylistItem,
  MatchUserStatus,
  ListRoomsResponse,
  LazerStatusHandler,
  HubEventHandler,
  LazerHubEvent,
  PendingChatLoad,
  ChatMessage,
} from "../types.js";
import { config } from "../config.js";
import { fetchChatMessages } from "./chatApi.js";
import { invokeHub, invokeHubWithRetry } from "./refereeHubClient.js";

const log = logger.child("lazer", "roomManager");

class RoomManager {
  private currentUserId: number | null = null;
  private excludedRooms = new Set<number>();
  private generation = 0;
  private replayPlaylist: Map<number, LazerPlaylistItem> | null = null;
  private replayPlayers: Map<number, LazerPlayer> | null = null;
  private rooms = new Map<number, RoomState>();
  private pendingJoins = new Map<number, PendingRoomJoin>();
  private pendingCreations = new Set<PendingRoomJoin>();
  private pendingChatLoads = new Map<number, PendingChatLoad>();
  private resyncPromise: Promise<void> | null = null;
  private onRoomChanged: ((room: RoomState) => void) | null = null;
  private onDeferredEvent: HubEventHandler | null = null;
  private onStatus: LazerStatusHandler | null = null;
  private onRoomRemoved: ((roomId: number) => void) | null = null;
  private joinedChatChannels = new Set<number>();
  private chatWaiters = new Map<number, Array<(error?: Error) => void>>();

  setListeners(onChanged: (room: RoomState) => void, onRemoved: (roomId: number) => void, onStatus?: LazerStatusHandler, onDeferredEvent?: HubEventHandler): void {
    this.onRoomChanged = onChanged;
    this.onRoomRemoved = onRemoved;
    this.onStatus = onStatus ?? null;
    this.onDeferredEvent = onDeferredEvent ?? null;
  }

  reset(): void {
    log.debug("Resetting room tracking", { rooms: this.rooms.size, pendingJoins: this.pendingJoins.size });
    this.currentUserId = null;
    ++this.generation;
    log.trace("Session generation advanced, cancelling pending work", {
      generation: this.generation,
      joins: this.pendingJoins.size,
      creations: this.pendingCreations.size,
      chatLoads: this.pendingChatLoads.size,
    });
    this.excludedRooms.clear();
    for (const pending of [...this.pendingJoins.values(), ...this.pendingCreations]) pending.cancelled = true;
    this.pendingJoins.clear();
    this.pendingCreations.clear();
    this.resyncPromise = null;
    for (const load of this.pendingChatLoads.values()) load.cancelled = true;
    this.pendingChatLoads.clear();
    for (const roomId of [...this.rooms.keys()]) this.removeRoom(roomId);
    this.joinedChatChannels.clear();
    for (const waiters of this.chatWaiters.values()) {
      for (const done of waiters) done(new Error("osu! session ended."));
    }
    this.chatWaiters.clear();
    this.onStatus?.({ type: "lazer_sync_state", state: "idle" });
  }

  trackRoom(room: RoomState): void {
    log.debug("Tracking room snapshot", { roomId: room.room_id, players: room.players.length, playlist: room.playlist.length });
    this.rooms.set(room.room_id, room);
    this.onRoomChanged?.(room);
  }

  setCurrentUserId(userId: number): void {
    this.currentUserId = userId;
  }

  getRoom(roomId: number): RoomState | undefined {
    return this.rooms.get(roomId);
  }

  getAllRooms(): RoomState[] {
    return [...this.rooms.values()];
  }

  getRoomByChatChannel(channelId: number): RoomState | undefined {
    return this.getAllRooms().find((room) => room.chat_channel_id === channelId);
  }

  markChatChannelJoined(channelId: number): void {
    log.trace("Chat channel joined", { channelId });
    this.joinedChatChannels.add(channelId);
    for (const resolve of this.chatWaiters.get(channelId) ?? []) resolve();
    this.chatWaiters.delete(channelId);
  }

  async waitForChatChannel(channelId: number, timeoutMs = 10_000): Promise<void> {
    log.trace("Waiting for chat channel", { channelId, timeoutMs });
    if (this.joinedChatChannels.has(channelId)) return;
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => {
        log.trace("Chat channel wait timed out", { channelId, timeoutMs });
        const waiters = this.chatWaiters.get(channelId) ?? [];
        this.chatWaiters.set(
          channelId,
          waiters.filter((waiter) => waiter !== done),
        );
        reject(new Error(`Chat channel ${channelId} was not joined in time.`));
      }, timeoutMs);
      const done = (error?: Error) => {
        clearTimeout(timer);
        log.trace("Chat channel wait completed, timer cancelled", { channelId, failed: Boolean(error) });
        if (error) reject(error);
        else resolve();
      };
      const waiters = this.chatWaiters.get(channelId) ?? [];
      waiters.push(done);
      this.chatWaiters.set(channelId, waiters);
    });
  }

  loadChat(roomId: number): Promise<ChatMessage[]> {
    log.debug("Loading room chat", { roomId });
    const existing = this.pendingChatLoads.get(roomId);
    if (existing) {
      log.trace("Sharing pending chat load", { roomId });
      return existing.promise;
    }
    const room = this.rooms.get(roomId);
    if (!room) return Promise.reject(Object.assign(new Error(`Room ${roomId} is not tracked.`), { stage: "channel" }));
    const generation = this.generation;
    const pending: PendingChatLoad = { cancelled: false, promise: Promise.resolve([]) };
    this.pendingChatLoads.set(roomId, pending);
    pending.promise = (async () => {
      let stage = "channel";
      try {
        await this.waitForChatChannel(room.chat_channel_id);
        if (pending.cancelled || generation !== this.generation) throw new Error("osu! session or room ended.");
        stage = "history";
        const history = await fetchChatMessages(room.chat_channel_id);
        if (pending.cancelled || generation !== this.generation) throw new Error("osu! session or room ended.");
        log.debug("Room chat loaded", { roomId, count: history.length });
        return history;
      } catch (error) {
        log.warn("Room chat load failed", { roomId, stage, error });
        // TODO: Retry chat initialization with the shared exponential backoff policy.
        throw Object.assign(error instanceof Error ? error : new Error(String(error)), {
          stage,
          ...(pending.cancelled || generation !== this.generation ? { code: "SESSION_ENDED" } : {}),
        });
      } finally {
        if (this.pendingChatLoads.get(roomId) === pending) this.pendingChatLoads.delete(roomId);
      }
    })();
    return pending.promise;
  }

  private findPlayer(room: RoomState, userId: number): LazerPlayer | undefined {
    return room.players.find((p) => p.user_id === userId);
  }

  private upsertPlayerStub(room: RoomState, userId: number): LazerPlayer {
    let player = this.findPlayer(room, userId);
    if (!player) {
      // A Left/Joined pair may already be included in the snapshot. Restore the
      // full snapshot entry rather than losing status, mods, style and team.
      player = this.replayPlayers?.has(userId)
        ? structuredClone(this.replayPlayers.get(userId)!)
        : { user_id: userId, status: "idle", style: { ruleset_id: null, beatmap_id: null }, mods: [], team: null };
      room.players.push(player);
    }
    return player;
  }

  handleHubEvent(eventType: HubEventType, payload: HubEventPayloads[HubEventType]): boolean {
    log.trace("Applying hub event", { eventType });
    const roomId = payload.room_id;
    if (typeof roomId !== "number") {
      log.warn("Event has no room ID, ignoring", { eventType });
      return false;
    }

    if (eventType === "UserKicked" && (payload as UserKickedEvent).kicked_user_id === this.currentUserId) {
      this.removeRoom(roomId, true);
      return true;
    }

    const pendingJoin = this.pendingJoins.get(roomId);
    if (eventType === "RefereeInvited") {
      if (this.excludedRooms.has(roomId)) return false;
      // This notification is addressed to the invited referee. Added/Removed
      // instead describe changes to the creator's tracked referee list.
      if (!pendingJoin && !this.rooms.has(roomId)) {
        const generation = this.generation;
        this.joinRoom(roomId).catch((error) => {
          if (generation !== this.generation) return;
          this.onStatus?.({ type: "lazer_room_error", roomId, operation: "join", message: error instanceof Error ? error.message : String(error) });
          // TODO: Retry automatic joins using the shared exponential backoff policy.
          log.warn("Failed to join invited room", { roomId, error });
        });
      }
      // Deliver the invitation immediately, independently of the join result.
      return true;
    }

    if (pendingJoin) {
      pendingJoin.events.push({ eventType, payload });
      log.trace("Event buffered during join", { roomId, eventType, pending: pendingJoin.events.length });
      return true;
    }

    if (!this.rooms.has(roomId) && this.pendingCreations.size) {
      for (const creation of this.pendingCreations) {
        // Creation is bounded by the hub timeout; also cap retained events under load.
        if (Date.now() - creation.startedAt <= config.hubRequestTimeoutMs && creation.events.length < 512) {
          creation.events.push({ eventType, payload, deferred: true });
          log.trace("Event buffered during creation", { roomId, eventType, pending: creation.events.length });
        } else log.warn("Creation event buffer limit reached", { eventType });
      }
      return false;
    }

    const room = this.rooms.get(roomId);
    if (!room) {
      // If we don't have the room tracked, we can't update it. Safely ignoring instead
      log.warn("Event for unknown room, ignoring", { eventType, roomId });
      return false;
    }

    const previousState = JSON.stringify(room);

    switch (eventType) {
      case "RoomSettingsChanged": {
        const e = payload as unknown as RoomSettingsChangedEvent;
        room.name = e.name;
        room.password = e.password;
        room.state.type = e.type;
        room.queue_mode = e.queue_mode;
        room.max_participants = e.max_participants ?? 0;
        break;
      }
      case "MatchStateChanged": {
        const e = payload as unknown as MatchStateChangedEvent;
        room.state = e.state;
        break;
      }
      case "PlaylistItemAdded": {
        const e = payload as unknown as PlaylistItemAddedEvent;
        // A refreshed snapshot may already contain an event buffered during JoinRoom.
        const index = room.playlist.findIndex((item) => item.id === e.playlist_item.id);
        if (index === -1) room.playlist.push(this.replayPlaylist?.has(e.playlist_item.id) ? structuredClone(this.replayPlaylist.get(e.playlist_item.id)!) : e.playlist_item);
        break;
      }
      case "PlaylistItemChanged": {
        const e = payload as unknown as PlaylistItemChangedEvent;
        const index = room.playlist.findIndex((item) => item.id === e.playlist_item.id);
        if (index !== -1) room.playlist[index] = e.playlist_item;
        break;
      }
      case "PlaylistItemRemoved": {
        const e = payload as unknown as PlaylistItemRemovedEvent;
        room.playlist = room.playlist.filter((item) => item.id !== e.playlist_item_id);
        break;
      }
      case "UserJoined": {
        const e = payload as unknown as UserJoinedEvent;
        this.upsertPlayerStub(room, e.user_id);
        break;
      }
      case "UserLeft": {
        const e = payload as unknown as UserLeftEvent;
        room.players = room.players.filter((p) => p.user_id !== e.user_id);
        break;
      }
      case "UserKicked": {
        const e = payload as unknown as UserKickedEvent;
        room.players = room.players.filter((p) => p.user_id !== e.kicked_user_id);
        break;
      }
      case "UserBanned": {
        const e = payload as unknown as UserBannedEvent;
        room.players = room.players.filter((p) => p.user_id !== e.banned_user_id);
        break;
      }
      case "UserStatusChanged": {
        const e = payload as unknown as UserStatusChangedEvent;
        this.upsertPlayerStub(room, e.user_id).status = e.status as MatchUserStatus;
        break;
      }
      case "UserModsChanged": {
        const e = payload as unknown as UserModsChangedEvent;
        this.upsertPlayerStub(room, e.user_id).mods = e.mods;
        break;
      }
      case "UserStyleChanged": {
        const e = payload as unknown as UserStyleChangedEvent;
        this.upsertPlayerStub(room, e.user_id).style = { ruleset_id: e.ruleset_id, beatmap_id: e.beatmap_id };
        break;
      }
      case "UserTeamChanged": {
        const e = payload as unknown as UserTeamChangedEvent;
        this.upsertPlayerStub(room, e.user_id).team = e.team;
        break;
      }
      case "RefereeAdded": {
        const e = payload as RefereeAddedEvent;
        if (!room.referees.some((referee) => referee.user_id === e.user_id)) room.referees.push({ user_id: e.user_id });
        break;
      }
      case "RefereeRemoved": {
        const e = payload as unknown as RefereeRemovedEvent;
        room.referees = room.referees.filter((r) => r.user_id !== e.user_id);
        break;
      }
      // Events without state changes are forwarded by index.ts
      default:
        return true;
    }

    const changed = JSON.stringify(room) !== previousState;
    log.trace(changed ? "Room state changed" : "Event left room state unchanged", { roomId, eventType, replaying: Boolean(this.replayPlayers) });
    if (!this.replayPlayers && changed) this.onRoomChanged?.(room);
    return true;
  }

  removeRoom(roomId: number, excludeFromResync = false): void {
    log.debug("Removing room", { roomId, excludeFromResync });
    if (excludeFromResync) this.excludedRooms.add(roomId);
    const chatLoad = this.pendingChatLoads.get(roomId);
    if (chatLoad) chatLoad.cancelled = true;
    this.pendingChatLoads.delete(roomId);
    const pending = this.pendingJoins.get(roomId);
    if (pending) pending.cancelled = true;
    if (this.rooms.delete(roomId)) {
      this.onRoomRemoved?.(roomId);
    }
  }

  async joinRoom(roomId: number | null, request?: MakeRoomRequest, onRetry?: (attempt: number, maxAttempts: number, retryIn: number) => void): Promise<RoomState> {
    log.debug(roomId === null ? "Creating room" : "Joining room", { roomId });
    const generation = this.generation;
    const existing = roomId === null ? undefined : this.pendingJoins.get(roomId);
    if (existing) {
      log.trace("Sharing pending room join", { roomId, generation });
      await existing.promise;
      if (generation !== this.generation) {
        log.trace("Stale room operation ignored", { generation, currentGeneration: this.generation });
        throw new Error("osu! session ended.");
      }
      const room = roomId === null ? undefined : this.rooms.get(roomId);
      if (!room) throw new Error(`Room ${roomId} was not joined.`);
      return room;
    }

    const pending: PendingRoomJoin = { cancelled: false, startedAt: Date.now(), events: [], promise: Promise.resolve() };
    if (roomId === null) this.pendingCreations.add(pending);
    else this.pendingJoins.set(roomId, pending);
    pending.promise = (async () => {
      try {
        const response =
          roomId === null
            ? await invokeHub<RoomJoinedResponse>("MakeRoom", request)
            : onRetry
              ? await invokeHubWithRetry<RoomJoinedResponse>("JoinRoom", onRetry, roomId)
              : await invokeHub<RoomJoinedResponse>("JoinRoom", roomId);
        roomId = response.room_id;
        if (this.excludedRooms.has(roomId)) pending.cancelled = true;
        if (!pending.cancelled) this.rooms.set(roomId, response);
      } finally {
        this.pendingCreations.delete(pending);
        if (roomId !== null && this.pendingJoins.get(roomId) === pending) this.pendingJoins.delete(roomId);
        if (!pending.cancelled && roomId !== null && this.rooms.has(roomId)) {
          const room = this.rooms.get(roomId)!;
          this.replayPlayers = new Map(room.players.map((player) => [player.user_id, structuredClone(player)]));
          this.replayPlaylist = new Map(room.playlist.map((item) => [item.id, structuredClone(item)]));
          try {
            // Replay any events that were received during the JoinRoom/MakeRoom call, which may have been buffered by the hub.
            log.trace("Replaying buffered events", { roomId, count: pending.events.length });
            for (const event of pending.events) {
              if (event.payload.room_id === roomId) this.handleHubEvent(event.eventType, event.payload);
              else log.trace("Buffered event belongs to another room, ignoring", { roomId, eventRoomId: event.payload.room_id, eventType: event.eventType });
            }
          } finally {
            this.replayPlayers = null;
            this.replayPlaylist = null;
          }
          if (this.rooms.get(roomId) === room) this.onRoomChanged?.(room);
          for (const event of pending.events) {
            if (event.deferred && event.payload.room_id === roomId) {
              this.onDeferredEvent?.({ type: "lazer_event", eventType: event.eventType, roomId, payload: event.payload } as LazerHubEvent);
            }
          }
        }
      }
    })();
    await pending.promise;
    if (pending.cancelled || generation !== this.generation) throw new Error("osu! session ended.");
    const room = roomId === null ? undefined : this.rooms.get(roomId);
    if (!room) throw new Error(`Room ${roomId} was not joined.`);
    return room;
  }

  resync(): Promise<void> {
    if (this.resyncPromise) {
      log.debug("Sync already running, sharing pending operation");
      return this.resyncPromise;
    }
    log.debug("Sync starting", () => ({ tracked: [...this.rooms.keys()], excluded: [...this.excludedRooms] }));

    const generation = this.generation;
    this.onStatus?.({ type: "lazer_sync_state", state: "syncing" });
    this.resyncPromise = (async () => {
      const failedRoomIds: number[] = [];
      let listed = false;
      try {
        let listRetried = false;
        const response = await invokeHubWithRetry<ListRoomsResponse>("ListRooms", (attempt, maxAttempts, retryIn) => {
          listRetried = true;
          if (generation === this.generation) this.onStatus?.({ type: "lazer_sync_state", state: "retrying", operation: "ListRooms", attempt, maxAttempts, retryIn });
        });
        if (listRetried && generation === this.generation) this.onStatus?.({ type: "lazer_sync_state", state: "syncing" });
        if (generation !== this.generation) {
          log.trace("Stale room operation ignored", { generation, currentGeneration: this.generation });
          throw new Error("osu! session ended.");
        }
        const liveRoomIds = new Set(response.room_ids.filter((roomId) => !this.excludedRooms.has(roomId)));
        listed = true;
        log.debug("Room list received", () => ({ returned: response.room_ids, restoring: [...liveRoomIds] }));

        for (const roomId of this.rooms.keys()) {
          if (!liveRoomIds.has(roomId)) this.removeRoom(roomId);
        }

        const errors: Error[] = [];
        for (const roomId of liveRoomIds) {
          if (this.excludedRooms.has(roomId)) continue;
          try {
            // JoinRoom returns a full snapshot and restores hub subscriptions; invokeHub retries transient failures,
            // including the hub briefly retaining a referee in the room after reconnect.
            log.debug("Restoring room", { roomId, refresh: this.rooms.has(roomId) });
            let joinRetried = false;
            await this.joinRoom(roomId, undefined, (attempt, maxAttempts, retryIn) => {
              joinRetried = true;
              if (generation === this.generation) this.onStatus?.({ type: "lazer_sync_state", state: "retrying", operation: "JoinRoom", roomId, attempt, maxAttempts, retryIn });
            });
            if (joinRetried && generation === this.generation) this.onStatus?.({ type: "lazer_sync_state", state: "syncing" });
          } catch (error) {
            if (generation !== this.generation) throw error;
            const failure = new Error(`Failed to refresh room ${roomId}: ${(error as Error).message}`, { cause: error });
            log.warn("Room synchronization failed", { roomId, error: failure });
            errors.push(failure);
            failedRoomIds.push(roomId);
          }
        }
        if (errors.length) throw new AggregateError(errors, "Some rooms could not be synchronized.");
        log.debug("Sync completed", () => ({ tracked: [...this.rooms.keys()] }));
        this.onStatus?.({ type: "lazer_sync_state", state: "synced" });
      } catch (error) {
        log.warn("Synchronization failed", { scope: listed ? "partial" : "all", failedRooms: failedRoomIds });
        if (generation === this.generation)
          this.onStatus?.({ type: "lazer_sync_state", state: "failed", scope: listed ? "partial" : "all", failedRoomIds, message: error instanceof Error ? error.message : String(error) });
        // TODO: Retry using the shared API exponential backoff policy once implemented.
        throw error;
      } finally {
        if (generation === this.generation) this.resyncPromise = null;
      }
    })();
    return this.resyncPromise;
  }
}

export const roomManager = new RoomManager();
