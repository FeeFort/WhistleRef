import assert from "node:assert/strict";
import { test } from "node:test";
import { openDatabase, closeDatabase } from "../src/db/database.ts";
import { createChat } from "../src/db/chatsRepo.ts";
import { ChatLifecycle } from "../src/chats/chatLifecycle.ts";
import { MessageRecorder } from "../src/chats/messageRecorder.ts";

test("message recorder returns persisted rows, ignores duplicate external ids and records events", (t) => {
  const database = openDatabase(":memory:");
  t.after(() => closeDatabase(database));
  const chat = createChat(database, { platform: "lazer", external_id: 7, title: "Room", created_at: "2026-11-01T00:00:00.000Z" });
  const recorder = new MessageRecorder(database, () => "2026-11-08T00:00:00.000Z");
  const input = { externalId: 10, author: "Player", senderId: 42, text: "hello", kind: "message" };
  const first = recorder.recordMessage(chat.id, input);
  assert.equal(first.inserted, true);
  assert.ok(first.message.id > 0);
  const duplicate = recorder.recordMessage(chat.id, { ...input, text: "different" });
  assert.equal(duplicate.inserted, false);
  assert.deepEqual(duplicate.message, first.message);

  const event = recorder.recordEvent(chat.id, "Room joined");
  assert.equal(event.inserted, true);
  assert.equal(event.message.kind, "event");
  assert.equal(event.message.author, null);
  assert.equal(event.message.external_id, null);
});

test("recording works for archived chats and batch ids preserve insertion order", (t) => {
  const database = openDatabase(":memory:");
  t.after(() => closeDatabase(database));
  const chat = createChat(database, { platform: "stable", external_id: 8, title: "Room", created_at: "2026-11-01T00:00:00.000Z" });
  new ChatLifecycle(database, () => "2026-11-08T00:00:00.000Z").archiveChat(chat.id);
  const recorder = new MessageRecorder(database, () => "2026-11-08T00:00:00.000Z");
  assert.equal(
    recorder.recordMessages(chat.id, [
      { author: "A", text: "one", kind: "message" },
      { author: "B", text: "two", kind: "action" },
    ]),
    2,
  );
  const rows = database.prepare("SELECT id, text FROM messages WHERE chat_id = ? ORDER BY id").all(chat.id);
  assert.deepEqual(
    rows.map((row) => row.text),
    ["one", "two"],
  );
  assert.ok(rows[0].id < rows[1].id);
});
