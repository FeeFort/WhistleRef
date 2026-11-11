import type { WebSocket } from "ws";
import { sendJson } from "../wsGateway.js";
import type { ClientMessage } from "../types/index.js";
import type { ChatService } from "./chatService.js";
import type { LobbyMatch } from "./lobbyState.js";

export interface StableLobbyAdapter {
  getLobbyState(channel: string): { bestOf: number | null };
  updateLobbyState(channel: string, patch: Partial<Record<keyof LobbyMatch, unknown>>): void;
}

export function validateLobbyCommand(type: string, message: Record<string, unknown>): string | null {
  if (!["chat_lobby_state_get", "lobby_match_set", "lobby_map_state_set", "lobby_map_state_clear", "lobby_active_pool_set", "lobby_qualification_mode_set", "lobby_state_import"].includes(type)) return null;
  if (type === "lobby_state_import") return Array.isArray(message.lobbies) ? null : "lobbies must be an array.";
  if (!Number.isSafeInteger(message.chatId) || (message.chatId as number) <= 0) return "chatId must be a positive integer.";
  if (type === "lobby_match_set" && (!message.patch || typeof message.patch !== "object" || Array.isArray(message.patch))) return "patch must be a plain object.";
  if (type === "lobby_map_state_set") {
    if (typeof message.slot !== "string" || message.slot.length === 0) return "slot must be a non-empty string.";
    if (!message.patch || typeof message.patch !== "object" || Array.isArray(message.patch)) return "patch must be a plain object.";
  }
  if (type === "lobby_active_pool_set" && message.poolId !== null && typeof message.poolId !== "string") return "poolId must be a string or null.";
  if (type === "lobby_qualification_mode_set" && typeof message.enabled !== "boolean") return "enabled must be a boolean.";
  return null;
}

export function validateMatchScores(bestOf: number | null, patch: LobbyMatch): void {
  const winningScore = Number.isInteger(bestOf) && (bestOf as number) > 0 ? Math.ceil((bestOf as number) / 2) : null;
  if (winningScore && ((patch.teamRedScore ?? 0) > winningScore || (patch.teamBlueScore ?? 0) > winningScore)) throw new Error(`Match scores cannot exceed ${winningScore}.`);
}

function replyError(client: WebSocket, message: ClientMessage, error: unknown): void {
  sendJson(client, { type: "error", request: message.type, requestId: message.requestId, message: (error as Error).message });
}

export function createLobbyHandlers(chatService: ChatService, stable: StableLobbyAdapter): Record<string, (client: WebSocket, message: ClientMessage) => void> {
  const run = (client: WebSocket, message: ClientMessage, operation: () => unknown, result?: (value: unknown) => Record<string, unknown>) => {
    try {
      const value = operation();
      sendJson(client, { type: "ack", received: message.type, requestId: message.requestId, ...(result ? result(value) : {}) });
    } catch (error) {
      replyError(client, message, error);
    }
  };
  return {
    chat_lobby_state_get: (client, message) => run(client, message, () => chatService.getLobbyState((message as Extract<ClientMessage, { type: "chat_lobby_state_get" }>).chatId), (value) => ({ type: "chat_lobby_state_response", chatId: (message as Extract<ClientMessage, { type: "chat_lobby_state_get" }>).chatId, lobbyState: value, requestId: message.requestId })),
    lobby_match_set: (client, message) => {
      const payload = message as Extract<ClientMessage, { type: "lobby_match_set" }>;
      run(client, message, () => {
        const chat = chatService.listChats().find((item) => item.id === payload.chatId);
        if (!chat) throw new Error(`Chat ${payload.chatId} not found`);
        if (chat.platform === "stable") {
          const channel = `#mp_${chat.externalId}`;
          validateMatchScores(stable.getLobbyState(channel).bestOf, payload.patch);
          stable.updateLobbyState(channel, payload.patch);
        } else {
          validateMatchScores(chatService.getLobbyState(payload.chatId).match.bestOf ?? null, payload.patch);
          chatService.setMatch(payload.chatId, payload.patch);
        }
      });
    },
    lobby_map_state_set: (client, message) => { const p = message as Extract<ClientMessage, { type: "lobby_map_state_set" }>; run(client, message, () => chatService.setMapSlot(p.chatId, p.slot, p.patch)); },
    lobby_map_state_clear: (client, message) => { const p = message as Extract<ClientMessage, { type: "lobby_map_state_clear" }>; run(client, message, () => chatService.clearMapStates(p.chatId)); },
    lobby_active_pool_set: (client, message) => { const p = message as Extract<ClientMessage, { type: "lobby_active_pool_set" }>; run(client, message, () => chatService.setActivePool(p.chatId, p.poolId)); },
    lobby_qualification_mode_set: (client, message) => { const p = message as Extract<ClientMessage, { type: "lobby_qualification_mode_set" }>; run(client, message, () => chatService.setQualificationMode(p.chatId, p.enabled)); },
    lobby_state_import: (client, message) => { const p = message as Extract<ClientMessage, { type: "lobby_state_import" }>; run(client, message, () => chatService.importMaps(p.lobbies), (value) => ({ result: value })); },
  };
}
