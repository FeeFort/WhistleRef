import type { LOG_LEVELS } from "./logger/logger.js";

// Logger types
export type LogLevel = (typeof LOG_LEVELS)[number];
export type LogScope = "core" | "stable" | "lazer";
export type LogFields = Readonly<Record<string, unknown>>;
export type LogFieldsInput = LogFields | (() => LogFields);

export interface LogRecord {
  readonly operation?: TraceOperationDetails;
  readonly kind?: "separator" | "banner";
  readonly banner?: StartupBannerInfo;
  readonly timestamp: Date;
  readonly level: LogLevel;
  readonly scope: LogScope;
  readonly component: string;
  readonly message: string;
  readonly fields: LogFields;
}

export interface TraceOperationDetails {
  readonly id: number;
  readonly phase: "start" | "end" | "failed";
  readonly durationMs?: number;
}

export interface TraceOperation {
  readonly id: number;
  end(fields?: LogFieldsInput): void;
  fail(error: unknown, level?: LogLevel, fields?: LogFieldsInput): void;
}

export interface StartupBannerInfo {
  version: string;
  url: string;
  nodeVersion: string;
  os: string;
  arch: string;
  level: LogLevel;
}

export type LogSink = (record: LogRecord) => void;
export type LogFileSink = ((record: LogRecord) => void) & { flush?: () => Promise<void> };

export interface LogFormatOptions {
  level?: LogLevel;
  colors: boolean;
  isTTY: boolean;
  columns?: number;
}

export interface LoggerOptions {
  level?: LogLevel;
  colors?: boolean;
  sink?: LogSink;
  fileSink?: LogFileSink;
  fileLevel?: LogLevel;
  now?: () => Date;
  monotonicNow?: () => number;
}

export interface LoggerRuntimeOptions {
  level: LogLevel;
  colors: boolean;
}

export interface FileLoggingOptions {
  enabled: boolean;
  directory: string;
  maxFileBytes?: number;
  retentionDays?: number;
  maxDirectoryBytes?: number;
}

export interface LoggerState {
  fileLevel: LogLevel;
  fileSink?: LogFileSink;
  operationSequence: number;
  bannerShown: boolean;
  level: LogLevel;
  colors: boolean;
  sink: LogSink;
  now: () => Date;
  monotonicNow: () => number;
}

// error
export type ErrorWithCode = { code: string };
export type ErrorWithRetryAfter = { retryAfterMs: number };

// Raw types, basically how osu! api responds
export interface OsuTokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
  refresh_token: string;
}

export interface OsuOAuthErrorResponse {
  error: string;
  error_description?: string;
  hint?: string;
}

// Normalized type
export interface OsuTokenSet {
  accessToken: string;
  refreshToken: string;
  expiresAt: number; // absolute timestamp
}

// User profile
export interface OsuApiMeResponse {
  id: number;
  username: string;
  avatar_url: string;
  // everything else is irrelevant
}

export interface OsuUser {
  id: number;
  username: string;
  avatarUrl: string;
}

// Authenticating
export interface OsuOAuthCredentials {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
}

export type AuthState =
  | { status: "unauthenticated" }
  | { status: "authenticating" }
  | { status: "authenticated"; tokens: OsuTokenSet; user: OsuUser; credentials: Pick<OsuOAuthCredentials, "clientId" | "clientSecret"> }
  | { status: "error"; message: string };

export type OsuScope = "public" | "multiplayer.write_manage" | "chat.read" | "chat.write" | "identify";

export type NotAuthenticatedReason = "not_logged_in" | "session_expired";

// BanchoBot parser types
export type TeamMode = "HeadToHead" | "TagCoop" | "TeamVs" | "TagTeamVs";
export type ScoreMode = "Score" | "Accuracy" | "Combo" | "ScoreV2";
export type GameMode = "osu!" | "osu!taiko" | "osu!catch" | "osu!mania";

export type RoomInfo = { name: string; qualifiers: boolean } | { name: string; qualifiers: boolean; teamRed: string; teamBlue: string };

export type TeamSettings = {
  teamMode: TeamMode;
  scoreMode: ScoreMode;
  size?: number;
};

export type BeatmapInfo = {
  id: number;
  beatmapId: number;
  url: string;
  title: string | null;
};

export type ActiveMods = { activeMods: string | null };

export type PlayerSnapshot = {
  username: string;
  profileUrl: string;
  userId: number | null;
  avatarUrl: string | null;
  slot: number;
  ready: boolean;
  noMap: boolean;
  isHost?: true;
  team: "red" | "blue" | null;
  mods: string[];
};

export type PlayerJoined = { username: string; slot: number; team: Team | null; mods: string[] };
export type PlayerLeft = { username: string };
export type PlayerTeamChange = { username: string; team: Team };
export type PlayerSlotChange = { username: string; slot: number };
export type PlayerScore = { username: string; score: number; result: string };
export type HostChange = { host: string | null };
export type MatchFinished = { finished: true };
export type MatchMetadata = { bestOf: number } | { nextPickTeam: string };
export type SizeConfirmation = { size: number };
export type SlotLockState = { slot: number; locked: boolean };
export type TimerMessage = { type: "aborted" } | { type: "finished" } | { type: "started"; seconds: number };
export type MpSetCommand = { teamMode: TeamMode; scoreMode: ScoreMode; size: number };
export type MpSizeCommand = { size: number };

export type ParsedBanchoBotMessage =
  | { type: "room"; value: RoomInfo }
  | { type: "settings"; value: TeamSettings }
  | { type: "beatmap"; value: { currentBeatmap: BeatmapInfo } }
  | { type: "mods"; value: ActiveMods }
  | { type: "player"; value: PlayerSnapshot }
  | { type: "player_joined"; value: PlayerJoined }
  | { type: "player_left"; value: PlayerLeft }
  | { type: "player_moved"; value: PlayerSlotChange }
  | { type: "player_team_changed"; value: PlayerTeamChange }
  | { type: "player_score"; value: PlayerScore }
  | { type: "host"; value: HostChange }
  | { type: "match_finished"; value: MatchFinished }
  | { type: "metadata"; value: MatchMetadata }
  | { type: "size"; value: SizeConfirmation }
  | { type: "slot_lock"; value: SlotLockState }
  | { type: "timer"; value: TimerMessage }
  | { type: "mode"; value: GameMode }
  | null;

export type ParsedLobbyCommand = { type: "settings"; value: MpSetCommand } | { type: "size"; value: MpSizeCommand } | null;

//Server data types
export type Team = "red" | "blue";

export type Player = {
  username: string;
  profileUrl: string | null;
  userId: number | null;
  avatarUrl: string | null;
  slot: number;
  ready: boolean;
  noMap: boolean;
  isHost: boolean;
  team: Team | null;
  mods: string[];
};

export type LastPlay = {
  teamRedScore: number | null;
  teamBlueScore: number | null;
  scoreDifference: number | null;
  winnerTeam: Team | null;
};

export type Timer = {
  active: boolean;
  endsAt: number | null;
};

export type LobbyState = {
  id: number | null;
  name: string;
  qualifiers: boolean;
  teamRed: string;
  teamBlue: string;
  teamRedScore: number;
  teamBlueScore: number;
  bestOf: number | null;
  nextPickTeam: string | null;
  matchStatus: string | null;
  teamRedPlayers: string[];
  teamBluePlayers: string[];
  lastPlay: LastPlay;
  players: Player[];
  currentBeatmap: BeatmapInfo | null;
  activeMods: string | null;
  host: string | null;
  teamMode: TeamMode;
  scoreMode: ScoreMode;
  mode: GameMode;
  slots: (string | null)[];
  slotLocks: boolean[];
  size: number;
  timer: Timer;
  status: "active" | "closed";
};

export type IrcCredentials = { login: string; password: string };

export type IrcLine = {
  prefix: string | null;
  command: string;
  params: string[];
};

export type ConnectionState = "disconnected" | "connecting" | "authenticating" | "ready" | "error";

//WS message type
export type ClientMessage = ClientCommand & { requestId?: string };

export type ClientCommand =
  | { type: "login"; login: string; password: string }
  | { type: "logout" }
  | { type: "osu_login"; clientId: string; clientSecret: string; code: string; redirectUri: string }
  | { type: "osu_logout" }
  | { type: "api_request"; endpoint: string; method?: AllowedMethods; body?: unknown }
  | { type: "send_message"; channel: string; message: string }
  | { type: "join_channel"; channel: string }
  | { type: "leave_channel"; channel: string }
  | { type: "part_channel"; channel: string }
  | { type: "refresh_lobby_title"; channel: string }
  | { type: "set_lobby_score"; channel: string; teamRedScore: number; teamBlueScore: number }
  | { type: "set_lobby_settings"; channel: string; bestOf: number | null; nextPickTeam: string | null }
  | { type: "set_active_win_condition"; channel: string; beatmapId: number; source: string | null }
  | { type: "check_update" }
  | { type: "start_update" }
  | { type: "cancel_update" }
  | { type: "confirm_install" }
  | { type: "test_win_condition"; slotId: string; source: string; sampleContext: Record<string, unknown> }
  | {
      type: "lazer_make_room";
      ruleset_id: number;
      beatmap_id: number;
      name: string;
      match_type?: MatchType;
      queue_mode?: QueueMode;
      max_participants?: number;
    }
  | { type: "lazer_load_chat"; room_id: number }
  | { type: "lazer_join_room"; room_id: number }
  | { type: "lazer_leave_room"; room_id: number }
  | { type: "lazer_close_room"; room_id: number }
  | { type: "lazer_invite_player"; room_id: number; user_id: number }
  | { type: "lazer_kick_player"; room_id: number; user_id: number }
  | { type: "lazer_ban_user"; room_id: number; user_id: number }
  | { type: "lazer_add_referee"; room_id: number; user_id: number }
  | { type: "lazer_remove_referee"; room_id: number; user_id: number }
  | ({ type: "lazer_change_room_settings"; room_id: number } & ChangeRoomSettingsRequest)
  | ({ type: "lazer_edit_current_playlist_item"; room_id: number } & EditCurrentPlaylistItemRequest)
  | ({ type: "lazer_add_playlist_item"; room_id: number } & AddPlaylistItemRequest)
  | ({ type: "lazer_edit_playlist_item"; room_id: number } & EditPlaylistItemRequest)
  | ({ type: "lazer_remove_playlist_item"; room_id: number } & RemovePlaylistItemRequest)
  | ({ type: "lazer_roll"; room_id: number } & RollRequest)
  | ({ type: "lazer_move_user"; room_id: number } & MoveUserRequest)
  | ({ type: "lazer_set_lock_state"; room_id: number } & SetLockStateRequest)
  | ({ type: "lazer_start_match"; room_id: number } & StartGameplayRequest)
  | { type: "lazer_stop_match_countdown"; room_id: number }
  | { type: "lazer_abort_match"; room_id: number }
  | { type: "lazer_send_chat_message"; room_id: number; message: string; is_action?: boolean };

export interface PersistedSession {
  clientId: string;
  clientSecret: string;
  refreshToken: string;
  user: OsuUser;
}

export type AllowedMethods = "GET" | "POST";
export type InternalApiMethod = AllowedMethods | "DELETE";

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

//Updater

export interface GithubAsset {
  name: string;
  browser_download_url: string;
  size: number;
  digest?: string;
}

export interface GithubRelease {
  tag_name: string;
  html_url?: string;
  published_at?: string;
  assets: GithubAsset[];
}

export interface UpdateInfo {
  version: string;
  asset: GithubAsset;
  releaseNotesUrl?: string;
  publishedAt?: string;
}

export type UpdateProgress =
  { type: "update_progress"; stage: "downloading"; totalBytes: number; downloadedBytes: number } | { type: "update_progress"; stage: "verifying" | "ready_to_install" | "installing" };

export type UpdateCheckResult = {
  type: "update_check_result";
  available: boolean;
  currentVersion: string;
  latestVersion?: string;
  releaseNotesUrl?: string;
  publishedAt?: string;
};

export type UpdaterState = "idle" | "checking" | "available" | "downloading" | "ready_to_install" | "installing";
export type UpdateProgressSender = (payload: UpdateProgress) => void;
export type ApplyUpdate = (parentPid: number, assetPath: string) => Promise<void>;

export interface MenuItem {
  title: string;
  tooltip: string;
  checked: boolean;
  enabled: boolean;
  click?: () => void;
}

export interface SysTrayOptions {
  menu: { icon: string; title: string; tooltip: string; items: MenuItem[] };
  debug?: boolean;
  copyDir?: boolean;
}

export interface ClickAction {
  item: MenuItem;
}

export interface SysTrayInstance {
  onClick(callback: (action: ClickAction) => void): void;
  ready(): Promise<void>;
  kill(exitNode?: boolean): void;
}

export type DbusModule = typeof import("dbus-next");
export interface TrayOptions {
  port: number;
  onQuit: () => void;
}
export interface KdeTrayOptions {
  port: number;
  onQuit: () => void;
}
export interface KdeTrayInstance {
  ready(): Promise<void>;
  kill(): void;
}

// stats fetcher types

export interface PlayerMapResult {
  userId: number;
  username: string;
  team: Team;
  score: number;
  accuracy: number; // percentage (0..100), rounded to two decimal places
  combo: number;
  misses: number;
  count300: number; // count_300 + count_geki
  count100: number; // count_100 + count_katu
  count50: number;
  mods: string[];
  passed: boolean;
  rank: string;
}

export type TeamMapResult = {
  score: number;
  misses: number;
  count300: number;
  count100: number;
  count50: number;
  accuracy: number[];
  combo: number[];
  players: PlayerMapResult[];
} & Record<`player${number}`, PlayerMapResult>;

export interface MapResult {
  matchId: number;
  gameId: number;
  beatmapId: number;
  mode: string;
  mods: string[];
  startTime: string;
  endTime: string | null;
  teamRed: TeamMapResult;
  teamBlue: TeamMapResult;
}

export interface RawMatchUser {
  id: number;
  username: string;
}

export interface RawMatchScore {
  user_id: number;
  score: number;
  accuracy: number;
  max_combo: number;
  mods: string[];
  passed: boolean;
  rank: string;
  statistics?: { count_300?: number; count_100?: number; count_50?: number; count_miss?: number; count_geki?: number; count_katu?: number };
  match?: { team?: Team; slot?: number; pass?: boolean };
}

export interface RawMatchGame {
  id: number;
  beatmap_id: number;
  mode: string;
  mods: string[];
  start_time: string;
  end_time: string | null;
  scores: RawMatchScore[];
}

export interface RawMatchEvent {
  game?: RawMatchGame;
}

export interface RawMatchResponse {
  match: { id: number };
  events: RawMatchEvent[];
  users: RawMatchUser[];
}

export type WinConditionWinner = "red" | "blue" | "tie";

export interface WinConditionContext {
  redScore: number;
  blueScore: number;
  redCombo: number;
  blueCombo: number;
  redAccuracy: number;
  blueAccuracy: number;
  redMisses: number;
  blueMisses: number;
  players?: unknown[];
  matchId?: number;
  [key: string]: unknown;
}

export interface WinConditionOutcome {
  winner: WinConditionWinner;
  error: string | null;
  systemMessages: string[];
  result: { beatmapWinner: WinConditionWinner; beatmapTeamRedScore: number; beatmapTeamBlueScore: number; scoreDifference: number } | null;
}

// SignalR API types

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
}

export interface RoomJoinedResponse {
  room_id: number;
  chat_channel_id: number;
  name: string;
  password: string;
  max_participants: number;
  queue_mode: QueueMode;
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

export interface RequestFailure {
  code: "REQUEST_TIMEOUT" | "INVALID_RESPONSE" | "RATE_LIMIT_QUEUE_FULL" | "RATE_LIMIT_WAIT_TIMEOUT" | "REQUEST_CANCELLED" | "RATE_LIMITED";
  retryAfterMs?: number;
  outcomeUnknown: boolean;
}

export type LazerChatStateEvent = {
  type: "lazer_chat_state";
  roomId: number;
  requestId?: string;
} & ({ state: "loading" | "ready" } | { state: "failed"; stage: "channel" | "history"; message: string; code?: string });

export interface PendingChatLoad {
  cancelled: boolean;
  promise: Promise<ChatMessage[]>;
}

export interface LazerRoomsEvent {
  type: "lazer_rooms";
  roomIds: number[];
}

export interface RateLimitConfig {
  tokensPerSecond: number;
  capacity: number;
  concurrency: number;
  maxQueue: number;
  maxWaitMs: number;
}

export interface RateLimitEntry {
  resolve: (release: () => void) => void;
  reject: (error: Error) => void;
  expiresAt: number;
  signal?: AbortSignal;
  cancel: () => void;
}
