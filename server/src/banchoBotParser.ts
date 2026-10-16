import { logger } from "./logger/logger.js";
import {
  MpSizeCommand,
  MpSetCommand,
  RoomInfo,
  ScoreMode,
  TeamMode,
  GameMode,
  TeamSettings,
  SizeConfirmation,
  SlotLockState,
  TimerMessage,
  BeatmapInfo,
  ActiveMods,
  PlayerJoined,
  PlayerLeft,
  PlayerTeamChange,
  PlayerSlotChange,
  PlayerScore,
  MatchFinished,
  MatchMetadata,
  ParsedBanchoBotMessage,
  ParsedLobbyCommand,
  PlayerSnapshot,
  Team,
} from "./types.js";

export const TEAM_MODES: Record<number, TeamMode> = Object.freeze({
  0: "HeadToHead",
  1: "TagCoop",
  2: "TeamVs",
  3: "TagTeamVs",
});

export const SCORE_MODES: Record<number, ScoreMode> = Object.freeze({
  0: "Score",
  1: "Accuracy",
  2: "Combo",
  3: "ScoreV2",
});

export const GAME_MODES: Record<string, GameMode> = Object.freeze({
  Osu: "osu!",
  Taiko: "osu!taiko",
  CatchTheBeat: "osu!catch",
  OsuMania: "osu!mania",
});

export const QUALIFIER_ALIASES: readonly string[] = Object.freeze(["Qualifiers", "Quals", "Qualifier"]);

const MOD_NAMES: Record<string, string> = Object.freeze({
  EZ: "Easy",
  NF: "NoFail",
  HT: "HalfTime",
  HR: "HardRock",
  SD: "SuddenDeath",
  DT: "DoubleTime",
  HD: "Hidden",
  FL: "Flashlight",
  RX: "Relax",
  AP: "Relax2",
  SO: "SpunOut",
  "1K": "Key1",
  "2K": "Key2",
  "3K": "Key3",
  "4K": "Key4",
  "5K": "Key5",
  "6K": "Key6",
  "7K": "Key7",
  "8K": "Key8",
  "9K": "Key9",
  CO: "KeyCoop",
  MR: "Mirror",
  FI: "FadeIn",
});

const MOD_CODES: Map<string, string> = new Map(
  Object.entries(MOD_NAMES).flatMap(([code, name]) => [
    [code.toLowerCase(), code],
    [name.toLowerCase(), code],
  ]),
);

const TEAM_MODE_NAMES: Map<string, TeamMode> = new Map(Object.values(TEAM_MODES).map((value) => [value.toLowerCase(), value]));
const SCORE_MODE_NAMES: Map<string, ScoreMode> = new Map(Object.values(SCORE_MODES).map((value) => [value.toLowerCase(), value]));
const GAME_MODE_NAMES: Map<string, GameMode> = new Map(Object.values(GAME_MODES).map((value) => [value.toLowerCase(), value]));

function parseGameMode(text: string): GameMode | null {
  const match = text.match(/^Changed match mode to\s+([^\r\n]+?)\.?$/i);
  if (!match) return null;

  const mode = GAME_MODE_NAMES.get(match[1].trim().toLowerCase());
  return mode ?? null;
}

function parseRoomName(text: string): RoomInfo | null {
  const match = text.match(/^Room name:\s*(.*?)(?:,\s*History:|$)/i);
  if (!match) return null;

  const name = match[1].trim();
  const teams = name.match(/\(([^()]+)\)\s+vs\s+\(([^()]+)\)/i);
  if (!teams) return { name, qualifiers: false };
  const qualifiers = QUALIFIER_ALIASES.some((alias) => alias.toLowerCase() === teams[1].trim().toLowerCase());

  return {
    name,
    qualifiers,
    teamRed: teams[1].trim(),
    teamBlue: teams[2].trim(),
  };
}

function parseNamedModes(teamMode: string, scoreMode: string): { teamMode: TeamMode; scoreMode: ScoreMode } | null {
  const normalizedTeamMode = TEAM_MODE_NAMES.get(teamMode.trim().toLowerCase());
  const normalizedScoreMode = SCORE_MODE_NAMES.get(scoreMode.trim().toLowerCase());
  if (!normalizedTeamMode || !normalizedScoreMode) return null;

  return {
    teamMode: normalizedTeamMode,
    scoreMode: normalizedScoreMode,
  };
}

function parseTeamSettings(text: string): TeamSettings | null {
  const line = text.match(/Team mode:\s*([^,]+),\s*Win condition:\s*([^\r\n]+)/i);
  if (line) return parseNamedModes(line[1], line[2]);

  const changed = text.match(/Changed match settings to\s*(\d+)\s+slots?,\s*([^,]+),\s*([^\r\n]+)/i);
  if (!changed) return null;

  const modes = parseNamedModes(changed[2], changed[3]);
  if (!modes) return null;
  return { ...modes, size: Number(changed[1]) };
}

function parseMpSetCommand(text: string): MpSetCommand | null {
  const match = text.match(/^\s*!mp\s+set\s+([0-3])\s+([0-3])\s+(\d+)(?:\s|$)/i);
  if (!match) return null;

  return {
    teamMode: TEAM_MODES[Number(match[1])],
    scoreMode: SCORE_MODES[Number(match[2])],
    size: Number(match[3]),
  };
}

function parseMpSizeCommand(text: string): MpSizeCommand | null {
  const match = text.match(/^\s*!mp\s+size\s+(\d+)(?:\s|$)/i);
  return match ? { size: Number(match[1]) } : null;
}

function parseSizeConfirmation(text: string): SizeConfirmation | null {
  const match = text.match(
    /(?:Changed match settings to|Changed match size to|Changed match to size|match size (?:changed|set) to|room size (?:changed|set) to|lobby size (?:changed|set) to)\s*(\d+)(?:\s*slots?)?|Players:\s*\d+\s*\/\s*(\d+)|(?:Slots?|Size):\s*(\d+)/i,
  );
  if (!match) return null;
  const size = match[1] || match[2] || match[3];
  return { size: Number(size) };
}

function parseSlotLockState(text: string): SlotLockState | null {
  const match = text.match(/^Slot\s+(\d+)\s+(?:is\s+)?(locked|open|opened|unlocked)\.?$/i);
  if (!match) return null;
  const slot = Number(match[1]);
  if (!Number.isInteger(slot) || slot < 1 || slot > 16) return null;
  return { slot, locked: /locked/i.test(match[2]) };
}

function parseTimerMessage(text: string): TimerMessage | null {
  if (/^Countdown aborted\.?$/i.test(text.trim())) return { type: "aborted" };
  if (/^Countdown finished\.?$/i.test(text.trim())) return { type: "finished" };

  const match = text.match(/^Countdown ends in\s+(.+?)\.?$/i);
  if (!match) return null;

  const minutes = Number(match[1].match(/(\d+)\s+minutes?/i)?.[1] || 0);
  const seconds = Number(match[1].match(/(\d+)\s+seconds?/i)?.[1] || 0);
  const totalSeconds = minutes * 60 + seconds;
  if (!totalSeconds) return null;

  return {
    type: "started",
    seconds: totalSeconds,
  };
}

function parseBeatmap(text: string): BeatmapInfo | null {
  const match = text.match(/https?:\/\/osu\.ppy\.sh\/b\/(\d+)\b([^\r\n]*)/i);
  if (!match) return null;

  const url = `https://osu.ppy.sh/b/${match[1]}`;
  const title = match[2]
    .trim()
    .replace(/^[–—-]\s*/, "")
    .trim();
  const beatmapId = Number(match[1]);
  return { id: beatmapId, beatmapId, url, title: title || null };
}

function parseBeatmapMessage(text: string): { type: "beatmap"; value: { currentBeatmap: BeatmapInfo } } | null {
  if (!/^(?:Beatmap:|Changed beatmap to\s+)/i.test(text)) return null;
  const beatmap = parseBeatmap(text);
  return beatmap ? { type: "beatmap", value: { currentBeatmap: beatmap } } : null;
}

function parseActiveMods(text: string): ActiveMods | null {
  const match = text.match(/^Active mods:\s*(.+)$/i);
  if (match) {
    const value = match[1].trim();
    return { activeMods: /^none$/i.test(value) ? null : value };
  }

  // Newer BanchoBot messages can contain multiple enabled/disabled clauses,
  // for example: "Enabled DoubleTime, enabled FreeMod".
  const confirmation = text.match(/^Enabled\s+(.+?)(?:\.)?$/i);
  if (!confirmation) return null;

  const body = confirmation[1].trim();
  const clauses = [...body.matchAll(/,\s*(enabled|disabled)\s+/gi)];
  const enabled: string[] = [];
  const addEnabled = (value: string) => {
    if (!value || /^none$/i.test(value.trim())) return;
    enabled.push(
      ...value
        .split(/\s*,\s*/)
        .map((mod) => mod.trim())
        .filter(Boolean),
    );
  };

  if (!clauses.length) {
    addEnabled(body);
  } else {
    addEnabled(body.slice(0, clauses[0].index));
    clauses.forEach((clause, index) => {
      const start = clause.index + clause[0].length;
      const end = clauses[index + 1]?.index ?? body.length;
      if (clause[1].toLowerCase() === "enabled") addEnabled(body.slice(start, end));
    });
  }

  const mods = enabled.map((mod) => MOD_CODES.get(mod.toLowerCase()) || mod).filter((mod, index, values) => values.findIndex((value) => value.toLowerCase() === mod.toLowerCase()) === index);

  return { activeMods: mods.length ? mods.join(", ") : null };
}

function parseModsConfirmation(text: string): ActiveMods | null {
  const match = text.match(/^Disabled all mods, enabled\s+(.+)\.?$/i);
  if (match) return { activeMods: match[1].trim() };
  if (/^Disabled all mods\.?$/i.test(text.trim())) return { activeMods: null };
  return null;
}

function parsePlayerSnapshot(text: string): PlayerSnapshot | null {
  const match = text.match(/^Slot\s+(\d+)\s+(Ready|Not Ready|No Map)\s+(https?:\/\/\S+)\s+(.+?)\s*$/i);
  if (!match) return null;

  const playerDetails = match[4].match(/^(.*?)\s+\[([^\]]+)\]\s*$/);
  const candidateDetails = playerDetails?.[2].trim() || "";
  const detailParts = candidateDetails
    .split(/\s*\/\s*/)
    .map((part) => part.trim())
    .filter(Boolean);
  const detailTokens = detailParts.flatMap((part) =>
    part
      .split(/\s*,\s*/)
      .map((token) => token.trim())
      .filter(Boolean),
  );
  const knownDetails = detailTokens.length > 0 && detailTokens.every((detail) => /^Host$/i.test(detail) || /^Team\s+(Red|Blue)$/i.test(detail) || MOD_CODES.has(detail.toLowerCase()));
  const hasPlayerDetails = Boolean(playerDetails && knownDetails);
  const username = (hasPlayerDetails ? playerDetails?.[1] || "" : match[4]).trim();
  //const details = hasPlayerDetails ? candidateDetails : "";
  const teamPart = detailParts.find((part) => /^Team\s+(Red|Blue)$/i.test(part));
  const teamMatch = teamPart?.match(/^Team\s+(Red|Blue)$/i);
  const team = teamMatch ? (teamMatch[1].toLowerCase() as "red" | "blue") : null;
  const mods = detailParts
    .filter((part) => !/^Host$/i.test(part) && !/^Team\s+(Red|Blue)$/i.test(part))
    .flatMap((part) => part.split(/\s*,\s*/))
    .map((mod) => MOD_CODES.get(mod.trim().toLowerCase()) || mod.trim())
    .filter(Boolean);
  const isHost = detailParts.some((part) => /^Host$/i.test(part));

  const profileIdMatch = match[3].match(/\/u\/(\d+)(?:[/?#]|$)/i);
  const userId = profileIdMatch ? Number(profileIdMatch[1]) : null;

  return {
    username,
    profileUrl: match[3],
    userId,
    avatarUrl: userId ? `https://a.ppy.sh/${userId}` : null,
    slot: Number(match[1]),
    ready: match[2].toLowerCase() === "ready",
    noMap: match[2].toLowerCase() === "no map",
    ...(isHost ? { isHost: true as const } : {}),
    team,
    mods,
  };
}

function parsePlayerJoined(text: string): PlayerJoined | null {
  const match = text.match(/^(.+?) joined in slot\s+(\d+)(?:\s+for team\s+(red|blue))?\.?$/i);
  if (!match) return null;
  return {
    username: match[1].trim(),
    slot: Number(match[2]),
    team: match[3] ? (match[3].toLowerCase() as Team) : null,
    mods: [],
  };
}

function parsePlayerTeamChange(text: string): PlayerTeamChange | null {
  const match = text.match(/^(.+?) changed to\s+(red|blue)\.?$/i);
  if (!match) return null;
  return {
    username: match[1].trim(),
    team: match[2].toLowerCase() as Team,
  };
}

function parsePlayerMove(text: string): PlayerSlotChange | null {
  const match = text.match(/^(.+?) moved to slot\s+(\d{1,2})\.?$/i);
  if (!match) return null;
  const slot = Number(match[2]);
  if (!Number.isInteger(slot) || slot < 1 || slot > 16) return null;
  return {
    username: match[1].trim(),
    slot,
  };
}

function parsePlayerLeft(text: string): PlayerLeft | null {
  const match = text.match(/^(.+?) left the game\.?$/i);
  return match ? { username: match[1].trim() } : null;
}

function parsePlayerScore(text: string): PlayerScore | null {
  const match = text.match(/^(.+?) finished playing\s+\(Score:\s*(\d+),\s*([^)]+)\)\.?$/i);
  if (!match) return null;
  return {
    username: match[1].trim(),
    score: Number(match[2]),
    result: match[3].trim(),
  };
}

function parseHostChange(text: string): { host: string | null } | null {
  if (/^Cleared match host\.?$/i.test(text.trim())) return { host: null };
  const match = text.match(/^Changed match host to\s+(.+?)\.?$/i);
  return match ? { host: match[1].trim() } : null;
}

function parseMatchFinished(text: string): MatchFinished | null {
  return /^The match has finished!?$/i.test(text.trim()) ? { finished: true } : null;
}

function parseMatchMetadata(text: string): MatchMetadata | null {
  const bestOf = text.match(/^Best of\s*:?\s*(\d+)\b/i);
  if (bestOf) return { bestOf: Number(bestOf[1]) };

  const nextPick = text.match(/^Next pick\s*:\s*(.+)$/i);
  return nextPick ? { nextPickTeam: nextPick[1].trim() } : null;
}

export function parseBanchoBotMessage(text: string): ParsedBanchoBotMessage {
  const result = parseBanchoBotMessageValue(text);
  logger.child("stable", "banchoParser").trace(result ? "Message parsed" : "Message not recognized", () => ({ parser: "parseBanchoBotMessage", result }));
  return result;
}

function parseBanchoBotMessageValue(text: string): ParsedBanchoBotMessage {
  const slotLock = parseSlotLockState(text);
  if (slotLock) return { type: "slot_lock", value: slotLock };
  const room = parseRoomName(text);
  if (room) return { type: "room", value: room };

  const gameMode = parseGameMode(text);
  if (gameMode) return { type: "mode", value: gameMode };

  const modes = parseTeamSettings(text);
  if (modes) return { type: "settings", value: modes };

  const beatmap = parseBeatmapMessage(text);
  if (beatmap) return beatmap;

  const activeMods = parseActiveMods(text);
  if (activeMods) return { type: "mods", value: activeMods };

  const mods = parseModsConfirmation(text);
  if (mods) return { type: "mods", value: mods };

  const host = parseHostChange(text);
  if (host) return { type: "host", value: host };

  const player = parsePlayerSnapshot(text);
  if (player) return { type: "player", value: player };

  const joined = parsePlayerJoined(text);
  if (joined) return { type: "player_joined", value: joined };

  const teamChanged = parsePlayerTeamChange(text);
  if (teamChanged) return { type: "player_team_changed", value: teamChanged };

  const moved = parsePlayerMove(text);
  if (moved) return { type: "player_moved", value: moved };

  const left = parsePlayerLeft(text);
  if (left) return { type: "player_left", value: left };

  const score = parsePlayerScore(text);
  if (score) return { type: "player_score", value: score };

  const finished = parseMatchFinished(text);
  if (finished) return { type: "match_finished", value: finished };

  const metadata = parseMatchMetadata(text);
  if (metadata) return { type: "metadata", value: metadata };

  const size = parseSizeConfirmation(text);
  if (size) return { type: "size", value: size };

  const timer = parseTimerMessage(text);
  if (timer) return { type: "timer", value: timer };

  return null;
}

export function parseLobbyCommand(text: string): ParsedLobbyCommand {
  const result = parseLobbyCommandValue(text);
  logger.child("stable", "banchoParser").trace(result ? "Message parsed" : "Message not recognized", () => ({ parser: "parseLobbyCommand", result }));
  return result;
}

function parseLobbyCommandValue(text: string): ParsedLobbyCommand {
  const settings = parseMpSetCommand(text);
  if (settings) return { type: "settings", value: settings };

  const size = parseMpSizeCommand(text);
  if (size) return { type: "size", value: size };

  return null;
}
