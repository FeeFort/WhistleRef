import { WebSocket } from "ws";
import modsByRuleset from "../../../client/src/assets/mods/mods.json" with { type: "json" };
import { getAccessToken } from "../auth/auth.js";
import { getLazerChatBridge } from "../chats/lazerChatBridge.js";
import { fetchApi } from "../osu-api/osuApiClient.js";
import type { ClientMessage, LazerModDefinition, LazerRulesetMods, ResolvedLazerUser } from "../types/index.js";
import type { OsuApiBeatmapLookupResponse, OsuApiUserLookupResponse } from "../types/osu-api.js";
import { roomManager } from "./roomManager.js";
import { invokeHub } from "./refereeHubClient.js";
import { sendJson } from "../wsGateway.js";

const FAILURE = "The command could not be completed.";

function readableHubError(error: unknown): string | null {
  if (!(error instanceof Error)) return null;
  const message = error.message.trim();
  if (!message || /^An unexpected error occurred invoking '.+' on the server\.$/.test(message)) return null;
  if (/^(?:Cannot invoke |SignalR |WebSocket |Failed to start the connection)/i.test(message)) return null;
  return message;
}

const MOD_ALIASES: Record<string, string> = {
  easy: "EZ",
  nofail: "NF",
  halftime: "HT",
  hardrock: "HR",
  suddendeath: "SD",
  perfect: "PF",
  doubletime: "DT",
  nightcore: "NC",
  hidden: "HD",
  flashlight: "FL",
  relax: "RX",
  autopilot: "AP",
  spunout: "SO",
  touchdevice: "TD",
  freemod: "FM",
  key1: "1K",
  key2: "2K",
  key3: "3K",
  key4: "4K",
  key5: "5K",
  key6: "6K",
  key7: "7K",
  key8: "8K",
  key9: "9K",
  keycoop: "CO",
  mirror: "MR",
  fadein: "FI",
};

const LEGACY_STABLE_MOD_MASKS: Record<string, number> = {
  NF: 1,
  EZ: 2,
  TD: 4,
  HD: 8,
  HR: 16,
  SD: 32,
  DT: 64,
  RX: 128,
  HT: 256,
  FL: 1024,
  SO: 4096,
  AP: 8192,
  NC: 576,
  PF: 16416,
  "1K": 67108864,
  "2K": 268435456,
  "3K": 134217728,
  "4K": 32768,
  "5K": 65536,
  "6K": 131072,
  "7K": 262144,
  "8K": 524288,
  "9K": 16777216,
  "10K": 33554432,
  FI: 1048576,
  RD: 2097152,
  MR: 1073741824,
};

async function acknowledge(client: WebSocket, message: ClientMessage): Promise<void> {
  sendJson(client, { type: "ack", received: message.type, ...(message.requestId !== undefined ? { requestId: message.requestId } : {}) });
}

async function fail(client: WebSocket, message: ClientMessage, error: unknown): Promise<void> {
  sendJson(client, {
    type: "error",
    request: message.type,
    ...(message.requestId !== undefined ? { requestId: message.requestId } : {}),
    message: error instanceof Error ? error.message : String(error),
  });
}

function say(roomId: number, text: string): void {
  void getLazerChatBridge()?.recordEvent(roomId, text);
}

function currentPlaylistItem(room: ReturnType<typeof roomManager.getRoom>) {
  const playlist = Array.isArray(room?.playlist) ? room.playlist : [];
  const currentId = Number(room?.current_playlist_item_id ?? room?.playlist_item_id ?? room?.state?.playlist_item_id);
  return (
    (Number.isInteger(currentId) && playlist.find((item) => item.id === currentId && !item.was_played)) || [...playlist].sort((a, b) => a.order - b.order).find((item) => !item.was_played) || null
  );
}

function expandLegacyModMask(value: string): string[] | null {
  const mask = Number(value);
  if (!Number.isSafeInteger(mask) || mask <= 0) return null;
  let remaining = mask;
  const expanded: string[] = [];
  const entries = Object.entries(LEGACY_STABLE_MOD_MASKS).sort(([left], [right]) => {
    const leftCompound = left === "NC" || left === "PF";
    const rightCompound = right === "NC" || right === "PF";
    return Number(rightCompound) - Number(leftCompound) || LEGACY_STABLE_MOD_MASKS[right] - LEGACY_STABLE_MOD_MASKS[left];
  });
  for (const [acronym, bitmask] of entries) {
    if ((remaining & bitmask) !== bitmask) continue;
    remaining -= bitmask;
    expanded.push(acronym);
  }
  return remaining === 0 ? expanded.reverse() : null;
}

function normalizeMods(values: string[]): string[] {
  return values
    .map((value) => value.trim())
    .filter(Boolean)
    .filter((value) => !/^(?:enabled|disabled|none)$/i.test(value))
    .map((value) => MOD_ALIASES[value.toLowerCase()] || value.toUpperCase())
    .filter((value, index, all) => all.indexOf(value) === index);
}

function modsForRuleset(rulesetId: number | undefined): Map<string, LazerModDefinition> {
  const entries = modsByRuleset as LazerRulesetMods[];
  const ruleset = entries.find((entry) => Number(entry.RulesetID) === Number(rulesetId)) || entries[0];
  const result = new Map<string, LazerModDefinition>();
  for (const mod of ruleset?.Mods || []) {
    const acronym = String(mod.Acronym || "")
      .trim()
      .toUpperCase();
    if (acronym && !result.has(acronym)) result.set(acronym, mod);
  }
  return result;
}

function allMods(): Map<string, LazerModDefinition> {
  const entries = modsByRuleset as LazerRulesetMods[];
  const result = new Map<string, LazerModDefinition>();
  for (const mod of entries.flatMap((entry) => entry.Mods || [])) {
    const acronym = String(mod.Acronym || "")
      .trim()
      .toUpperCase();
    if (acronym && !result.has(acronym)) result.set(acronym, mod);
  }
  return result;
}

async function resolveUser(target: string): Promise<ResolvedLazerUser | null> {
  const value = target.trim().replace(/^#(?=\d)/, "");
  if (!value) return null;
  const endpoint = /^\d+$/.test(value) ? `users/${value}` : `users/@${encodeURIComponent(value.replace(/^@+/, ""))}`;
  try {
    const profile = (await fetchApi(await getAccessToken(), endpoint)) as OsuApiUserLookupResponse;
    const userId = Number(profile?.id);
    const username = typeof profile?.username === "string" ? profile.username : "";
    if (!Number.isSafeInteger(userId) || userId <= 0 || !username) return null;
    return { userId, username };
  } catch {
    if (!/^\d+$/.test(value)) return null;
    const userId = Number(value);
    return Number.isSafeInteger(userId) && userId > 0 ? { userId, username: `User ${userId}` } : null;
  }
}

function hasRoomPlayer(roomId: number, userId: number): boolean {
  return roomManager.getRoom(roomId)?.players.some((player) => player.user_id === userId) === true;
}

async function execute(roomId: number, input: string): Promise<void> {
  const match = input.trim().match(/^!mp\s+([a-z]+)(?:\s+([\s\S]*))?$/i);
  if (!match) return;
  const command = match[1].toLowerCase();
  const args = String(match[2] || "").trim();
  const room = roomManager.getRoom(roomId);

  if (command === "lock" || command === "unlock") {
    const locked = command === "lock";
    await invokeHub("SetLockState", roomId, { locked });
    say(roomId, locked ? "Locked the match." : "Unlocked the match.");
    return;
  }
  if (command === "size") {
    if (!/^\d+$/.test(args)) return;
    const size = Number(args);
    await invokeHub("ChangeRoomSettings", roomId, { max_participants: size });
    say(roomId, `Changed match to size ${size || "Infinite"}.`);
    return;
  }
  if (command === "set") {
    const values = args.match(/^(\d+)\s+(\d+)$/);
    if (!values) return;
    const mode = Number(values[1]);
    const size = Number(values[2]);
    const matchType = mode === 0 ? "head_to_head" : mode === 2 ? "team_versus" : null;
    if (mode === 1 || mode === 3) return say(roomId, "This team mode is not supported in Lazer.");
    if (!matchType) return;
    await invokeHub("ChangeRoomSettings", roomId, { type: matchType, max_participants: size });
    say(roomId, `Changed match settings to ${size || "Infinite"} slots, ${matchType === "head_to_head" ? "HeadToHead" : "TeamVs"}.`);
    return;
  }
  if (["move", "team", "kick", "invite", "addref", "removeref"].includes(command)) {
    let target = args;
    let slot: number | undefined;
    let team: "red" | "blue" | undefined;
    if (command === "move") {
      const values = args.match(/^(.+?)\s+(\d+)$/);
      if (!values || Number(values[2]) < 1) return;
      target = values[1];
      slot = Number(values[2]) - 1;
    } else if (command === "team") {
      const values = args.match(/^(.+?)\s+(red|blue)$/i);
      if (!values) return;
      target = values[1];
      team = values[2].toLowerCase() as "red" | "blue";
    }
    const user = await resolveUser(target);
    if (!user || (["move", "team", "kick"].includes(command) && !hasRoomPlayer(roomId, user.userId))) return say(roomId, "User not found.");
    if (command === "move" || command === "team") {
      await invokeHub("MoveUser", roomId, { user_id: user.userId, ...(slot === undefined ? {} : { slot }), ...(team ? { team } : {}) });
      say(roomId, command === "move" ? `Moved ${user.username} into slot ${slot! + 1}.` : `Moved ${user.username} to team ${team === "red" ? "Red" : "Blue"}.`);
    } else if (command === "kick") {
      await invokeHub("KickPlayer", roomId, user.userId);
      say(roomId, `Kicked ${user.username} from the match.`);
    } else if (command === "invite") {
      await invokeHub("InvitePlayer", roomId, user.userId);
      say(roomId, `Invited ${user.username} to the room.`);
    } else if (command === "addref") {
      await invokeHub("AddReferee", roomId, user.userId);
      say(roomId, `Added ${user.username} to the match referees.`);
    } else {
      await invokeHub("RemoveReferee", roomId, user.userId);
      say(roomId, `Removed ${user.username} from the match referees.`);
    }
    return;
  }
  if (command === "close") {
    await invokeHub("CloseRoom", roomId);
    roomManager.removeRoom(roomId, { exclude: true, reason: "closed" });
    say(roomId, "Closed the room.");
    return;
  }
  if (command === "start") {
    if (args && !/^\d+$/.test(args)) return;
    const countdown = args ? Number(args) : 0;
    await invokeHub("StartMatch", roomId, { countdown });
    say(roomId, countdown ? `Started the match with a ${countdown} second countdown.` : "Started the match.");
    return;
  }
  if (command === "map") {
    if (!/^\d+$/.test(args) || Number(args) <= 0) return say(roomId, "Invalid map ID provided.");
    const beatmapId = Number(args);
    let beatmap: OsuApiBeatmapLookupResponse;
    try {
      beatmap = (await fetchApi(await getAccessToken(), `beatmaps/${beatmapId}`)) as OsuApiBeatmapLookupResponse;
      if (!beatmap?.id) return say(roomId, "Invalid map ID provided.");
    } catch {
      return say(roomId, "Invalid map ID provided.");
    }
    const item = currentPlaylistItem(room);
    await invokeHub("EditCurrentPlaylistItem", roomId, { beatmap_id: beatmap.id, ruleset_id: beatmap.mode_int ?? beatmap.ruleset_id ?? item?.ruleset_id });
    const artist = beatmap.beatmapset?.artist || beatmap.artist || "Unknown artist";
    const title = beatmap.beatmapset?.title || beatmap.title || "Unknown title";
    const difficulty = beatmap.version ? ` [${beatmap.version}]` : "";
    say(roomId, `Changed beatmap to https://osu.ppy.sh/b/${beatmap.id} ${artist} - ${title}${difficulty}.`);
    return;
  }
  if (command === "mods") {
    const rawTokens = args ? args.split(/\s+/).filter(Boolean) : [];
    const item = currentPlaylistItem(room);
    if (rawTokens.length === 1 && rawTokens[0] === "0") {
      await invokeHub("EditCurrentPlaylistItem", roomId, { required_mods: [], allowed_mods: [], freestyle: false, ruleset_id: item?.ruleset_id, beatmap_id: item?.beatmap_id });
      say(roomId, "Updated match mods: disabled all mods.");
      return;
    }
    const zeroWithFreemod = rawTokens.includes("0") && rawTokens.every((token) => token === "0" || /^(?:fm|freemod)$/i.test(token));
    const expanded: string[] = [];
    for (const rawToken of rawTokens) {
      if (zeroWithFreemod && rawToken === "0") continue;
      if (/^\d+$/.test(rawToken)) {
        const decoded = expandLegacyModMask(rawToken);
        if (!decoded) return say(roomId, `Mod ${rawToken} not found.`);
        expanded.push(...decoded);
      } else expanded.push(rawToken);
    }
    const tokens = normalizeMods(expanded);
    const wantsFreemod = tokens.includes("FM");
    const requested = tokens.filter((acronym) => acronym !== "FM");
    const all = allMods();
    const byRuleset = modsForRuleset(item?.ruleset_id ?? room?.ruleset_id);
    for (const acronym of requested) {
      const definition = all.get(acronym);
      if (!definition) return say(roomId, `Mod ${acronym} not found.`);
      const current = byRuleset.get(acronym);
      const name = String(definition.Name || acronym);
      if (!current) return say(roomId, `${name} is not supported in this ruleset.`);
      if (current.ValidForMultiplayer !== true) return say(roomId, `${String(current.Name || name)} is not supported in multiplayer rooms.`);
    }
    const conflicts: string[] = [];
    for (let i = 0; i < requested.length; i++)
      for (let j = i + 1; j < requested.length; j++) {
        const left = all.get(requested[i]);
        const right = all.get(requested[j]);
        const leftIncompatible = Array.isArray(left?.IncompatibleMods) && left.IncompatibleMods.map((mod) => String(mod).toUpperCase()).includes(requested[j]);
        const rightIncompatible = Array.isArray(right?.IncompatibleMods) && right.IncompatibleMods.map((mod) => String(mod).toUpperCase()).includes(requested[i]);
        if (leftIncompatible || rightIncompatible) conflicts.push(`${requested[i]} + ${requested[j]}`);
      }
    if (conflicts.length) return say(roomId, `Mods ${[...new Set(conflicts)].join(", ")} conflict with each other.`);
    const requiredMods = requested.map((acronym) => ({ acronym }));
    const requiredConflicts = new Set(requested);
    for (const acronym of requested) for (const incompatible of (all.get(acronym)?.IncompatibleMods as unknown[]) || []) requiredConflicts.add(String(incompatible).toUpperCase());
    for (const [acronym, definition] of all) {
      if (requested.some((required) => Array.isArray(definition.IncompatibleMods) && definition.IncompatibleMods.map((mod) => String(mod).toUpperCase()).includes(required)))
        requiredConflicts.add(acronym);
    }
    const allowedMods = wantsFreemod
      ? [...all.values()]
          .filter((mod) => mod.ValidForMultiplayer && mod.ValidForMultiplayerAsFreeMod)
          .map((mod) => String(mod.Acronym).toUpperCase())
          .filter((acronym) => !requiredConflicts.has(acronym))
          .map((acronym) => ({ acronym }))
      : [];
    const enabledNames = requested.map((acronym) => String(all.get(acronym)?.Name || acronym));
    const summary = [...(enabledNames.length ? [`enabled ${enabledNames.join(", ")}`] : []), `${wantsFreemod ? "enabled" : "disabled"} Freemod`].join(", ");
    await invokeHub("EditCurrentPlaylistItem", roomId, { required_mods: requiredMods, allowed_mods: allowedMods, freestyle: false, ruleset_id: item?.ruleset_id, beatmap_id: item?.beatmap_id });
    say(roomId, `Updated match mods: ${summary}.`);
    return;
  }
  if (command === "abort") {
    if (!room?.players.some((player) => player.status === "playing")) return say(roomId, "The match is not in progress.");
    await invokeHub("AbortMatch", roomId);
    say(roomId, "Aborted the match.");
    return;
  }
  if (command === "name") {
    if (!args) return;
    await invokeHub("ChangeRoomSettings", roomId, { name: args });
    say(roomId, `Room name updated to "${args}".`);
    return;
  }
  say(roomId, `Unknown !mp command: ${command}.`);
}

export async function handleLazerMpCommand(client: WebSocket, message: ClientMessage): Promise<void> {
  const request = message as Extract<ClientMessage, { type: "lazer_mp_command" }>;
  try {
    const parsed = request.command.trim().match(/^!mp\s+/i);
    if (!parsed) throw new Error("command must start with !mp.");
    if (!roomManager.getRoom(request.room_id)) throw new Error(`Room ${request.room_id} is not tracked.`);
    try {
      await execute(request.room_id, request.command);
    } catch (error) {
      say(request.room_id, readableHubError(error) || FAILURE);
    }
    await acknowledge(client, message);
  } catch (error) {
    await fail(client, message, error || new Error(FAILURE));
  }
}
