import type { AllowedMethods } from "./osu-api.js";
import type { ChatStatus } from "./db.js";
import type { ChatSettings, ChatWire, MessageWire } from "./chats.js";
import type { LobbyMatch, LobbyStateDocument } from "../chats/lobbyState.js";
import type {
  AddPlaylistItemRequest,
  ChangeRoomSettingsRequest,
  EditCurrentPlaylistItemRequest,
  EditPlaylistItemRequest,
  MatchType,
  MoveUserRequest,
  QueueMode,
  RemovePlaylistItemRequest,
  RollRequest,
  SetLockStateRequest,
  StartGameplayRequest,
} from "./lazer.js";

//WS message type
export type ClientMessage = ClientCommand & { requestId?: string };

export type ChatServerMessage =
  | { type: "chats_list_response"; chats: ChatWire[]; requestId?: string }
  | { type: "chat_history_response"; chatId: number; messages: MessageWire[]; requestId?: string }
  | { type: "settings_response"; settings: ChatSettings; requestId?: string }
  | { type: "chat_lobby_state_response"; chatId: number; lobbyState: LobbyStateDocument; requestId?: string }
  | { type: "chat_updated"; chat: ChatWire }
  | { type: "chat_deleted"; chatId: number }
  | { type: "chat_message"; message: MessageWire }
  | { type: "chat_lobby_state_updated"; chatId: number; lobbyState: LobbyStateDocument }
  | { type: "settings_updated"; settings: ChatSettings };

export type ClientCommand =
  | { type: "login"; login: string; password: string }
  | { type: "logout" }
  | { type: "osu_login"; clientId: string; clientSecret: string; code: string; redirectUri: string }
  | { type: "osu_logout" }
  | { type: "api_request"; endpoint: string; method?: AllowedMethods; body?: unknown }
  | { type: "send_message"; channel: string; message: string }
  | { type: "join_channel"; channel: string }
  // TODO(client-migration): Replace these commands with chat_archive because both handlers are identical.
  | { type: "leave_channel"; channel: string }
  // TODO(client-migration): Replace these commands with chat_archive because both handlers are identical.
  | { type: "part_channel"; channel: string }
  | { type: "refresh_lobby_title"; channel: string }
  // TODO(client-migration): Decide whether to re-key this command to chatId for the new protocol.
  | { type: "set_lobby_score"; channel: string; teamRedScore: number; teamBlueScore: number }
  // TODO(client-migration): Decide whether to re-key this command to chatId for the new protocol.
  | { type: "set_lobby_settings"; channel: string; bestOf: number | null; nextPickTeam: string | null }
  | { type: "set_active_win_condition"; channel: string; beatmapId: number; source: string | null }
  | { type: "check_update" }
  | { type: "start_update" }
  | { type: "cancel_update" }
  | { type: "chats_list"; statuses?: ChatStatus[] }
  | { type: "chat_history"; chatId: number }
  | { type: "chat_archive"; chatId: number }
  | { type: "chat_delete"; chatIds: number[] }
  | { type: "settings_get" }
  | { type: "settings_set"; key: string; value: unknown }
  | { type: "chat_lobby_state_get"; chatId: number }
  | { type: "lobby_match_set"; chatId: number; patch: LobbyMatch }
  | { type: "lobby_map_state_set"; chatId: number; slot: string; patch: Record<string, unknown> }
  | { type: "lobby_map_state_clear"; chatId: number }
  | { type: "lobby_active_pool_set"; chatId: number; poolId: string | null }
  | { type: "lobby_qualification_mode_set"; chatId: number; enabled: boolean }
  | { type: "lobby_state_import"; lobbies: unknown[] }
  | { type: "confirm_install" }
  | { type: "test_win_condition"; slotId: string; source: string; sampleContext: Record<string, unknown> }
  | { type: "lazer_mp_command"; room_id: number; command: string }
  | {
      type: "lazer_make_room";
      ruleset_id: number;
      beatmap_id: number;
      name: string;
      match_type?: MatchType;
      queue_mode?: QueueMode;
      max_participants?: number;
    }
  // TODO(client-migration): Remove this command once the backend backfills chat history itself.
  | { type: "lazer_load_chat"; room_id: number }
  | { type: "lazer_join_room"; room_id: number }
  // TODO(client-migration): Remove this dead command because the referee hub has no LeaveRoom method.
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
