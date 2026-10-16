import { ref, shallowRef } from "vue";

function getDefaultWebSocketUrl() {
  if (import.meta.env.DEV) {
    const protocol = window.location.protocol === "https:" ? "wss" : "ws";
    return `${protocol}://${window.location.host}/ws`;
  }

  const hostname = window.location.hostname === "0.0.0.0" ? "127.0.0.1" : window.location.hostname || "127.0.0.1";
  const protocol = window.location.protocol === "https:" ? "wss" : "ws";
  return `${protocol}://${hostname}:3000/ws`;
}
const socket = shallowRef(null);
const state = ref("disconnected");
const lastError = ref("");
const lastEvent = ref(null);
const loginTimeout = 10000;
let pendingLogin = null;

function send(socketInstance, payload) {
  if (socketInstance.readyState !== WebSocket.OPEN) return false;
  socketInstance.send(JSON.stringify(payload));
  return true;
}

// Used by local command adapters which need to correlate a particular
// websocket acknowledgement with the request that caused it.
function sendLazerCommand(type, payload = {}, requestId) {
  return socket.value ? send(socket.value, { type, ...payload, ...(requestId ? { requestId } : {}) }) : false;
}

function sendMessage(channel, message) {
  return socket.value ? send(socket.value, { type: "send_message", channel, message }) : false;
}

function sendChannelCommand(type, channel) {
  return socket.value ? send(socket.value, { type, channel }) : false;
}

function testWinCondition(slotId, source, sampleContext) {
  return socket.value ? send(socket.value, { type: "test_win_condition", slotId, source, sampleContext }) : false;
}

function makeLazerRoom(payload) {
  return socket.value ? send(socket.value, { type: "lazer_make_room", ...payload }) : false;
}

function inviteLazerPlayer(room_id, user_id) {
  return socket.value ? send(socket.value, { type: "lazer_invite_player", room_id, user_id }) : false;
}

function sendLazerChatMessage(room_id, message, is_action = false) {
  return socket.value ? send(socket.value, { type: "lazer_send_chat_message", room_id, message, is_action }) : false;
}

function rollLazer(room_id, max = 100) {
  return socket.value ? send(socket.value, { type: "lazer_roll", room_id, max }) : false;
}

function joinLazerRoom(room_id) {
  return socket.value ? send(socket.value, { type: "lazer_join_room", room_id }) : false;
}

function leaveLazerRoom(room_id) {
  return socket.value ? send(socket.value, { type: "lazer_leave_room", room_id }) : false;
}

function closeLazerRoom(room_id) {
  return socket.value ? send(socket.value, { type: "lazer_close_room", room_id }) : false;
}

function startLazerMatch(room_id, countdown) {
  return socket.value ? send(socket.value, { type: "lazer_start_match", room_id, countdown }) : false;
}

function abortLazerMatch(room_id) {
  return socket.value ? send(socket.value, { type: "lazer_abort_match", room_id }) : false;
}

function setLazerLockState(room_id, locked) {
  return socket.value ? send(socket.value, { type: "lazer_set_lock_state", room_id, locked }) : false;
}

function changeLazerRoomSettings(room_id, settings) {
  return socket.value ? send(socket.value, { type: "lazer_change_room_settings", room_id, ...settings }) : false;
}

function moveLazerUser(room_id, user_id, { slot = null, team = null } = {}) {
  return socket.value ? send(socket.value, { type: "lazer_move_user", room_id, user_id, slot, team }) : false;
}

function kickLazerPlayer(room_id, user_id) {
  return socket.value ? send(socket.value, { type: "lazer_kick_player", room_id, user_id }) : false;
}

function addLazerReferee(room_id, user_id) {
  return socket.value ? send(socket.value, { type: "lazer_add_referee", room_id, user_id }) : false;
}

function removeLazerReferee(room_id, user_id) {
  return socket.value ? send(socket.value, { type: "lazer_remove_referee", room_id, user_id }) : false;
}

function stopLazerMatchCountdown(room_id) {
  return socket.value ? send(socket.value, { type: "lazer_stop_match_countdown", room_id }) : false;
}

function addLazerPlaylistItem(room_id, payload) {
  return socket.value ? send(socket.value, { type: "lazer_add_playlist_item", room_id, ...payload }) : false;
}

function editLazerCurrentPlaylistItem(room_id, payload) {
  return socket.value ? send(socket.value, { type: "lazer_edit_current_playlist_item", room_id, ...payload }) : false;
}

function editLazerPlaylistItem(room_id, playlist_item_id, payload) {
  return socket.value ? send(socket.value, { type: "lazer_edit_playlist_item", room_id, playlist_item_id, ...payload }) : false;
}

function removeLazerPlaylistItem(room_id, playlist_item_id) {
  return socket.value ? send(socket.value, { type: "lazer_remove_playlist_item", room_id, playlist_item_id }) : false;
}

function loadLazerChat(room_id) {
  return socket.value ? send(socket.value, { type: "lazer_load_chat", room_id }) : false;
}

function getRequestSocket() {
  const existingSocket = socket.value;
  if (existingSocket && [WebSocket.OPEN, WebSocket.CONNECTING].includes(existingSocket.readyState)) {
    return { socketInstance: existingSocket, ownsSocket: false };
  }

  return {
    socketInstance: new WebSocket(import.meta.env.VITE_WS_URL || getDefaultWebSocketUrl()),
    ownsSocket: true,
  };
}

function requestOsu(payload) {
  const { socketInstance, ownsSocket } = getRequestSocket();

  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (callback, value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeoutId);
      socketInstance.removeEventListener("open", handleOpen);
      socketInstance.removeEventListener("message", handleMessage);
      socketInstance.removeEventListener("error", handleError);
      socketInstance.removeEventListener("close", handleClose);
      if (ownsSocket && socketInstance.readyState < WebSocket.CLOSING) socketInstance.close();
      callback(value);
    };
    const handleOpen = () => send(socketInstance, payload);
    const handleMessage = (event) => {
      let message;
      try {
        message = JSON.parse(event.data);
      } catch {
        return;
      }
      if (message.type === "osu_user" && payload.type === "osu_login") finish(resolve, message.user);
      if (message.type === "ack" && message.received === "osu_logout" && payload.type === "osu_logout") finish(resolve, message);
      if (message.type === "error" && message.request === payload.type) finish(reject, new Error(message.message || "Server error."));
    };
    const handleError = () => finish(reject, new Error("Unable to connect to the WhistleRef server."));
    const handleClose = () => finish(reject, new Error("Server connection closed."));
    const timeoutId = setTimeout(() => finish(reject, new Error("osu! request timed out.")), loginTimeout);

    socketInstance.addEventListener("open", handleOpen);
    socketInstance.addEventListener("message", handleMessage);
    socketInstance.addEventListener("error", handleError);
    socketInstance.addEventListener("close", handleClose);
    if (socketInstance.readyState === WebSocket.OPEN) handleOpen();
  });
}

function requestApi(endpoint, method = "GET", body = undefined) {
  const { socketInstance, ownsSocket } = getRequestSocket();

  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (callback, value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeoutId);
      socketInstance.removeEventListener("open", handleOpen);
      socketInstance.removeEventListener("message", handleMessage);
      socketInstance.removeEventListener("error", handleError);
      socketInstance.removeEventListener("close", handleClose);
      if (ownsSocket && socketInstance.readyState < WebSocket.CLOSING) socketInstance.close();
      callback(value);
    };
    const handleOpen = () => send(socketInstance, { type: "api_request", endpoint, method, body });
    const handleMessage = (event) => {
      let message;
      try {
        message = JSON.parse(event.data);
      } catch {
        return;
      }
      if (message.type === "api_response" && message.endpoint === endpoint) finish(resolve, message.response);
      if (message.type === "error" && message.request === "api_request") finish(reject, new Error(message.message || "Server error."));
    };
    const handleError = () => finish(reject, new Error("Unable to connect to the WhistleRef server."));
    const handleClose = () => finish(reject, new Error("Server connection closed."));
    const timeoutId = setTimeout(() => finish(reject, new Error("osu! API request timed out.")), loginTimeout);

    socketInstance.addEventListener("open", handleOpen);
    socketInstance.addEventListener("message", handleMessage);
    socketInstance.addEventListener("error", handleError);
    socketInstance.addEventListener("close", handleClose);
    if (socketInstance.readyState === WebSocket.OPEN) handleOpen();
  });
}

function setLobbyScore(channel, teamRedScore, teamBlueScore) {
  return socket.value
    ? send(socket.value, {
        type: "set_lobby_score",
        channel,
        teamRedScore,
        teamBlueScore,
      })
    : false;
}

function setLobbySettings(channel, bestOf, nextPickTeam) {
  return socket.value
    ? send(socket.value, {
        type: "set_lobby_settings",
        channel,
        bestOf,
        nextPickTeam,
      })
    : false;
}

function refreshLobbyTitle(channel) {
  return socket.value ? send(socket.value, { type: "refresh_lobby_title", channel }) : false;
}

function setActiveWinCondition(channel, beatmapId, source) {
  return socket.value ? send(socket.value, { type: "set_active_win_condition", channel, beatmapId, source }) : false;
}

function sendUpdateCommand(type) {
  return socket.value ? send(socket.value, { type }) : false;
}

function requestUpdateCheck() {
  const { socketInstance, ownsSocket } = getRequestSocket();
  if (ownsSocket) socket.value = socketInstance;
  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (callback, value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeoutId);
      socketInstance.removeEventListener("open", handleOpen);
      socketInstance.removeEventListener("message", handleMessage);
      socketInstance.removeEventListener("error", handleError);
      socketInstance.removeEventListener("close", handleClose);
      if (ownsSocket && socketInstance.readyState < WebSocket.CLOSING) socketInstance.close();
      callback(value);
    };
    const handleOpen = () => send(socketInstance, { type: "check_update" });
    const handleMessage = (event) => {
      let message;
      try {
        message = JSON.parse(event.data);
      } catch {
        return;
      }
      if (message.type === "update_progress" || message.type === "update_error") lastEvent.value = message;
      if (message.type === "update_check_result") {
        if (ownsSocket) {
          settled = true;
          clearTimeout(timeoutId);
          socketInstance.removeEventListener("open", handleOpen);
          socketInstance.removeEventListener("error", handleError);
          resolve(message);
        } else {
          finish(resolve, message);
        }
      }
      if (message.type === "update_error") finish(reject, new Error(message.message || "Unable to check for updates."));
    };
    const handleError = () => finish(reject, new Error("Unable to connect to the update service."));
    const handleClose = () => finish(reject, new Error("Update service connection closed."));
    const timeoutId = setTimeout(() => finish(reject, new Error("Update check timed out.")), loginTimeout);

    socketInstance.addEventListener("open", handleOpen);
    socketInstance.addEventListener("message", handleMessage);
    socketInstance.addEventListener("error", handleError);
    socketInstance.addEventListener("close", handleClose);
    if (socketInstance.readyState === WebSocket.OPEN) handleOpen();
  });
}

function closeSocket(sendLogout = false) {
  if (pendingLogin) {
    clearTimeout(pendingLogin.timeoutId);
    pendingLogin.reject(new Error("Login request was cancelled."));
    pendingLogin = null;
  }
  if (socket.value) {
    if (sendLogout) {
      send(socket.value, { type: "logout" });
    }
    socket.value.close();
    socket.value = null;
  }
  state.value = "disconnected";
}

function resolveLogin() {
  if (!pendingLogin) return;
  clearTimeout(pendingLogin.timeoutId);
  pendingLogin.resolve();
  pendingLogin = null;
}

function rejectLogin(error) {
  if (!pendingLogin) return;
  clearTimeout(pendingLogin.timeoutId);
  pendingLogin.reject(error);
  pendingLogin = null;
}

export function useServerConnection() {
  function login(loginName, password) {
    closeSocket(true);
    lastError.value = "";
    state.value = "connecting";

    const promise = new Promise((resolve, reject) => {
      pendingLogin = {
        resolve,
        reject,
        timeoutId: setTimeout(() => {
          const error = new Error("IRC login timed out.");
          state.value = "error";
          lastError.value = error.message;
          rejectLogin(error);
          closeSocket();
        }, loginTimeout),
      };
    });

    let socketInstance;
    try {
      socketInstance = new WebSocket(import.meta.env.VITE_WS_URL || getDefaultWebSocketUrl());
    } catch (error) {
      state.value = "error";
      lastError.value = error.message;
      rejectLogin(error);
      return promise;
    }
    socket.value = socketInstance;

    socketInstance.addEventListener("open", () => {
      send(socketInstance, {
        type: "login",
        login: loginName,
        password,
      });
    });

    socketInstance.addEventListener("message", (event) => {
      let message;
      try {
        message = JSON.parse(event.data);
      } catch {
        return;
      }

      lastEvent.value = message;
      if (message.type === "status") {
        state.value = message.state;
        if (message.state === "ready") {
          resolveLogin();
        }
        if (message.state === "error") {
          const error = new Error(message.detail || "IRC login failed.");
          lastError.value = error.message;
          rejectLogin(error);
        }
      }
      if (message.type === "error") {
        lastError.value = message.message || "Server error.";
        rejectLogin(new Error(lastError.value));
      }
    });

    socketInstance.addEventListener("error", () => {
      lastError.value = "Unable to connect to the WhistleRef server.";
      state.value = "error";
      rejectLogin(new Error(lastError.value));
    });

    socketInstance.addEventListener("close", () => {
      if (socket.value === socketInstance) {
        socket.value = null;
        state.value = "disconnected";
        rejectLogin(new Error(lastError.value || "Server connection closed."));
      }
    });

    return promise;
  }

  function logout() {
    closeSocket(true);
  }

  function loginOsu(credentials) {
    return requestOsu({ type: "osu_login", ...credentials });
  }

  function logoutOsu() {
    return requestOsu({ type: "osu_logout" });
  }

  function joinChannel(channel) {
    return sendChannelCommand("join_channel", channel);
  }

  function partChannel(channel) {
    return sendChannelCommand("part_channel", channel);
  }

  return {
    state,
    lastError,
    lastEvent,
    login,
    logout,
    loginOsu,
    logoutOsu,
    requestApi,
    sendMessage,
    joinChannel,
    partChannel,
    setLobbyScore,
    setLobbySettings,
    refreshLobbyTitle,
    setActiveWinCondition,
    testWinCondition,
    makeLazerRoom,
    joinLazerRoom,
    leaveLazerRoom,
    closeLazerRoom,
    startLazerMatch,
    abortLazerMatch,
    setLazerLockState,
    changeLazerRoomSettings,
    moveLazerUser,
    kickLazerPlayer,
    addLazerReferee,
    removeLazerReferee,
    stopLazerMatchCountdown,
    addLazerPlaylistItem,
    editLazerCurrentPlaylistItem,
    editLazerPlaylistItem,
    removeLazerPlaylistItem,
    loadLazerChat,
    lazerInvitePlayer: inviteLazerPlayer,
    sendLazerChatMessage,
    rollLazer,
    sendLazerCommand,
    checkUpdate: requestUpdateCheck,
    startUpdate: () => sendUpdateCommand("start_update"),
    cancelUpdate: () => sendUpdateCommand("cancel_update"),
    confirmInstall: () => sendUpdateCommand("confirm_install"),
  };
}
