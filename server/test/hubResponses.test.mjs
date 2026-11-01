import assert from "node:assert/strict";
import { test } from "node:test";
import { isHubResponse, isHubPayload } from "../src/lazer/refereeHubClient.ts";

const room = {
  room_id: 1,
  chat_channel_id: 2,
  name: "Room",
  password: "",
  max_participants: 0,
  queue_mode: "all_players",
  state: { type: "team_versus", locked: false, slots: null },
  playlist: [{ id: 7, ruleset_id: 3, beatmap_id: 8, required_mods: [], allowed_mods: [], freestyle: true, was_played: false, order: 0 }],
  players: [{ user_id: 3, status: "ready", mods: [{ acronym: "HD", settings: {} }], style: { ruleset_id: null, beatmap_id: null }, team: "red" }],
  referees: [{ user_id: 4 }],
  extra: "preserved",
};

await test("snapshot response validation checks nested structures and uniqueness", () => {
  assert.equal(isHubResponse("JoinRoom", room), true);
  assert.equal(isHubResponse("MakeRoom", room), true);
  for (const mutate of [
    (r) => {
      delete r.players;
    },
    (r) => {
      r.state.slots = ["3"];
    },
    (r) => {
      r.players[0].status = ["ready"];
    },
    (r) => {
      r.players[0].mods = [null];
    },
    (r) => {
      r.players[0].style.ruleset_id = 4;
    },
    (r) => {
      r.players[0].team = "green";
    },
    (r) => {
      r.referees[0].user_id = 0;
    },
    (r) => {
      r.playlist[0].required_mods = [{ acronym: "HD", settings: [] }];
    },
    (r) => {
      r.players.push(r.players[0]);
    },
    (r) => {
      r.playlist.push(r.playlist[0]);
    },
    (r) => {
      r.referees.push(r.referees[0]);
    },
  ]) {
    const invalid = structuredClone(room);
    mutate(invalid);
    assert.equal(isHubResponse("JoinRoom", invalid), false);
  }
  for (const invalid of [null, [], {}, { room_ids: [1, 1] }, { room_ids: [0] }, { room_ids: [1.5] }]) assert.equal(isHubResponse("ListRooms", invalid), false);
  assert.equal(isHubResponse("ListRooms", { room_ids: [] }), true);
});

await test("countdowns accept fractional seconds as defined by spectator", () => {
  assert.equal(isHubPayload("CountdownStarted", { room_id: 1, countdown_id: 1, type: "match_start", seconds: 1.5 }), true);
});
