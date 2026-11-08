import assert from "node:assert/strict";
import { test } from "node:test";
import { openDatabase, closeDatabase } from "../src/db/database.ts";
import { createChat, getChat } from "../src/db/chatsRepo.ts";
import { ChatLifecycle } from "../src/chats/chatLifecycle.ts";

const createdAt = "2026-11-01T00:00:00.000Z";

function setup(t) {
  const database = openDatabase(":memory:");
  t.after(() => closeDatabase(database));
  let tick = 0;
  const lifecycle = new ChatLifecycle(database, () => `2026-11-08T00:00:0${tick++}.000Z`);
  return { database, lifecycle };
}

function chat(database, externalId, status = "active") {
  return createChat(database, { platform: "stable", external_id: externalId, title: `Chat ${externalId}`, created_at: createdAt, status });
}

test("allowed chat lifecycle transitions set and clear timestamps", (t) => {
  const { database, lifecycle } = setup(t);
  const active = chat(database, 1);
  const close = lifecycle.markRoomClosed(active.id);
  assert.equal(close.changed, true);
  assert.equal(close.chat.status, "closed");
  assert.ok(close.chat.closed_at);
  const archive = lifecycle.archiveChat(active.id);
  assert.equal(archive.changed, true);
  assert.equal(archive.chat.status, "archived");
  assert.equal(archive.chat.closed_at, close.chat.closed_at);
  assert.ok(archive.chat.archived_at);
  const rejoin = lifecycle.rejoinChat(active.id);
  assert.equal(rejoin.changed, true);
  assert.equal(rejoin.chat.status, "active");
  assert.equal(rejoin.chat.closed_at, null);
  assert.equal(rejoin.chat.archived_at, null);

  const userArchived = chat(database, 2);
  const archived = lifecycle.archiveChat(userArchived.id);
  assert.equal(archived.changed, true);
  assert.ok(archived.chat.archived_at);
  const failedReconnect = lifecycle.markReconnectFailed(userArchived.id);
  assert.equal(failedReconnect.changed, false);
  assert.equal(failedReconnect.chat.status, "archived");
});

test("disallowed transitions are no-ops and archived chats cannot be downgraded", (t) => {
  const { database, lifecycle } = setup(t);
  const active = chat(database, 1);
  const archived = lifecycle.archiveChat(active.id).chat;
  const closed = lifecycle.markRoomClosed(chat(database, 2).id).chat;
  const stillActive = chat(database, 3);
  const timestampState = (item) => [item.status, item.closed_at, item.archived_at];
  const cases = [
    [stillActive.id, "active", () => lifecycle.openOrCreateChat({ platform: "stable", externalId: 3, title: "Chat 3" })],
    [closed.id, "closed", () => lifecycle.markRoomClosed(closed.id)],
    [closed.id, "closed", () => lifecycle.rejoinChat(closed.id)],
    [archived.id, "archived", () => lifecycle.archiveChat(archived.id)],
    [archived.id, "archived", () => lifecycle.markRoomClosed(archived.id)],
    [archived.id, "archived", () => lifecycle.markReconnectFailed(archived.id)],
  ];
  for (const [id, , invoke] of cases) {
    const before = timestampState(getChat(database, id));
    assert.doesNotThrow(() => {
      const result = invoke();
      assert.equal(result.changed, false);
    });
    assert.deepEqual(timestampState(getChat(database, id)), before);
  }
});

test("openOrCreateChat reuses rows and only reactivates archived chats", (t) => {
  const { database, lifecycle } = setup(t);
  const input = { platform: "lazer", externalId: 20, title: "Room" };
  const created = lifecycle.openOrCreateChat(input);
  assert.equal(created.changed, true);
  assert.equal(created.chat.status, "active");
  const same = lifecycle.openOrCreateChat({ ...input, title: "Later title" });
  assert.equal(same.chat.id, created.chat.id);
  assert.equal(same.changed, false);
  lifecycle.archiveChat(created.chat.id);
  assert.equal(lifecycle.openOrCreateChat(input).chat.status, "active");
  lifecycle.markRoomClosed(created.chat.id);
  assert.equal(lifecycle.openOrCreateChat(input).chat.status, "closed");
  assert.equal(database.prepare("SELECT COUNT(*) AS count FROM chats WHERE platform = 'lazer' AND external_id = 20").get().count, 1);
});

test("startup recovery and graceful shutdown archive closed chats", (t) => {
  const { database, lifecycle } = setup(t);
  const first = chat(database, 1);
  const active = chat(database, 2);
  const second = chat(database, 3);
  lifecycle.markRoomClosed(first.id);
  lifecycle.markRoomClosed(second.id);
  const recovered = lifecycle.startupRecovery();
  assert.equal(recovered.archivedCount, 2);
  assert.deepEqual(
    recovered.activeChats.map((item) => item.id),
    [active.id],
  );
  assert.equal(lifecycle.startupRecovery().archivedCount, 0);

  const closed = chat(database, 4);
  lifecycle.markRoomClosed(closed.id);
  assert.equal(lifecycle.gracefulShutdown(), 1);
  assert.equal(lifecycle.gracefulShutdown(), 0);
});
