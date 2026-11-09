import assert from "node:assert/strict";
import { test } from "node:test";
import { fetchChatMessagesSince } from "../src/lazer/chatApi.ts";

test("fetchChatMessagesSince stops at cursor and returns ascending new messages", async (t) => {
  const pages = [Array.from({ length: 50 }, (_, i) => ({ message_id: 151 - i })), Array.from({ length: 50 }, (_, i) => ({ message_id: 101 - i }))];
  const fetch = t.mock.method(globalThis, "fetch", async () => new Response(JSON.stringify(pages.shift()), { status: 200 }));
  const messages = await fetchChatMessagesSince(12, 75, async () => "token");
  assert.equal(fetch.mock.callCount(), 2);
  assert.deepEqual(
    messages.map((message) => message.message_id),
    Array.from({ length: 76 }, (_, i) => i + 76),
  );
});

test("fetchChatMessagesSince loads full history from zero and rejects invalid cursor", async (t) => {
  t.mock.method(globalThis, "fetch", async () => new Response(JSON.stringify([{ message_id: 2 }, { message_id: 1 }]), { status: 200 }));
  assert.deepEqual(
    (await fetchChatMessagesSince(12, 0, async () => "token")).map((message) => message.message_id),
    [1, 2],
  );
  await assert.rejects(
    fetchChatMessagesSince(12, -1, async () => "token"),
    /invalid message history cursor/,
  );
});
