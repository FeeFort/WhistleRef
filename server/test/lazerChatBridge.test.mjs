import assert from "node:assert/strict";
import { test } from "node:test";
import { openDatabase } from "../src/db/database.ts";
import { ChatService } from "../src/chats/chatService.ts";
import { LazerChatBridge } from "../src/chats/lazerChatBridge.ts";

const room = (room_id, name = "Room") => ({
  room_id,
  chat_channel_id: room_id + 1000,
  name,
  password: "",
  max_participants: 8,
  queue_mode: "all_players",
  state: { type: "head_to_head", locked: false, slots: null },
  playlist: [],
  players: [],
  referees: [],
});
const logger = { debug() {}, warn() {} };

function setup(options = {}) {
  const db = openDatabase(":memory:");
  const messages = [];
  const service = new ChatService(db, { onMessage: (message) => messages.push(message) }, () => "2026-11-09T00:00:00.000Z");
  const removed = [];
  const bridge = new LazerChatBridge({
    chatService: service,
    roomManager: { waitForChatChannel: async () => {}, removeRoom: (...args) => removed.push(args) },
    fetchHistory: async () => [],
    resolveName: async (id) => `user ${id}`,
    rememberName() {},
    logger,
    clock: () => "2026-11-09T00:00:00.000Z",
    ...options,
  });
  service.registerPlatformAdapter("lazer", { detach: (chat) => bridge.detach(chat) });
  return { db, service, bridge, messages, removed };
}

test("lazer join creates chat, explicit rejoin activates archived chat, and implicit join leaves it archived", async () => {
  const { service, bridge } = setup();
  bridge.onRoomJoined(room(1, "Tournament"));
  let chat = service.listChats()[0];
  assert.equal(chat.title, "Tournament");
  assert.equal(chat.status, "active");
  service.archiveChat(chat.id);
  bridge.onRoomJoined(room(1), { explicit: false });
  assert.equal(service.listChats()[0].status, "archived");
  bridge.onRoomJoined(room(1), { explicit: true });
  assert.equal(service.listChats()[0].status, "active");
  service.shutdown();
});

test("backfill is ascending and live messages wait until history completes", async () => {
  let release;
  const history = new Promise((resolve) => {
    release = resolve;
  });
  const { db, service, bridge, messages } = setup({ fetchHistory: () => history });
  bridge.onRoomJoined(room(2));
  await new Promise((resolve) => setImmediate(resolve));
  bridge.onLiveMessage(2, { message_id: 3, sender_id: 1, username: "new", content: "live", timestamp: "2026-11-09T00:00:03Z" });
  release([
    { message_id: 1, sender_id: 1, username: "old", content: "one", timestamp: "2026-11-09T00:00:01Z" },
    { message_id: 2, sender_id: 1, username: "old", content: "two", timestamp: "2026-11-09T00:00:02Z" },
  ]);
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(
    db
      .prepare("SELECT external_id FROM messages ORDER BY id")
      .all()
      .map((item) => item.external_id),
    [1, 2, 3],
  );
  assert.deepEqual(
    messages.map((item) => item.text),
    ["one", "two", "live"],
  );
  service.shutdown();
});

test("live message normalization and archive/removal/reconcile behavior", async () => {
  const { service, bridge, messages, removed } = setup();
  bridge.onRoomJoined(room(3));
  const chat = service.listChats()[0];
  bridge.onLiveMessage(3, { message_id: 10, sender_id: 4, sender: { username: "nested" }, content: "waves", is_action: true });
  bridge.onLiveMessage(3, { message_id: 11, sender_id: 4, content: "  " });
  bridge.onRoomRemoved(3, "closed");
  bridge.onRoomRemoved(3, "closed");
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(service.listChats()[0].status, "closed");
  assert.deepEqual(
    messages.map((item) => item.text),
    ["Room closed", "waves"],
  );
  assert.equal(messages[1].author, "nested");
  assert.equal(messages[1].kind, "action");
  service.archiveChat(chat.id);
  assert.deepEqual(removed[0], [3, { exclude: true, reason: "archived" }]);
  bridge.onLiveMessage(3, { message_id: 12, sender_id: 4, content: "ignored" });
  bridge.onRoomRemoved(3, "archived");
  assert.equal(messages.length, 2);
  service.shutdown();
});

test("reconcile closes only missing active chats and roll records exact text", async () => {
  const { service, bridge, messages } = setup({ resolveName: async () => "Ada" });
  bridge.onRoomJoined(room(4));
  bridge.onRoomJoined(room(5));
  await bridge.onRoll({ room_id: 4, user_id: 8, max: 100, result: 42 });
  bridge.reconcile([4]);
  bridge.reconcile([4]);
  assert.deepEqual(
    messages.map((item) => item.text),
    ["Ada rolled 42 points out of 100.", "Room closed"],
  );
  assert.deepEqual(
    service.listChats().map((chat) => chat.status),
    ["active", "closed"],
  );
  service.shutdown();
});

test("failed backfill does not escape bridge join", async () => {
  const { service, bridge } = setup({
    fetchHistory: async () => {
      throw new Error("offline");
    },
  });
  assert.doesNotThrow(() => bridge.onRoomJoined(room(6)));
  await new Promise((resolve) => setImmediate(resolve));
  service.shutdown();
});
