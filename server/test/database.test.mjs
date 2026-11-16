import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { closeDatabase, openDatabase } from "../src/db/database.ts";
import { archiveClosedChats, createChat, findChat, getChat, listChats, readLobbyState, setChatStatus, writeLobbyState } from "../src/db/chatsRepo.ts";
import { countMessages, getHighestExternalId, getMessagesPage, insertMessage, insertMessages } from "../src/db/messagesRepo.ts";

const temporaryDirectory = () => mkdtempSync(path.join(os.tmpdir(), "whistleref-db-test-"));

test("database migrations, settings, and version handling", async (t) => {
  const database = openDatabase(":memory:");
  t.after(() => {
    try {
      closeDatabase(database);
    } catch {
      // The database is closed explicitly below.
    }
  });
  assert.equal(database.prepare("PRAGMA user_version").get().user_version, 1);
  assert.deepEqual(
    database
      .prepare("PRAGMA table_info(chats)")
      .all()
      .map((column) => column.name),
    ["id", "platform", "external_id", "title", "status", "created_at", "closed_at", "archived_at", "lobby_state"],
  );
  closeDatabase(database);
  const directory = temporaryDirectory();
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const filename = path.join(directory, "settings.db");
  const firstOpen = openDatabase(filename);
  assert.equal(firstOpen.prepare("PRAGMA user_version").get().user_version, 1);
  closeDatabase(firstOpen);
  const reopened = openDatabase(filename);
  assert.equal(reopened.prepare("PRAGMA user_version").get().user_version, 1);
  closeDatabase(reopened);

  const fileDatabase = openDatabase(filename);
  assert.equal(fileDatabase.prepare("PRAGMA journal_mode").get().journal_mode, "wal");
  assert.equal(fileDatabase.prepare("PRAGMA synchronous").get().synchronous, 1);
  closeDatabase(fileDatabase);

  const futureDatabase = openDatabase(":memory:");
  futureDatabase.exec("PRAGMA user_version = 99");
  closeDatabase(futureDatabase);
  const futureFile = path.join(directory, "future.db");
  const seeded = openDatabase(futureFile);
  seeded.exec("PRAGMA user_version = 99");
  closeDatabase(seeded);
  assert.throws(() => openDatabase(futureFile), /schema version 99 is newer than supported version 1/);
});

test("chat and message repositories preserve constraints and ordering", (t) => {
  const database = openDatabase(":memory:");
  t.after(() => closeDatabase(database));
  const createdAt = "2026-11-01T00:00:00.000Z";
  const stable = createChat(database, { platform: "stable", external_id: 42, title: "Stable", created_at: createdAt });
  const lazer = createChat(database, { platform: "lazer", external_id: 42, title: "Lazer", created_at: createdAt });
  assert.equal(findChat(database, "stable", 42)?.id, stable.id);
  assert.equal(getChat(database, lazer.id)?.title, "Lazer");
  assert.throws(() => createChat(database, { platform: "stable", external_id: 42, title: "Duplicate", created_at: createdAt }), /UNIQUE constraint failed/);

  const message = (chatId, externalId, text) => ({ chat_id: chatId, external_id: externalId, author: "Ref", sender_id: null, text, created_at: createdAt, kind: "message" });
  assert.equal(insertMessages(database, [message(lazer.id, 5, "five"), message(lazer.id, 6, "six"), message(lazer.id, 5, "duplicate")]), 2);
  insertMessage(database, message(stable.id, null, "one"));
  insertMessage(database, message(stable.id, null, "two"));
  insertMessages(database, [message(stable.id, null, "three"), message(stable.id, null, "four")]);
  assert.equal(countMessages(database, stable.id), 4);
  assert.equal(getHighestExternalId(database, lazer.id), 6);
  const lazerPage = getMessagesPage(database, lazer.id, 1);
  assert.deepEqual(
    lazerPage.map((item) => item.text),
    ["six"],
  );
  assert.deepEqual(
    getMessagesPage(database, lazer.id, 1, lazerPage[0].id).map((item) => item.text),
    ["five"],
  );
  assert.deepEqual(
    getMessagesPage(database, stable.id, 4).map((item) => item.text),
    ["one", "two", "three", "four"],
  );

  database.prepare("DELETE FROM chats WHERE id = ?").run(lazer.id);
  assert.equal(countMessages(database, lazer.id), 0);
});

test("message inserts ignore duplicates while preserving constraints", (t) => {
  const database = openDatabase(":memory:");
  t.after(() => closeDatabase(database));
  const createdAt = "2026-11-01T00:00:00.000Z";
  const chat = createChat(database, { platform: "lazer", external_id: 1, title: "Lazer", created_at: createdAt });
  const message = (externalId, text = "message", kind = "message") => ({
    chat_id: chat.id,
    external_id: externalId,
    author: "Ref",
    sender_id: null,
    text,
    created_at: createdAt,
    kind,
  });

  assert.equal(insertMessage(database, message(1)), 1);
  assert.equal(insertMessage(database, message(1, "duplicate")), 0);
  assert.equal(countMessages(database, chat.id), 1);

  assert.equal(insertMessages(database, [message(1, "duplicate"), message(2, "new")]), 1);
  assert.equal(countMessages(database, chat.id), 2);

  assert.equal(insertMessage(database, message(null, "null one")), 1);
  assert.equal(insertMessage(database, message(null, "null two")), 1);
  assert.equal(insertMessages(database, [message(null, "null three"), message(null, "null four")]), 2);
  assert.equal(countMessages(database, chat.id), 6);

  assert.throws(() => insertMessage(database, message(3, "invalid kind", "invalid")), /CHECK constraint failed/);
  assert.equal(insertMessage(database, message(11, "event", "event")), 1);
  assert.throws(() => insertMessages(database, [message(4, "invalid kind", "invalid")]), /CHECK constraint failed/);
  assert.throws(() => insertMessage(database, message(5, null)), /NOT NULL constraint failed/);
  assert.throws(() => insertMessages(database, [message(6, null)]), /NOT NULL constraint failed/);

  const beforeBatch = countMessages(database, chat.id);
  assert.throws(() => insertMessages(database, [message(7, "valid"), message(8, null)]), /NOT NULL constraint failed/);
  assert.equal(countMessages(database, chat.id), beforeBatch);

  assert.throws(() => insertMessage(database, { ...message(9), chat_id: 999 }), /FOREIGN KEY constraint failed/);
  assert.throws(() => insertMessages(database, [{ ...message(10), chat_id: 999 }]), /FOREIGN KEY constraint failed/);
});

test("chat status timestamps, archive operation, and lobby state", (t) => {
  const database = openDatabase(":memory:");
  t.after(() => closeDatabase(database));
  const now = "2026-11-01T00:00:00.000Z";
  const closed = createChat(database, { platform: "stable", external_id: 1, title: "Closed", created_at: now });
  const active = createChat(database, { platform: "stable", external_id: 2, title: "Active", created_at: now });
  const archived = createChat(database, { platform: "stable", external_id: 3, title: "Archived", created_at: now, status: "archived" });
  setChatStatus(database, closed.id, "closed", now);
  assert.equal(getChat(database, closed.id).closed_at, now);
  setChatStatus(database, closed.id, "archived", now);
  assert.equal(getChat(database, closed.id).closed_at, now);
  assert.equal(getChat(database, closed.id).archived_at, now);
  setChatStatus(database, closed.id, "active", now);
  assert.equal(getChat(database, closed.id).closed_at, null);
  assert.equal(getChat(database, closed.id).archived_at, null);
  setChatStatus(database, closed.id, "closed", now);
  const later = "2026-11-02T00:00:00.000Z";
  assert.equal(archiveClosedChats(database, later), 1);
  assert.equal(getChat(database, closed.id).archived_at, later);
  assert.equal(getChat(database, active.id).status, "active");
  assert.equal(getChat(database, archived.id).status, "archived");
  assert.equal(getChat(database, archived.id).archived_at, null);
  assert.deepEqual(
    listChats(database, "active").map((chat) => chat.id),
    [active.id],
  );
  const state = { v: 1, bo: 3, picks: ["HD1"] };
  writeLobbyState(database, active.id, state);
  assert.deepEqual(readLobbyState(database, active.id), state);
  writeLobbyState(database, active.id, null);
  assert.equal(readLobbyState(database, active.id), null);
});
