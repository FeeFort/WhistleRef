export type ChatNotification = {
  event: string;
  data: unknown;
};

export type ChatMessage = Record<string, unknown>;

export type ChatSocketOptions = {
  accessToken: string | (() => Promise<string>);
  onNotification: (notification: ChatNotification) => void;
  onError?: (error: Error) => void;
};

export type HubEventHandler = (event: LazerHubEvent) => void;
export type ResyncHandler = () => Promise<void>;

export interface RoomState {
  roomId: number;
  [key: string]: unknown;
}

export type RoomChangeListener = (room: RoomState) => void;
export type RoomRemovedListener = (roomId: number) => void;

export type MatchType = "head_to_head" | "team_versus";
export type MatchTeam = "red" | "blue";
export type QueueMode = "host_only" | "all_players" | "all_players_round_robin";
export type MatchUserStatus = "idle" | "ready" | "playing" | "finished_play" | "spectating";
export type CountdownType = "match_start" | "server_shutting_down";

export interface LazerMod {
  acronym: string;
  settings?: Record<string, unknown>;
}

export interface ResolvedLazerUser {
  userId: number;
  username: string;
}

export interface LazerModDefinition {
  Acronym: string;
  Name?: string;
  IncompatibleMods?: string[];
  ValidForMultiplayer?: boolean;
  ValidForMultiplayerAsFreeMod?: boolean;
  [key: string]: unknown;
}

export interface LazerRulesetMods {
  RulesetID?: number;
  Mods?: LazerModDefinition[];
}

// ---- Requests ----

export interface MakeRoomRequest {
  ruleset_id: number;
  beatmap_id: number;
  name: string;
  type?: MatchType;
  queue_mode?: QueueMode;
  max_participants?: number;
}

export interface ChangeRoomSettingsRequest {
  name?: string | null;
  password?: string | null;
  match_type?: MatchType | null;
  queue_mode?: QueueMode | null;
  max_participants?: number | null;
}

export interface EditPlaylistItemRequestParameters {
  ruleset_id?: number | null;
  beatmap_id?: number | null;
  required_mods?: LazerMod[] | null;
  allowed_mods?: LazerMod[] | null;
  freestyle?: boolean | null;
}

export type EditCurrentPlaylistItemRequest = EditPlaylistItemRequestParameters;

export interface EditPlaylistItemRequest extends EditPlaylistItemRequestParameters {
  playlist_item_id: number;
}

export interface AddPlaylistItemRequest {
  ruleset_id: number;
  beatmap_id: number;
  required_mods?: LazerMod[];
  allowed_mods?: LazerMod[];
  freestyle?: boolean;
}

export interface RemovePlaylistItemRequest {
  playlist_item_id: number;
}

export interface MoveUserRequest {
  user_id: number;
  slot?: number | null;
  team?: MatchTeam | null;
}

export interface RollRequest {
  max?: number;
}

export interface SetLockStateRequest {
  locked: boolean;
}

export interface StartGameplayRequest {
  countdown?: number | null;
}

// ---- Responses ----

export interface LazerStyle {
  ruleset_id: number | null;
  beatmap_id: number | null;
}

export interface LazerPlayer {
  user_id: number;
  status: MatchUserStatus;
  style: LazerStyle;
  mods: LazerMod[];
  team: MatchTeam | null;
}

export interface LazerReferee {
  user_id: number;
}

export interface LazerPlaylistItem {
  id: number;
  ruleset_id: number;
  beatmap_id: number;
  required_mods: LazerMod[];
  allowed_mods: LazerMod[];
  freestyle: boolean;
  was_played: boolean;
  order: number;
}

export interface LazerMatchState {
  type: MatchType;
  locked: boolean;
  slots: (number | null)[] | null;
  playlist_item_id?: number;
}

export interface RoomJoinedResponse {
  room_id: number;
  chat_channel_id: number;
  name: string;
  password: string;
  max_participants: number;
  queue_mode: QueueMode;
  current_playlist_item_id?: number;
  playlist_item_id?: number;
  ruleset_id?: number;
  state: LazerMatchState;
  playlist: LazerPlaylistItem[];
  players: LazerPlayer[];
  referees: LazerReferee[];
}

export interface ListRoomsResponse {
  room_ids: number[];
}

// ---- Events (IRefereeHubClient) ----

export interface RefereeAddedEvent {
  room_id: number;
  user_id: number;
}
export interface RefereeRemovedEvent {
  room_id: number;
  user_id: number;
}
export interface RefereeInvitedEvent {
  room_id: number;
}
export interface RoomSettingsChangedEvent {
  room_id: number;
  name: string;
  password: string;
  type: MatchType;
  queue_mode: QueueMode;
  playlist_item_id: number;
  max_participants: number | null;
}
export interface MatchStateChangedEvent {
  room_id: number;
  state: LazerMatchState;
}
export interface PlaylistItemAddedEvent {
  room_id: number;
  playlist_item: LazerPlaylistItem;
}
export interface PlaylistItemChangedEvent {
  room_id: number;
  playlist_item: LazerPlaylistItem;
}
export interface PlaylistItemRemovedEvent {
  room_id: number;
  playlist_item_id: number;
}
export interface RollCompletedEvent {
  room_id: number;
  user_id: number;
  max: number;
  result: number;
}
export interface UserStatusChangedEvent {
  room_id: number;
  user_id: number;
  status: MatchUserStatus;
}
export interface UserModsChangedEvent {
  room_id: number;
  user_id: number;
  mods: LazerMod[];
}
export interface UserStyleChangedEvent {
  room_id: number;
  user_id: number;
  beatmap_id: number | null;
  ruleset_id: number | null;
}
export interface UserTeamChangedEvent {
  room_id: number;
  user_id: number;
  team: MatchTeam | null;
}
export interface CountdownStartedEvent {
  room_id: number;
  countdown_id: number;
  seconds: number;
  type: CountdownType;
}
export interface CountdownStoppedEvent {
  room_id: number;
  countdown_id: number;
  type: CountdownType;
}
export interface MatchStartedEvent {
  room_id: number;
  playlist_item_id: number;
  type: MatchType;
  teams: Record<string, MatchTeam> | null;
  slots: Record<string, number> | null;
}
export interface MatchAbortedEvent {
  room_id: number;
  playlist_item_id: number;
}
export interface MatchCompletedEvent {
  room_id: number;
  playlist_item_id: number;
}
export interface UserJoinedEvent {
  room_id: number;
  user_id: number;
}
export interface UserLeftEvent {
  room_id: number;
  user_id: number;
}
export interface UserKickedEvent {
  room_id: number;
  kicked_user_id: number;
  kicking_user_id: number;
}
export interface UserBannedEvent {
  room_id: number;
  banned_user_id: number;
  banning_user_id: number;
}

// Payloads and WebSocket envelope for incoming referee hub events.
export interface HubEventPayloads {
  UserJoined: UserJoinedEvent;
  UserLeft: UserLeftEvent;
  UserKicked: UserKickedEvent;
  UserBanned: UserBannedEvent;
  RefereeAdded: RefereeAddedEvent;
  RefereeRemoved: RefereeRemovedEvent;
  RefereeInvited: RefereeInvitedEvent;
  RoomSettingsChanged: RoomSettingsChangedEvent;
  MatchStateChanged: MatchStateChangedEvent;
  PlaylistItemAdded: PlaylistItemAddedEvent;
  PlaylistItemChanged: PlaylistItemChangedEvent;
  PlaylistItemRemoved: PlaylistItemRemovedEvent;
  RollCompleted: RollCompletedEvent;
  UserStatusChanged: UserStatusChangedEvent;
  UserModsChanged: UserModsChangedEvent;
  UserStyleChanged: UserStyleChangedEvent;
  UserTeamChanged: UserTeamChangedEvent;
  CountdownStarted: CountdownStartedEvent;
  CountdownStopped: CountdownStoppedEvent;
  MatchStarted: MatchStartedEvent;
  MatchAborted: MatchAbortedEvent;
  MatchCompleted: MatchCompletedEvent;
}

export type HubEventType = keyof HubEventPayloads;

export type LazerHubEvent = {
  [K in HubEventType]: {
    type: "lazer_event";
    eventType: K;
    roomId: number;
    payload: HubEventPayloads[K];
  };
}[HubEventType];

export interface PendingRoomJoin {
  cancelled: boolean;
  startedAt: number;
  events: Array<{ eventType: HubEventType; payload: HubEventPayloads[HubEventType]; deferred?: boolean }>;
  promise: Promise<void>;
}

export interface LazerConnectionStateEvent {
  type: "lazer_connection_state";
  state: "connecting" | "connected" | "reconnecting" | "disconnected";
  reason?: string;
}

export type LazerSyncStateEvent =
  | { type: "lazer_sync_state"; state: "idle" | "syncing" | "synced" }
  | { type: "lazer_sync_state"; state: "retrying"; operation: "ListRooms" | "JoinRoom"; roomId?: number; attempt: number; maxAttempts: number; retryIn: number }
  | { type: "lazer_sync_state"; state: "failed"; message: string; failedRoomIds: number[]; scope: "all" | "partial" };

export interface LazerRoomErrorEvent {
  type: "lazer_room_error";
  roomId: number;
  operation: "join";
  message: string;
}

export type LazerStatusEvent = LazerConnectionStateEvent | LazerSyncStateEvent | LazerRoomErrorEvent;
export type LazerStatusHandler = (event: LazerStatusEvent) => void;

export interface LazerRoomsEvent {
  type: "lazer_rooms";
  roomIds: number[];
}
