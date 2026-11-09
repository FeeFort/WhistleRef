import assert from "node:assert/strict";
import { test } from "node:test";
import { openDatabase } from "../src/db/database.ts";
import { createChat, deleteArchivedOlderThan, deleteChats, getChat } from "../src/db/chatsRepo.ts";
import { getAllSettings, getSetting, setSetting, deleteSetting } from "../src/db/settingsRepo.ts";
import { ChatService } from "../src/chats/chatService.ts";
import { toChatWire, toMessageWire } from "../src/chats/chatMapper.ts";

const stamp = "2026-11-01T00:00:00.000Z";
const makeChat = (db, externalId, status = "active") => createChat(db, { platform: "stable", external_id: externalId, title: `Chat ${externalId}`, created_at: stamp, status });

test("settings repository round trips JSON values", () => {
  const db = openDatabase(":memory:");
  setSetting(db, "x", { days: null });
  assert.deepEqual(getSetting(db, "x"), { days: null });
  assert.deepEqual(getAllSettings(db), { x: { days: null } });
  assert.equal(deleteSetting(db, "x"), true);
  assert.equal(deleteSetting(db, "x"), false);
  db.close();
});

test("chat deletion removes only archived rows and cascades messages", () => {
  const db = openDatabase(":memory:");
  const archived = makeChat(db, 10, "archived");
  const active = makeChat(db, 11, "active");
  const closed = makeChat(db, 12, "closed");
  db.prepare("INSERT INTO messages (chat_id, text, created_at, kind) VALUES (?, 'line', ?, 'message')").run(archived.id, stamp);
  assert.deepEqual(deleteChats(db, [archived.id, active.id, closed.id]), [archived.id]);
  assert.equal(db.prepare("SELECT COUNT(*) AS count FROM messages WHERE chat_id = ?").get(archived.id).count, 0);
  const older = makeChat(db, 13, "archived");
  const newer = makeChat(db, 14, "archived");
  db.prepare("UPDATE chats SET archived_at = ? WHERE id = ?").run("2026-11-01T00:00:00.000Z", older.id);
  db.prepare("UPDATE chats SET archived_at = ? WHERE id = ?").run("2026-11-07T00:00:00.000Z", newer.id);
  assert.deepEqual(deleteArchivedOlderThan(db, "2026-11-05T00:00:00.000Z"), [older.id]);
  assert.ok(getChat(db, newer.id));
  db.close();
});

test("chat service emits only changed rows and deduplicates messages", () => {
  const db = openDatabase(":memory:");
  const events = [];
  const service = new ChatService(db, { onChatUpdated: (x) => events.push(["chat", x]), onMessage: (x) => events.push(["message", x]) }, () => "2026-11-08T00:00:00.000Z");
  const chat = service.openOrCreateChat({ platform: "lazer", externalId: 1, title: "Room" }).chat;
  service.openOrCreateChat({ platform: "lazer", externalId: 1, title: "Room" });
  service.updateTitle(chat.id, "Room 2");
  service.updateTitle(chat.id, "Room 2");
  const input = { externalId: 9, author: "A", text: "hi", kind: "message" };
  service.recordMessage(chat.id, input);
  service.recordMessage(chat.id, input);
  assert.deepEqual(
    events.map(([kind]) => kind),
    ["chat", "chat", "message"],
  );
  assert.equal(events[0][1].messageCount, 0);
  assert.equal(events[1][1].messageCount, 0);
  assert.deepEqual(
    service.getChatHistory(chat.id).map((m) => m.id),
    [1],
  );
  service.shutdown();
});

test("chats_list returns grouped message counts with status filtering and id ordering", () => {
  const db = openDatabase(":memory:");
  const service = new ChatService(db);
  const first = makeChat(db, 10, "archived");
  const second = makeChat(db, 11, "active");
  const third = makeChat(db, 12, "archived");
  for (const kind of ["message", "system", "roll", "service", "event"]) {
    db.prepare("INSERT INTO messages (chat_id, text, created_at, kind) VALUES (?, ?, ?, ?)").run(second.id, kind, stamp, kind);
  }
  db.prepare("INSERT INTO messages (chat_id, text, created_at, kind) VALUES (?, 'line', ?, 'action')").run(third.id, stamp);
  assert.deepEqual(
    service.listChats(["archived"]).map(({ id, messageCount }) => [id, messageCount]),
    [
      [first.id, 0],
      [third.id, 1],
    ],
  );
  assert.deepEqual(service.listChats(["active"]).map(({ id, messageCount }) => [id, messageCount]), [[second.id, 5]]);
  assert.deepEqual(service.listChats().map(({ id }) => id), [first.id, second.id, third.id]);
  service.shutdown();
});

test("chat_updated reports the message count at each lifecycle event", () => {
  const db = openDatabase(":memory:");
  const updates = [];
  const service = new ChatService(db, { onChatUpdated: (chat) => updates.push(chat) });
  const chat = service.openOrCreateChat({ platform: "stable", externalId: 30, title: "Room" }).chat;
  service.recordMessage(chat.id, { author: "A", text: "one", kind: "message" });
  service.archiveChat(chat.id);
  assert.deepEqual(updates.map(({ messageCount }) => messageCount), [0, 1]);
  service.shutdown();
});

test("archive persists archived status before adapter detach", () => {
  const db = openDatabase(":memory:");
  const service = new ChatService(db, {}, () => "2026-11-08T00:00:00.000Z");
  const chat = makeChat(db, 4);
  service.registerPlatformAdapter("stable", { detach: (wire) => assert.equal(getChat(db, wire.id).status, "archived") });
  service.archiveChat(chat.id);
  service.shutdown();
});

test("settings validation and startup recovery and auto-delete", () => {
  const db = openDatabase(":memory:");
  const now = "2026-11-08T00:00:00.000Z";
  const events = [];
  const service = new ChatService(db, { onChatUpdated: (x) => events.push(x), onChatDeleted: (x) => events.push(x) }, () => now);
  assert.doesNotThrow(() => service.setSetting("archive.autoDeleteDays", null));
  assert.doesNotThrow(() => service.setSetting("archive.autoDeleteDays", 3));
  for (const value of [0, -1, 1.2, "3", undefined]) assert.throws(() => service.setSetting("archive.autoDeleteDays", value));
  assert.throws(() => service.setSetting("other", 1), /Unknown setting/);
  const active = makeChat(db, 1);
  const old = makeChat(db, 2, "archived");
  db.prepare("UPDATE chats SET archived_at = ? WHERE id = ?").run("2026-11-01T00:00:00.000Z", old.id);
  const closed = makeChat(db, 3, "closed");
  const activeChats = service.startup();
  assert.deepEqual(
    activeChats.map((x) => x.id),
    [active.id],
  );
  assert.equal(getChat(db, old.id), undefined);
  assert.equal(getChat(db, closed.id).status, "archived");
  assert.equal(service.startup().length, 1);
  service.shutdown();
});

test("startup leaves archived rows alone when auto-delete is disabled and shutdown closes once", () => {
  const db = openDatabase(":memory:");
  const archived = makeChat(db, 20, "archived");
  const service = new ChatService(db, {}, () => "2026-11-08T00:00:00.000Z");
  assert.deepEqual(service.startup(), []);
  assert.ok(getChat(db, archived.id));
  assert.deepEqual(service.deleteChats([archived.id, 999]), { deleted: [archived.id], skipped: [999] });
  service.shutdown();
  assert.doesNotThrow(() => service.shutdown());
  assert.throws(() => db.prepare("SELECT 1").get());
});

test("wire mappers expose exact camelCase fields", () => {
  assert.deepEqual(toChatWire({ id: 1, platform: "stable", external_id: 2, title: "T", status: "active", created_at: stamp, closed_at: null, archived_at: null, lobby_state: null }, 7), {
    id: 1,
    platform: "stable",
    externalId: 2,
    title: "T",
    status: "active",
    createdAt: stamp,
    closedAt: null,
    archivedAt: null,
    messageCount: 7,
  });
  assert.deepEqual(toMessageWire({ id: 3, chat_id: 1, external_id: null, author: null, sender_id: null, text: "T", created_at: stamp, kind: "system" }), {
    id: 3,
    chatId: 1,
    kind: "system",
    author: null,
    senderId: null,
    text: "T",
    createdAt: stamp,
  });
});
