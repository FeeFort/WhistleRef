import { config } from "../src/config.ts";
import assert from "node:assert/strict";
import { test } from "node:test";
import { HubConnectionBuilder, HubConnectionState } from "@microsoft/signalr";
import { connectToRefereeHub, disconnectFromRefereeHub, invokeHub, isHubPayload } from "../src/lazer/refereeHubClient.ts";
import { roomManager } from "../src/lazer/roomManager.ts";

// These tests exercise room synchronization; limiter behavior has separate tests.
config.hubRateLimit.tokensPerSecond = 100_000;
config.hubRateLimit.capacity = 1000;
config.hubRetry.baseDelay = 1;
config.hubRetry.maxDelay = 1;

const snapshot = (roomId, name = "Fresh") => ({
  room_id: roomId,
  chat_channel_id: roomId + 100,
  name,
  password: "",
  queue_mode: "HostOnly",
  max_participants: 4,
  state: { type: "head_to_head", locked: false, slots: null },
  playlist: [],
  players: [],
  referees: [],
});

await test("room synchronization", async (t) => {
  let invoke;
  let reconnect;
  let reconnecting;
  let closed;
  const statuses = [];
  const deferred = [];
  const listeners = new Map();
  const forwarded = [];
  const hub = {
    state: HubConnectionState.Connected,
    on(name, callback) {
      listeners.set(name, callback);
    },
    onreconnecting(callback) {
      reconnecting = callback;
    },
    onclose(callback) {
      closed = callback;
    },
    onreconnected(callback) {
      reconnect = callback;
    },
    async start() {},
    async stop() {},
    invoke(...args) {
      return invoke(...args);
    },
  };
  t.mock.method(HubConnectionBuilder.prototype, "build", () => hub);
  await connectToRefereeHub(
    (event) => forwarded.push(event),
    () => roomManager.resync(),
    (event) => statuses.push(event),
  );
  const updates = [];
  const removed = [];
  roomManager.setListeners(
    (room) => updates.push(structuredClone(room)),
    (id) => removed.push(id),
    (event) => statuses.push(event),
    (event) => deferred.push(event),
  );

  await t.test("connection state reports initial connection, reconnect and closure", () => {
    assert.deepEqual(
      statuses.map((event) => event.state),
      ["connecting", "connected"],
    );
    reconnecting(new Error("Network lost"));
    assert.deepEqual(statuses.at(-1), { type: "lazer_connection_state", state: "reconnecting", reason: "Network lost" });
    closed(new Error("Retries exhausted"));
    assert.equal(statuses.at(-1).state, "disconnected");
    assert.equal(statuses.at(-1).reason, "Retries exhausted");
  });

  await t.test("reconnect refreshes existing rooms, adds new rooms and removes missing rooms", async () => {
    roomManager.trackRoom(snapshot(1, "Stale"));
    roomManager.trackRoom(snapshot(2));
    updates.length = 0;
    const calls = [];
    invoke = async (method, roomId) => {
      calls.push([method, roomId]);
      return method === "ListRooms" ? { room_ids: [1, 3] } : snapshot(roomId);
    };
    await reconnect();
    assert.deepEqual(calls, [
      ["ListRooms", undefined],
      ["JoinRoom", 1],
      ["JoinRoom", 3],
    ]);
    assert.equal(roomManager.getRoom(1).name, "Fresh");
    assert.equal(statuses.at(-1).state, "synced");
    assert.deepEqual(
      statuses.slice(-3).map((event) => event.state),
      ["connected", "syncing", "synced"],
    );
    assert.equal(roomManager.getRoom(2), undefined);
    assert.deepEqual(removed, [2]);
    assert.deepEqual(
      updates.map((room) => room.room_id),
      [1, 3],
    );
  });

  await t.test("concurrent synchronizations share one operation and buffered events survive snapshots", async () => {
    const item = { id: 7, ruleset_id: 0, beatmap_id: 8, required_mods: [], allowed_mods: [], freestyle: false, was_played: false, order: 0 };
    let resolveJoin;
    invoke = async (method) =>
      method === "ListRooms"
        ? { room_ids: [1] }
        : new Promise((resolve) => {
            resolveJoin = resolve;
          });
    const first = roomManager.resync();
    assert.equal(roomManager.resync(), first);
    await new Promise((resolve) => setImmediate(resolve));
    roomManager.handleHubEvent("PlaylistItemAdded", { room_id: 1, playlist_item: item });
    roomManager.handleHubEvent("UserStatusChanged", { room_id: 1, user_id: 42, status: "ready" });
    roomManager.handleHubEvent("RoomSettingsChanged", { room_id: 1, name: "Live", password: "", type: "head_to_head", queue_mode: "AllPlayers", max_participants: 6 });
    const fresh = snapshot(1);
    fresh.playlist = [item];
    await new Promise((resolve) => setImmediate(resolve));
    resolveJoin(fresh);
    await first;
    assert.equal(roomManager.getRoom(1).playlist.length, 1);
    assert.equal(roomManager.getRoom(1).players[0].status, "ready");
    assert.equal(roomManager.getRoom(1).name, "Live");
    assert.equal(roomManager.getRoom(1).queue_mode, "AllPlayers");
  });

  await t.test("a room failure is reported without preventing other room updates; retry works", async () => {
    invoke = async (method, roomId) => {
      if (method === "ListRooms") return { room_ids: [1, 4] };
      if (roomId === 1) throw new Error("Join failed");
      return snapshot(roomId);
    };
    await assert.rejects(roomManager.resync(), AggregateError);
    assert.equal(statuses.at(-1).state, "failed");
    assert.equal(statuses.at(-1).scope, "partial");
    assert.deepEqual(statuses.at(-1).failedRoomIds, [1]);
    assert.equal(roomManager.getRoom(1).name, "Live");
    assert.equal(roomManager.getRoom(4).name, "Fresh");
    invoke = async (method, roomId) => (method === "ListRooms" ? { room_ids: [1, 4] } : snapshot(roomId, "Retried"));
    await roomManager.resync();
    assert.equal(roomManager.getRoom(1).name, "Retried");
  });

  await t.test("leaving during refresh prevents a late snapshot from restoring the room", async () => {
    let resolveJoin;
    invoke = async (method) =>
      method === "ListRooms"
        ? { room_ids: [1, 4] }
        : new Promise((resolve) => {
            resolveJoin = resolve;
          });
    const syncing = roomManager.resync();
    await new Promise((resolve) => setImmediate(resolve));
    roomManager.removeRoom(1);
    await new Promise((resolve) => setImmediate(resolve));
    resolveJoin(snapshot(1));
    await new Promise((resolve) => setImmediate(resolve));
    await new Promise((resolve) => setImmediate(resolve));
    resolveJoin(snapshot(4));
    await assert.rejects(syncing, AggregateError);
    assert.equal(roomManager.getRoom(1), undefined);
    assert.equal(roomManager.getRoom(4).name, "Fresh");
  });

  await t.test("user joins share one request, preserve ordered updates and release failures", async () => {
    let resolveJoin;
    let calls = 0;
    invoke = () => {
      calls++;
      return new Promise((resolve) => {
        resolveJoin = resolve;
      });
    };
    const first = roomManager.joinRoom(10);
    const second = roomManager.joinRoom(10);
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(calls, 1);
    roomManager.handleHubEvent("UserJoined", { room_id: 10, user_id: 42 });
    roomManager.handleHubEvent("UserLeft", { room_id: 10, user_id: 42 });
    roomManager.handleHubEvent("UserJoined", { room_id: 10, user_id: 43 });
    roomManager.handleHubEvent("UserTeamChanged", { room_id: 10, user_id: 43, team: "red" });
    roomManager.handleHubEvent("RefereeRemoved", { room_id: 10, user_id: 44 });
    const fresh = snapshot(10);
    fresh.referees = [{ user_id: 44 }];
    await new Promise((resolve) => setImmediate(resolve));
    resolveJoin(fresh);
    assert.equal(await first, await second);
    assert.deepEqual(
      fresh.players.map((p) => p.user_id),
      [43],
    );
    assert.equal(fresh.players[0].team, "red");
    assert.deepEqual(fresh.referees, []);
    invoke = async () => {
      throw new Error("Denied");
    };
    await assert.rejects(roomManager.joinRoom(11), /Denied/);
    invoke = async () => snapshot(11);
    await roomManager.joinRoom(11);
    roomManager.removeRoom(10);
    roomManager.removeRoom(11);
  });

  await t.test("creation captures early events only for the returned room", async () => {
    let resolveMake;
    invoke = () =>
      new Promise((resolve) => {
        resolveMake = resolve;
      });
    const creating = roomManager.joinRoom(null, { name: "New", ruleset_id: 0, beatmap_id: 1 });
    roomManager.handleHubEvent("UserStatusChanged", { room_id: 12, user_id: 42, status: "ready" });
    roomManager.handleHubEvent("UserJoined", { room_id: 99, user_id: 99 });
    assert.equal(roomManager.handleHubEvent("RollCompleted", { room_id: 12, user_id: 42, max: 100, result: 10 }), false);
    await new Promise((resolve) => setImmediate(resolve));
    resolveMake(snapshot(12));
    const room = await creating;
    assert.equal(room.players[0].status, "ready");
    assert.deepEqual(room.referees, []);
    assert.equal(roomManager.getRoom(99), undefined);
    assert.ok(deferred.some((event) => event.eventType === "RollCompleted" && event.roomId === 12));
    assert.equal(
      deferred.some((event) => event.roomId === 99),
      false,
    );
    roomManager.removeRoom(12);
  });

  await t.test("unknown rooms are rejected while pending joins and tracked rooms are accepted", async () => {
    const warnings = t.mock.method(process.stderr, "write", () => true);
    assert.equal(roomManager.handleHubEvent("RollCompleted", { room_id: 99, user_id: 1, max: 100, result: 2 }), false);
    assert.equal(roomManager.handleHubEvent("UserJoined", { room_id: 99, user_id: 1 }), false);
    assert.equal(roomManager.getRoom(99), undefined);
    let resolveJoin;
    invoke = () =>
      new Promise((resolve) => {
        resolveJoin = resolve;
      });
    const joining = roomManager.joinRoom(13);
    assert.equal(roomManager.handleHubEvent("UserJoined", { room_id: 13, user_id: 42 }), true);
    await new Promise((resolve) => setImmediate(resolve));
    resolveJoin(snapshot(13));
    await joining;
    assert.equal(roomManager.getRoom(13).players[0].user_id, 42);
    assert.equal(roomManager.handleHubEvent("MatchCompleted", { room_id: 13, playlist_item_id: 1 }), true);
    roomManager.removeRoom(13);
    warnings.mock.restore();
  });

  await t.test("automatic join failure is reported as a room error", async () => {
    const log = t.mock.method(process.stderr, "write", () => true);
    invoke = async () => {
      throw new Error("No access");
    };
    roomManager.handleHubEvent("RefereeInvited", { room_id: 77 });
    await new Promise((resolve) => setImmediate(resolve));
    assert.deepEqual(statuses.at(-1), { type: "lazer_room_error", roomId: 77, operation: "join", message: "No access" });
    log.mock.restore();
  });

  await t.test("invitations join unknown rooms once; referee updates only modify tracked state", async () => {
    let resolveJoin;
    let calls = 0;
    invoke = () => {
      calls++;
      return new Promise((resolve) => {
        resolveJoin = resolve;
      });
    };
    assert.equal(roomManager.handleHubEvent("RefereeInvited", { room_id: 78 }), true);
    assert.equal(roomManager.handleHubEvent("RefereeAdded", { room_id: 78, user_id: 44 }), true);
    assert.equal(roomManager.handleHubEvent("RefereeInvited", { room_id: 78 }), true);
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(calls, 1);
    await new Promise((resolve) => setImmediate(resolve));
    resolveJoin(snapshot(78));
    await new Promise((resolve) => setImmediate(resolve));
    assert.deepEqual(roomManager.getRoom(78).referees, [{ user_id: 44 }]);
    roomManager.handleHubEvent("RefereeAdded", { room_id: 78, user_id: 45 });
    roomManager.handleHubEvent("RefereeInvited", { room_id: 78 });
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(calls, 1);
    assert.equal(roomManager.getRoom(78).referees.length, 2);
    assert.equal(roomManager.handleHubEvent("RefereeRemoved", { room_id: 78, user_id: 44 }), true);
    assert.deepEqual(roomManager.getRoom(78).referees, [{ user_id: 45 }]);
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(calls, 1);
    roomManager.removeRoom(78);
  });

  await t.test("referee notifications for another room are not swallowed by MakeRoom", async () => {
    let resolveMake;
    let resolveJoin;
    invoke = (method) =>
      new Promise((resolve) => {
        if (method === "MakeRoom") resolveMake = resolve;
        else resolveJoin = resolve;
      });
    const creating = roomManager.joinRoom(null, { name: "New", ruleset_id: 0, beatmap_id: 1 });
    assert.equal(roomManager.handleHubEvent("RefereeInvited", { room_id: 80 }), true);
    await new Promise((resolve) => setImmediate(resolve));
    resolveJoin(snapshot(80));
    await new Promise((resolve) => setImmediate(resolve));
    resolveMake(snapshot(81));
    await creating;
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(roomManager.getRoom(80).room_id, 80);
    assert.equal(roomManager.getRoom(81).room_id, 81);
    roomManager.removeRoom(80);
    roomManager.removeRoom(81);
  });

  await t.test("Added and Removed for unknown rooms never invoke JoinRoom", () => {
    let calls = 0;
    invoke = () => {
      calls++;
      throw new Error("Unexpected JoinRoom");
    };
    const warnings = t.mock.method(process.stderr, "write", () => true);
    assert.equal(roomManager.handleHubEvent("RefereeAdded", { room_id: 90, user_id: 1 }), false);
    assert.equal(roomManager.handleHubEvent("RefereeRemoved", { room_id: 90, user_id: 1 }), false);
    assert.equal(calls, 0);
    assert.equal(roomManager.getRoom(90), undefined);
    warnings.mock.restore();
  });

  await t.test("SignalR boundary drops invalid events before forwarding", () => {
    const warnings = t.mock.method(process.stderr, "write", () => true);
    listeners.get("UserJoined")(null);
    listeners.get("UserJoined")({ room_id: 1, user_id: "bad" });
    assert.equal(forwarded.length, 0);
    listeners.get("UserJoined")({ room_id: 1, user_id: 2, extra: true });
    assert.deepEqual(forwarded[0], { type: "lazer_event", eventType: "UserJoined", roomId: 1, payload: { room_id: 1, user_id: 2, extra: true } });
    warnings.mock.restore();
  });

  await t.test("invalid event structures are rejected, including nested values", () => {
    for (const value of [null, [], {}, { room_id: "1", user_id: 2 }, { room_id: 1, user_id: NaN }]) {
      assert.equal(isHubPayload("UserJoined", value), false);
    }
    assert.equal(isHubPayload("UserJoined", { room_id: 1, user_id: 2 }), true);
    assert.equal(isHubPayload("UserStatusChanged", { room_id: 1, user_id: 2, status: "unknown" }), false);
    assert.equal(isHubPayload("UserModsChanged", { room_id: 1, user_id: 2, mods: [{ acronym: "HD", settings: [] }] }), false);
    assert.equal(isHubPayload("UserModsChanged", { room_id: 1, user_id: 2, mods: [{ acronym: "HD" }] }), true);
    assert.equal(isHubPayload("MatchStateChanged", { room_id: 1, state: { type: "head_to_head", locked: false, slots: [null, "2"] } }), false);
    assert.equal(isHubPayload("PlaylistItemAdded", { room_id: 1, playlist_item: { id: 2 } }), false);
    assert.equal(isHubPayload("RollCompleted", { room_id: 1, user_id: 2, max: 100, result: 101 }), false);
  });

  await t.test("ListRooms failure preserves tracked rooms and reaches reconnect error handling", async () => {
    const errors = [];
    const log = t.mock.method(process.stderr, "write", (message) => {
      errors.push(message);
      return true;
    });
    invoke = async () => {
      throw new Error("List failed");
    };
    await assert.rejects(roomManager.resync(), /List failed/);
    assert.equal(statuses.at(-1).scope, "all");
    assert.equal(statuses.at(-1).message, "List failed");
    await reconnect();
    assert.equal(roomManager.getAllRooms().length, 1);
    assert.ok(errors.some((message) => message.includes("Sync after reconnect failed") && message.includes("List failed")));
    log.mock.restore();
  });
  await t.test("SignalR timeout releases a join and ignores its late snapshot", async () => {
    const previousTimeout = config.hubRequestTimeoutMs;
    config.hubRequestTimeoutMs = 10;
    let resolveLate;
    invoke = () =>
      new Promise((resolve) => {
        resolveLate = resolve;
      });
    try {
      await assert.rejects(roomManager.joinRoom(89), (error) => error.code === "REQUEST_TIMEOUT" && error.outcomeUnknown === false);
      resolveLate(snapshot(89));
      await new Promise((resolve) => setImmediate(resolve));
      assert.equal(roomManager.getRoom(89), undefined);
      invoke = async () => snapshot(89);
      await roomManager.joinRoom(89);
      roomManager.removeRoom(89);
      invoke = () => new Promise(() => {});
      await assert.rejects(invokeHub("MakeRoom", {}), (error) => error.code === "REQUEST_TIMEOUT" && error.outcomeUnknown === true);
    } finally {
      config.hubRequestTimeoutMs = previousTimeout;
    }
  });

  await t.test("closed rooms from a stale ListRooms response are never rejoined", async () => {
    roomManager.trackRoom(snapshot(91));
    roomManager.removeRoom(91, true);
    const calls = [];
    invoke = async (method, roomId) => {
      calls.push([method, roomId]);
      return method === "ListRooms" ? { room_ids: [91, 92] } : snapshot(roomId);
    };
    await roomManager.resync();
    assert.equal(
      calls.some(([method, roomId]) => method === "JoinRoom" && roomId === 91),
      false,
    );
    assert.equal(roomManager.getRoom(91), undefined);
    assert.ok(roomManager.getRoom(92));
    roomManager.removeRoom(92);
  });

  await t.test("SignalR diagnostics redact passwords in request logs", async (t) => {
    const logs = [];
    const previousLevel = logger.level;
    logger.setLevel("TRACE");
    t.after(() => logger.setLevel(previousLevel));
    t.mock.method(process.stderr, "write", (message) => {
      logs.push(message);
      return true;
    });
    invoke = async () => undefined;
    await invokeHub("ChangeRoomSettings", 1, { name: "Room", password: "do-not-log-this" });
    assert.ok(logs.some((message) => message.includes("ChangeRoomSettings")));
    assert.ok(logs.some((message) => message.includes("[redacted]")));
    assert.equal(
      logs.some((message) => message.includes("do-not-log-this")),
      false,
    );
  });

  await t.test("invalid snapshots never replace tracked state, and invalid room lists never remove rooms", async () => {
    roomManager.trackRoom(snapshot(95, "Keep"));
    invoke = async () => ({ room_ids: [95, "bad"] });
    await assert.rejects(roomManager.resync(), (error) => error.code === "INVALID_RESPONSE");
    assert.equal(roomManager.getRoom(95).name, "Keep");
    invoke = async () => ({ ...snapshot(95), players: null });
    await assert.rejects(roomManager.joinRoom(95), (error) => error.code === "INVALID_RESPONSE");
    assert.equal(roomManager.getRoom(95).name, "Keep");
    invoke = async () => snapshot(96);
    await assert.rejects(roomManager.joinRoom(95), (error) => error.code === "INVALID_RESPONSE");
    assert.equal(roomManager.getRoom(96), undefined);
    invoke = async () => null;
    await assert.rejects(roomManager.joinRoom(null, { name: "New", ruleset_id: 0, beatmap_id: 1 }), (error) => error.code === "INVALID_RESPONSE" && error.outcomeUnknown === true);
    invoke = async () => snapshot(95, "Valid retry");
    await roomManager.joinRoom(95);
    assert.equal(roomManager.getRoom(95).name, "Valid retry");
    roomManager.removeRoom(95);
  });

  await t.test("overlapping events preserve full snapshot players and publish one final state", async () => {
    let resolveJoin;
    invoke = () =>
      new Promise((resolve) => {
        resolveJoin = resolve;
      });
    const joining = roomManager.joinRoom(97);
    const fullPlayer = { user_id: 42, status: "ready", style: { ruleset_id: 3, beatmap_id: 8 }, mods: [{ acronym: "HD" }], team: "red" };
    const item = { id: 7, ruleset_id: 0, beatmap_id: 8, required_mods: [], allowed_mods: [], freestyle: false, was_played: true, order: 0 };
    roomManager.handleHubEvent("UserLeft", { room_id: 97, user_id: 42 });
    roomManager.handleHubEvent("UserJoined", { room_id: 97, user_id: 42 });
    roomManager.handleHubEvent("PlaylistItemAdded", { room_id: 97, playlist_item: { ...item, was_played: false } });
    roomManager.handleHubEvent("PlaylistItemChanged", { room_id: 97, playlist_item: { ...item, id: 9, beatmap_id: 10 } });
    roomManager.handleHubEvent("PlaylistItemRemoved", { room_id: 97, playlist_item_id: 9 });
    roomManager.handleHubEvent("RoomSettingsChanged", { room_id: 97, name: "After snapshot", password: "", type: "team_versus", queue_mode: "AllPlayersRoundRobin", playlist_item_id: 7, max_participants: 8 });
    roomManager.handleHubEvent("RefereeAdded", { room_id: 97, user_id: 44 });
    roomManager.handleHubEvent("RefereeRemoved", { room_id: 97, user_id: 44 });
    const fresh = snapshot(97);
    fresh.players = [fullPlayer];
    fresh.playlist = [item, { ...item, id: 9 }];
    updates.length = 0;
    await new Promise((resolve) => setImmediate(resolve));
    resolveJoin(fresh);
    const room = await joining;
    assert.deepEqual(room.players, [fullPlayer]);
    assert.equal(room.playlist[0].was_played, true);
    assert.equal(room.playlist.length, 1);
    assert.equal(room.name, "After snapshot");
    assert.equal(room.max_participants, 8);
    assert.equal(room.queue_mode, "AllPlayersRoundRobin");
    assert.deepEqual(room.referees, []);
    assert.equal(updates.length, 1);
    assert.equal(updates[0].queue_mode, "AllPlayersRoundRobin");
    roomManager.removeRoom(97);
  });

  await t.test("self kick removes tracking and prevents resync without invoking another hub method", async () => {
    roomManager.setCurrentUserId(35948605);
    roomManager.trackRoom(snapshot(4593225));
    const calls = [];
    invoke = async (method) => {
      calls.push(method);
      return { room_ids: [4593225] };
    };
    assert.equal(roomManager.handleHubEvent("UserKicked", { room_id: 4593225, kicked_user_id: 35948605, kicking_user_id: 15055190 }), true);
    assert.equal(roomManager.getRoom(4593225), undefined);
    assert.equal(removed.at(-1), 4593225);
    await roomManager.resync();
    assert.deepEqual(calls, ["ListRooms"]);
    assert.equal(roomManager.getRoom(4593225), undefined);
  });

  await t.test("kicking another user only removes that player", () => {
    const room = snapshot(4593226);
    room.players = [{ user_id: 42 }, { user_id: 35948605 }];
    roomManager.trackRoom(room);
    roomManager.handleHubEvent("UserKicked", { room_id: room.room_id, kicked_user_id: 42, kicking_user_id: 15055190 });
    assert.equal(roomManager.getRoom(room.room_id), room);
    assert.deepEqual(room.players, [{ user_id: 35948605 }]);
    roomManager.removeRoom(room.room_id);
  });

  for (const method of ["JoinRoom", "MakeRoom"]) {
    await t.test(`self kick during ${method} rejects the late snapshot`, async () => {
      const roomId = method === "JoinRoom" ? 4593227 : 4593228;
      let resolveJoin;
      invoke = () =>
        new Promise((resolve) => {
          resolveJoin = resolve;
        });
      const joining = roomManager.joinRoom(method === "JoinRoom" ? roomId : null, {});
      const rejected = assert.rejects(joining);
      await new Promise((resolve) => setImmediate(resolve));
      updates.length = 0;
      roomManager.handleHubEvent("UserKicked", { room_id: roomId, kicked_user_id: 35948605, kicking_user_id: 15055190 });
      resolveJoin(snapshot(roomId));
      await rejected;
      assert.equal(roomManager.getRoom(roomId), undefined);
      assert.deepEqual(updates, []);
    });
  }

  await t.test("reset clears the current user identity", () => {
    roomManager.reset();
    const room = snapshot(4593229);
    roomManager.trackRoom(room);
    roomManager.handleHubEvent("UserKicked", { room_id: room.room_id, kicked_user_id: 35948605, kicking_user_id: 15055190 });
    assert.equal(roomManager.getRoom(room.room_id), room);
    roomManager.removeRoom(room.room_id);
  });

  await t.test("session reset rejects old room snapshots and chat waits", async () => {
    let resolveJoin;
    invoke = () =>
      new Promise((resolve) => {
        resolveJoin = resolve;
      });
    const joining = roomManager.joinRoom(88);
    const waiting = roomManager.waitForChatChannel(999);
    const rejectedWait = assert.rejects(waiting, /session ended/);
    roomManager.reset();
    await new Promise((resolve) => setImmediate(resolve));
    resolveJoin(snapshot(88));
    await assert.rejects(joining, /session ended/);
    await rejectedWait;
    assert.deepEqual(roomManager.getAllRooms(), []);
    assert.equal(statuses.at(-1).state, "idle");
  });

  await t.test("resync retries stale membership and preserves closed room failures", async () => {
    const attempts = new Map();
    invoke = async (method, roomId) => {
      if (method === "ListRooms") return { room_ids: [100, 101] };
      attempts.set(roomId, (attempts.get(roomId) ?? 0) + 1);
      if (roomId === 100 || attempts.get(roomId) === 1) throw new Error("An unexpected error occurred invoking 'JoinRoom' on the server.");
      return snapshot(roomId);
    };
    await assert.rejects(roomManager.resync(), AggregateError);
    assert.deepEqual(
      [...attempts],
      [
        [100, config.hubRetry.attempts],
        [101, 2],
      ],
    );
    assert.equal(roomManager.getRoom(100), undefined);
    assert.equal(roomManager.getRoom(101).room_id, 101);
    assert.deepEqual(statuses.at(-1).failedRoomIds, [100]);
    roomManager.removeRoom(101);
  });

  await t.test("resync reports retry details and clears them after recovery", async () => {
    let listCalls = 0;
    let joinCalls = 0;
    invoke = async (method) => {
      if (method === "ListRooms") {
        if (++listCalls === 1) throw new Error("An unexpected error occurred invoking 'ListRooms' on the server.");
        return { room_ids: [104] };
      }
      if (++joinCalls === 1) throw new Error("An unexpected error occurred invoking 'JoinRoom' on the server.");
      return snapshot(104);
    };
    const start = statuses.length;
    await roomManager.resync();
    const events = statuses.slice(start).filter((event) => event.type === "lazer_sync_state");
    assert.deepEqual(
      events.map((event) => event.state),
      ["syncing", "retrying", "syncing", "retrying", "syncing", "synced"],
    );
    assert.deepEqual(
      events
        .filter((event) => event.state === "retrying")
        .map(({ operation, roomId, attempt, maxAttempts, retryIn }) => ({ operation, roomId, attempt, maxAttempts, validDelay: retryIn >= 0 && retryIn <= config.hubRetry.maxDelay })),
      [
        { operation: "ListRooms", roomId: undefined, attempt: 2, maxAttempts: config.hubRetry.attempts, validDelay: true },
        { operation: "JoinRoom", roomId: 104, attempt: 2, maxAttempts: config.hubRetry.attempts, validDelay: true },
      ],
    );
    roomManager.removeRoom(104);
  });

  await t.test("resync never repeats local failures", async () => {
    for (const code of ["REQUEST_CANCELLED", "RATE_LIMIT_WAIT_TIMEOUT", "RATE_LIMIT_QUEUE_FULL"]) {
      let calls = 0;
      invoke = async (method) => {
        if (method === "ListRooms") return { room_ids: [102] };
        calls++;
        throw Object.assign(new Error("An unexpected error occurred invoking 'JoinRoom' on the server."), { code });
      };
      await assert.rejects(roomManager.resync(), AggregateError);
      assert.equal(calls, 1, code);
    }
  });

  await t.test("ListRooms and JoinRoom retry timeouts and invalid responses", async () => {
    const previousTimeout = config.hubRequestTimeoutMs;
    config.hubRequestTimeoutMs = 10;
    try {
      let calls = 0;
      invoke = (method) => {
        calls++;
        if (calls < 3) return new Promise(() => {});
        return Promise.resolve(method === "ListRooms" ? { room_ids: [] } : snapshot(103));
      };
      assert.deepEqual(await invokeHub("ListRooms"), { room_ids: [] });
      assert.equal(calls, 3);

      calls = 0;
      invoke = async () => (++calls < 2 ? { ...snapshot(103), players: null } : snapshot(103));
      await roomManager.joinRoom(103);
      assert.equal(calls, 2);
      roomManager.removeRoom(103);
    } finally {
      config.hubRequestTimeoutMs = previousTimeout;
    }
  });

  await t.test("mutating hub methods are never retried", async () => {
    for (const method of ["MakeRoom", "Roll", "ChangeRoomSettings"]) {
      let calls = 0;
      invoke = async () => {
        calls++;
        throw new Error(`An unexpected error occurred invoking '${method}' on the server.`);
      };
      await assert.rejects(invokeHub(method, 1));
      assert.equal(calls, 1, method);
    }
  });

  await t.test("disconnect cancels queued calls without sending them", async () => {
    const previousConcurrency = config.hubRateLimit.concurrency;
    config.hubRateLimit.concurrency = 1;
    let finish;
    let calls = 0;
    invoke = () => {
      calls++;
      return new Promise((resolve) => {
        finish = resolve;
      });
    };
    const active = invokeHub("Roll", 1);
    await new Promise((resolve) => setImmediate(resolve));
    const queued = invokeHub("Roll", 2);
    const rejected = assert.rejects(queued, { code: "REQUEST_CANCELLED", outcomeUnknown: false });
    const activeRejected = assert.rejects(active, /session was replaced/);
    await disconnectFromRefereeHub();
    finish({ result: 1 });
    await Promise.all([rejected, activeRejected]);
    assert.equal(calls, 1);
    config.hubRateLimit.concurrency = previousConcurrency;
    await connectToRefereeHub(
      (event) => forwarded.push(event),
      () => roomManager.resync(),
      (event) => statuses.push(event),
    );
  });

  await t.test("disconnect rejects late invocation results and suppresses old hub events", async () => {
    let resolveInvoke;
    invoke = () =>
      new Promise((resolve) => {
        resolveInvoke = resolve;
      });
    const invoking = invokeHub("Roll", 1);
    await new Promise((resolve) => setImmediate(resolve));
    const before = forwarded.length;
    await disconnectFromRefereeHub();
    await new Promise((resolve) => setImmediate(resolve));
    resolveInvoke({ result: 1 });
    await assert.rejects(invoking, /session was replaced/);
    listeners.get("UserJoined")({ room_id: 1, user_id: 2 });
    assert.equal(forwarded.length, before);
    await assert.rejects(invokeHub("ListRooms"), /not connected/);
    assert.equal(statuses.at(-1).state, "disconnected");
  });
});
import { logger } from "../src/logger/logger.ts";
