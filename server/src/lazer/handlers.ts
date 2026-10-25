import { WebSocket } from "ws";
import { sendJson } from "../wsGateway.js";
import { invokeHub } from "./refereeHubClient.js";
import { roomManager } from "./roomManager.js";
import { sendChatMessage } from "./chatApi.js";
import type { ClientMessage, ListRoomsResponse, LazerChatStateEvent } from "../types.js";

async function ack(client: WebSocket, message: ClientMessage, result?: unknown): Promise<void> {
  sendJson(client, { type: "ack", received: message.type, ...(message.requestId !== undefined ? { requestId: message.requestId } : {}), ...(result !== undefined ? { result } : {}) });
}

async function fail(client: WebSocket, message: ClientMessage, error: unknown): Promise<void> {
  sendJson(client, {
    type: "error",
    request: message.type,
    ...(message.requestId !== undefined ? { requestId: message.requestId } : {}),
    message: error instanceof Error ? error.message : String(error),
    ...(typeof error === "object" && error !== null && "code" in error
      ? {
          code: error.code,
          ...("retryAfterMs" in error ? { retryAfterMs: error.retryAfterMs } : {}),
          outcomeUnknown: "outcomeUnknown" in error ? error.outcomeUnknown : false,
        }
      : {}),
  });
}

export async function handleLazerMakeRoom(client: WebSocket, message: ClientMessage): Promise<void> {
  const m = message as Extract<ClientMessage, { type: "lazer_make_room" }>;
  try {
    const room = await roomManager.joinRoom(null, {
      ruleset_id: m.ruleset_id,
      beatmap_id: m.beatmap_id,
      name: m.name,
      type: m.match_type,
      queue_mode: m.queue_mode,
      max_participants: m.max_participants,
    });
    await ack(client, message, room);
    await handleLazerLoadChat(client, { type: "lazer_load_chat", room_id: room.room_id, requestId: message.requestId }, false);
  } catch (error) {
    await fail(client, message, error);
  }
}

export async function handleLazerJoinRoom(client: WebSocket, message: ClientMessage): Promise<void> {
  const m = message as Extract<ClientMessage, { type: "lazer_join_room" }>;
  try {
    const room = await roomManager.joinRoom(m.room_id);
    await ack(client, message, room);
    await handleLazerLoadChat(client, { type: "lazer_load_chat", room_id: room.room_id, requestId: message.requestId }, false);
  } catch (error) {
    await fail(client, message, error);
  }
}

export async function handleLazerLoadChat(client: WebSocket, message: ClientMessage, acknowledge = true): Promise<void> {
  const m = message as Extract<ClientMessage, { type: "lazer_load_chat" }>;
  sendJson(client, { type: "lazer_chat_state", roomId: m.room_id, requestId: m.requestId, state: "loading" } satisfies LazerChatStateEvent);
  try {
    const history = await roomManager.loadChat(m.room_id);
    sendJson(client, { type: "lazer_chat_history", roomId: m.room_id, requestId: m.requestId, messages: history });
    sendJson(client, { type: "lazer_chat_state", roomId: m.room_id, requestId: m.requestId, state: "ready" } satisfies LazerChatStateEvent);
    if (acknowledge) await ack(client, message);
  } catch (error) {
    const failure = error instanceof Error ? error : new Error(String(error));
    const code = "code" in failure && typeof failure.code === "string" ? failure.code : undefined;
    // Old room/session notifications must not update the new session's chat state.
    if (code !== "SESSION_ENDED") {
      sendJson(client, {
        type: "lazer_chat_state",
        roomId: m.room_id,
        requestId: m.requestId,
        state: "failed",
        stage: "stage" in failure && failure.stage === "history" ? "history" : "channel",
        message: failure.message,
        ...(code ? { code } : {}),
      } satisfies LazerChatStateEvent);
    }
    if (acknowledge) await fail(client, message, failure);
  }
}

export async function handleLazerLeaveRoom(client: WebSocket, message: ClientMessage): Promise<void> {
  const m = message as Extract<ClientMessage, { type: "lazer_leave_room" }>;
  try {
    await invokeHub("LeaveRoom", m.room_id);
    roomManager.removeRoom(m.room_id, true);
    await ack(client, message);
  } catch (error) {
    await fail(client, message, error);
  }
}

export async function handleLazerCloseRoom(client: WebSocket, message: ClientMessage): Promise<void> {
  const m = message as Extract<ClientMessage, { type: "lazer_close_room" }>;
  try {
    await invokeHub("CloseRoom", m.room_id);
    // Hub doesn't send success message back, so removing the room ourselves
    roomManager.removeRoom(m.room_id, true);
    await ack(client, message);
  } catch (error) {
    await fail(client, message, error);
  }
}

export async function handleLazerInvitePlayer(client: WebSocket, message: ClientMessage): Promise<void> {
  const m = message as Extract<ClientMessage, { type: "lazer_invite_player" }>;
  try {
    await invokeHub("InvitePlayer", m.room_id, m.user_id);
    await ack(client, message);
  } catch (error) {
    await fail(client, message, error);
  }
}

export async function handleLazerKickPlayer(client: WebSocket, message: ClientMessage): Promise<void> {
  const m = message as Extract<ClientMessage, { type: "lazer_kick_player" }>;
  try {
    await invokeHub("KickPlayer", m.room_id, m.user_id);
    await ack(client, message);
  } catch (error) {
    await fail(client, message, error);
  }
}

export async function handleLazerBanUser(client: WebSocket, message: ClientMessage): Promise<void> {
  const m = message as Extract<ClientMessage, { type: "lazer_ban_user" }>;
  try {
    await invokeHub("BanUser", m.room_id, m.user_id);
    await ack(client, message);
  } catch (error) {
    await fail(client, message, error);
  }
}

export async function handleLazerAddReferee(client: WebSocket, message: ClientMessage): Promise<void> {
  const m = message as Extract<ClientMessage, { type: "lazer_add_referee" }>;
  try {
    await invokeHub("AddReferee", m.room_id, m.user_id);
    await ack(client, message);
  } catch (error) {
    await fail(client, message, error);
  }
}

export async function handleLazerRemoveReferee(client: WebSocket, message: ClientMessage): Promise<void> {
  const m = message as Extract<ClientMessage, { type: "lazer_remove_referee" }>;
  try {
    await invokeHub("RemoveReferee", m.room_id, m.user_id);
    await ack(client, message);
  } catch (error) {
    await fail(client, message, error);
  }
}

export async function handleLazerChangeRoomSettings(client: WebSocket, message: ClientMessage): Promise<void> {
  const m = message as Extract<ClientMessage, { type: "lazer_change_room_settings" }>;
  try {
    await invokeHub("ChangeRoomSettings", m.room_id, {
      name: m.name,
      password: m.password,
      type: m.match_type,
      queue_mode: m.queue_mode,
      max_participants: m.max_participants,
    });
    await ack(client, message);
  } catch (error) {
    await fail(client, message, error);
  }
}

export async function handleLazerEditCurrentPlaylistItem(client: WebSocket, message: ClientMessage): Promise<void> {
  const m = message as Extract<ClientMessage, { type: "lazer_edit_current_playlist_item" }>;
  try {
    await invokeHub("EditCurrentPlaylistItem", m.room_id, {
      ruleset_id: m.ruleset_id,
      beatmap_id: m.beatmap_id,
      required_mods: m.required_mods,
      allowed_mods: m.allowed_mods,
      freestyle: m.freestyle,
    });
    await ack(client, message);
  } catch (error) {
    await fail(client, message, error);
  }
}

export async function handleLazerAddPlaylistItem(client: WebSocket, message: ClientMessage): Promise<void> {
  const m = message as Extract<ClientMessage, { type: "lazer_add_playlist_item" }>;
  try {
    await invokeHub("AddPlaylistItem", m.room_id, {
      ruleset_id: m.ruleset_id,
      beatmap_id: m.beatmap_id,
      required_mods: m.required_mods,
      allowed_mods: m.allowed_mods,
      freestyle: m.freestyle,
    });
    await ack(client, message);
  } catch (error) {
    await fail(client, message, error);
  }
}

export async function handleLazerEditPlaylistItem(client: WebSocket, message: ClientMessage): Promise<void> {
  const m = message as Extract<ClientMessage, { type: "lazer_edit_playlist_item" }>;
  try {
    await invokeHub("EditPlaylistItem", m.room_id, {
      playlist_item_id: m.playlist_item_id,
      ruleset_id: m.ruleset_id,
      beatmap_id: m.beatmap_id,
      required_mods: m.required_mods,
      allowed_mods: m.allowed_mods,
      freestyle: m.freestyle,
    });
    await ack(client, message);
  } catch (error) {
    await fail(client, message, error);
  }
}

export async function handleLazerRemovePlaylistItem(client: WebSocket, message: ClientMessage): Promise<void> {
  const m = message as Extract<ClientMessage, { type: "lazer_remove_playlist_item" }>;
  try {
    await invokeHub("RemovePlaylistItem", m.room_id, { playlist_item_id: m.playlist_item_id });
    await ack(client, message);
  } catch (error) {
    await fail(client, message, error);
  }
}

export async function handleLazerRoll(client: WebSocket, message: ClientMessage): Promise<void> {
  const m = message as Extract<ClientMessage, { type: "lazer_roll" }>;
  try {
    await invokeHub("Roll", m.room_id, { max: m.max });
    await ack(client, message);
  } catch (error) {
    await fail(client, message, error);
  }
}

export async function handleLazerMoveUser(client: WebSocket, message: ClientMessage): Promise<void> {
  const m = message as Extract<ClientMessage, { type: "lazer_move_user" }>;
  try {
    await invokeHub("MoveUser", m.room_id, { user_id: m.user_id, slot: m.slot, team: m.team });
    await ack(client, message);
  } catch (error) {
    await fail(client, message, error);
  }
}

export async function handleLazerSetLockState(client: WebSocket, message: ClientMessage): Promise<void> {
  const m = message as Extract<ClientMessage, { type: "lazer_set_lock_state" }>;
  try {
    await invokeHub("SetLockState", m.room_id, { locked: m.locked });
    await ack(client, message);
  } catch (error) {
    await fail(client, message, error);
  }
}

export async function handleLazerStartMatch(client: WebSocket, message: ClientMessage): Promise<void> {
  const m = message as Extract<ClientMessage, { type: "lazer_start_match" }>;
  try {
    await invokeHub("StartMatch", m.room_id, { countdown: m.countdown });
    await ack(client, message);
  } catch (error) {
    await fail(client, message, error);
  }
}

export async function handleLazerStopMatchCountdown(client: WebSocket, message: ClientMessage): Promise<void> {
  const m = message as Extract<ClientMessage, { type: "lazer_stop_match_countdown" }>;
  try {
    await invokeHub("StopMatchCountdown", m.room_id);
    await ack(client, message);
  } catch (error) {
    await fail(client, message, error);
  }
}

export async function handleLazerAbortMatch(client: WebSocket, message: ClientMessage): Promise<void> {
  const m = message as Extract<ClientMessage, { type: "lazer_abort_match" }>;
  try {
    await invokeHub("AbortMatch", m.room_id);
    await ack(client, message);
  } catch (error) {
    await fail(client, message, error);
  }
}

export async function handleLazerListRooms(client: WebSocket, message: ClientMessage): Promise<void> {
  try {
    await roomManager.resync();
    const rooms = roomManager.getAllRooms();
    await ack(client, message, { room_ids: rooms.map((r) => r.room_id) } satisfies ListRoomsResponse);
  } catch (error) {
    await fail(client, message, error);
  }
}

export async function handleLazerSendChatMessage(client: WebSocket, message: ClientMessage): Promise<void> {
  const m = message as Extract<ClientMessage, { type: "lazer_send_chat_message" }>;
  try {
    const room = roomManager.getRoom(m.room_id);
    if (!room) throw new Error(`Room ${m.room_id} is not tracked.`);
    await sendChatMessage(room.chat_channel_id, m.message, m.is_action === true);
    await ack(client, message);
  } catch (error) {
    await fail(client, message, error);
  }
}
