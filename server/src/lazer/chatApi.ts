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
  log.debug("Fetching chat history", { channelId });
  const messages: ChatMessage[] = [];
  const messageIds = new Set<number>();
  let until: number | undefined;

  while (true) {
    const endpoint = `chat/channels/${channelId}/messages?limit=${CHAT_HISTORY_PAGE_SIZE}${until === undefined ? "" : `&until=${until}`}`;
    const page = (await fetchApi(await getAccessToken(), endpoint)) as ChatMessage[];
    if (!Array.isArray(page)) throw new Error("Chat API returned an invalid message history.");
    log.trace("History page received", { channelId, until, count: page.length });
    if (page.length === 0) break;

    const pageIds = page.map((message) => Number(message.message_id));
    const oldestId = Math.min(...pageIds);
    if (!Number.isSafeInteger(oldestId) || (until !== undefined && oldestId >= until)) {
      throw new Error("Chat API returned an invalid message history cursor.");
    }
    for (const message of page) {
      const messageId = Number(message.message_id);
      if (Number.isSafeInteger(messageId) && !messageIds.has(messageId)) {
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
