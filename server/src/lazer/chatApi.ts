import { logger } from "../logger/logger.js";
import { getAccessToken } from "../auth/auth.js";
import { fetchApi } from "../osu-api/osuApiClient.js";
import type { ChatMessage } from "../types/index.js";

const log = logger.child("lazer", "chatApi");

const CHAT_HISTORY_PAGE_SIZE = 50;
export async function sendChatMessage(channelId: number, message: string, isAction = false): Promise<unknown> {
  log.debug("Sending chat message", { channelId, isAction });
  return fetchApi(await getAccessToken(), `chat/channels/${channelId}/messages`, "POST", { message, is_action: isAction });
}

export async function fetchChatMessages(channelId: number): Promise<ChatMessage[]> {
  return fetchChatMessagesSince(channelId, 0);
}

export async function fetchChatMessagesSince(channelId: number, sinceMessageId: number, accessToken: () => Promise<string> = getAccessToken): Promise<ChatMessage[]> {
  if (!Number.isSafeInteger(sinceMessageId) || sinceMessageId < 0) throw new Error("Chat API returned an invalid message history cursor.");
  log.debug("Fetching chat history", { channelId });
  const messages: ChatMessage[] = [];
  const messageIds = new Set<number>();
  let until: number | undefined;

  while (true) {
    const endpoint = `chat/channels/${channelId}/messages?limit=${CHAT_HISTORY_PAGE_SIZE}${until === undefined ? "" : `&until=${until}`}`;
    const page = (await fetchApi(await accessToken(), endpoint)) as ChatMessage[];
    if (!Array.isArray(page)) throw new Error("Chat API returned an invalid message history.");
    log.trace("History page received", { channelId, until, count: page.length });
    if (page.length === 0) break;

    const pageIds = page.map((message) => Number(message.message_id));
    const oldestId = Math.min(...pageIds);
    if (!Number.isSafeInteger(oldestId) || (until !== undefined && oldestId >= until)) {
      throw new Error("Chat API returned an invalid message history cursor.");
    }
    if (pageIds.some((id) => !Number.isSafeInteger(id))) throw new Error("Chat API returned an invalid message history cursor.");
    if (sinceMessageId > 0 && oldestId <= sinceMessageId) {
      for (const message of page) {
        const id = Number(message.message_id);
        if (id > sinceMessageId && !messageIds.has(id)) {
          messageIds.add(id);
          messages.push(message);
        }
      }
      break;
    }
    for (const message of page) {
      const messageId = Number(message.message_id);
      if (Number.isSafeInteger(messageId) && (sinceMessageId === 0 || messageId > sinceMessageId) && !messageIds.has(messageId)) {
        messageIds.add(messageId);
        messages.push(message);
      }
    }
    if (page.length < CHAT_HISTORY_PAGE_SIZE) break;
    until = oldestId;
  }

  log.debug("Chat history loaded", { channelId, count: messages.length });
  return messages.sort((left, right) => Number(left.message_id) - Number(right.message_id));
}
