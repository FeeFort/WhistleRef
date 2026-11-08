import assert from "node:assert/strict";
import { test } from "node:test";
import { openDatabase } from "../src/db/database.ts";
import { ChatService } from "../src/chats/chatService.ts";
import {
  StableChatBridge,
  STABLE_CHAT_RESTORE_TIMEOUT_MS,
  STABLE_CHAT_SERVICE_TEXT,
  STABLE_CHAT_SYSTEM_TEXT,
  formatMultiplayerChannel,
  parseMultiplayerChannel,
} from "../src/chats/stableChatBridge.ts";

const stamp = "2026-11-08T00:00:00.000Z";

function setup() {
  const db = openDatabase(":memory:");
  const messages = [];
  const irc = { joins: [], leaves: [], ready: true, nick: "Referee", joinChannel(channel) { this.joins.push(channel); }, leaveChannel(channel) { this.leaves.push(channel); }, isReady() { return this.ready; }, ownNick() { return this.nick; } };
  const timers = [];
  const service = new ChatService(db, { onMessage: (message) => messages.push(message) }, () => stamp);
  const bridge = new StableChatBridge({ chatService: service, irc, clock: () => stamp, logger: { debug() {}, warn() {} }, setTimeout: (callback, delay) => { const timer = { callback, delay, cleared: false }; timers.push(timer); return timer; }, clearTimeout: (timer) => { timer.cleared = true; } });
  service.registerPlatformAdapter("stable", { detach: (chat) => bridge.detach(chat) });
  return { db, service, bridge, irc, timers, messages };
}

function history(service, chatId) {
  return service.getChatHistory(chatId);
}

test("multiplayer channel helpers normalize stable channel forms", () => {
  assert.equal(parseMultiplayerChannel("#MP-123"), 123);
  assert.equal(parseMultiplayerChannel("mp_123"), 123);
  assert.equal(parseMultiplayerChannel("#general"), null);
  assert.equal(formatMultiplayerChannel(123), "#mp_123");
});

test("own join creates, rejoins archived chats, and marks gaps once", () => {
  const { service, bridge, messages } = setup();
  bridge.onOwnJoin("#mp_10", "Room");
  const chat = service.listChats()[0];
  assert.equal(chat.status, "active");
  assert.equal(messages.length, 0);
  bridge.onOwnJoin("#MP_10", "Other");
  assert.equal(messages.length, 0);
  service.archiveChat(chat.id);
  bridge.onOwnJoin("#mp_10");
  assert.equal(messages.at(-1).text, STABLE_CHAT_SERVICE_TEXT.rejoined);
  bridge.onOwnJoin("#mp_10");
  assert.equal(messages.filter((message) => message.text === STABLE_CHAT_SERVICE_TEXT.rejoined).length, 1);
});

test("part closes active chats and archived echo is ignored", () => {
  const { service, bridge, irc, messages } = setup();
  bridge.onOwnJoin("#mp_11");
  const chat = service.listChats()[0];
  bridge.onOwnPart("#mp_11");
  assert.equal(service.listChats()[0].status, "closed");
  assert.equal(messages.at(-1).text, STABLE_CHAT_SYSTEM_TEXT.roomClosed);
  bridge.onOwnPart("#mp_11");
  assert.equal(messages.filter((message) => message.text === STABLE_CHAT_SYSTEM_TEXT.roomClosed).length, 1);
  service.archiveChat(chat.id);
  assert.equal(irc.leaves.length, 1);
  bridge.onOwnPart("#mp_11");
  assert.equal(messages.filter((message) => message.text === STABLE_CHAT_SYSTEM_TEXT.roomClosed).length, 1);
});

test("messages are recorded for active and closed chats, but not archived or unknown chats", () => {
  const { service, bridge, irc, messages } = setup();
  bridge.onOwnJoin("#mp_12");
  const chat = service.listChats()[0];
  bridge.onChannelMessage("#mp_12", "Alice", "hello", stamp);
  bridge.onOwnPart("#mp_12");
  bridge.onChannelMessage("#mp_12", "Alice", "after close", stamp);
  irc.nick = "Referee";
  bridge.onOutgoingMessage("#mp_12", "outgoing");
  service.archiveChat(chat.id);
  bridge.onChannelMessage("#mp_12", "Alice", "frozen", stamp);
  bridge.onChannelMessage("#mp_999", "Alice", "unknown", stamp);
  assert.deepEqual(history(service, chat.id).filter((message) => message.kind === "message").map((message) => [message.author, message.text]), [["Alice", "hello"], ["Alice", "after close"], ["Referee", "outgoing"]]);
  assert.equal(messages.filter((message) => message.kind === "message").length, 3);
});

test("connection restoration joins active chats and timeout closes them", () => {
  const { service, bridge, irc, timers, messages } = setup();
  bridge.onOwnJoin("#mp_13");
  bridge.onConnectionState("ready");
  assert.deepEqual(irc.joins, [formatMultiplayerChannel(13)]);
  assert.equal(timers[0].delay, STABLE_CHAT_RESTORE_TIMEOUT_MS);
  timers[0].callback();
  assert.equal(service.listChats()[0].status, "closed");
  assert.equal(messages.at(-1).text, STABLE_CHAT_SYSTEM_TEXT.roomClosed);
});

test("title changes only when non-empty and different", () => {
  const { service, bridge } = setup();
  bridge.onOwnJoin("#mp_14", "Initial");
  bridge.onTitle("#mp_14", "");
  assert.equal(service.listChats()[0].title, "Initial");
  bridge.onTitle("#mp_14", "Updated");
  assert.equal(service.listChats()[0].title, "Updated");
  bridge.onTitle("#mp_14", "Updated");
});
