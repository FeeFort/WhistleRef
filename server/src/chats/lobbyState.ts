import { logger } from "../logger/logger.js";

const log = logger.child("core", "lobbyState");

export type LobbyMatch = {
  teamRed?: string;
  teamBlue?: string;
  teamRedScore?: number;
  teamBlueScore?: number;
  bestOf?: number | null;
  nextPickTeam?: string | null;
  lastPlay?: Record<string, unknown> | null;
};

export type LobbyMaps = {
  activePoolId: string | null;
  qualificationMode: boolean;
  slots: Record<string, Record<string, unknown>>;
};

export type LobbyStateDocument = { v: number; match: LobbyMatch; maps: LobbyMaps };
export type LobbyStateOperation = { doc: LobbyStateDocument; changed: boolean };

export const DEFAULT_LOBBY_STATE: LobbyStateDocument = {
  v: 1,
  match: {},
  maps: { activePoolId: null, qualificationMode: false, slots: {} },
};

const MATCH_KEYS = new Set(["teamRed", "teamBlue", "teamRedScore", "teamBlueScore", "bestOf", "nextPickTeam", "lastPlay"]);
const MAX_DOCUMENT_BYTES = 256 * 1024;

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function equal(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function jsonBytes(value: unknown): number {
  return Buffer.byteLength(JSON.stringify(value), "utf8");
}

function assertDocumentSize(doc: LobbyStateDocument): void {
  if (jsonBytes(doc) >= MAX_DOCUMENT_BYTES) throw new Error("Lobby state must be smaller than 256 KB.");
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function defaultDocument(): LobbyStateDocument {
  return clone(DEFAULT_LOBBY_STATE);
}

export function normalize(raw: unknown): LobbyStateDocument {
  if (raw === null || raw === undefined || raw === "") {
    log.warn("Missing lobby state; using the default lobby state.");
    return defaultDocument();
  }
  let value: unknown = raw;
  if (typeof raw === "string") {
    try {
      value = JSON.parse(raw);
    } catch {
      log.warn("Invalid lobby state JSON; using the default lobby state.");
      return defaultDocument();
    }
  }
  if (!isPlainObject(value) || !Number.isInteger(value.v)) {
    log.warn("Invalid lobby state document; using the default lobby state.");
    return defaultDocument();
  }
  if ((value.v as number) > 1) return value as LobbyStateDocument;
  if (value.v !== 1) {
    log.warn("Unsupported lobby state version; using the default lobby state.");
    return defaultDocument();
  }
  const match = isPlainObject(value.match) ? value.match : {};
  const maps = isPlainObject(value.maps) ? value.maps : {};
  const slots = isPlainObject(maps.slots) ? maps.slots : {};
  const doc: LobbyStateDocument = {
    v: 1,
    match: clone(match) as LobbyMatch,
    maps: {
      activePoolId: typeof maps.activePoolId === "string" || maps.activePoolId === null ? maps.activePoolId : null,
      qualificationMode: maps.qualificationMode === true,
      slots: clone(slots) as Record<string, Record<string, unknown>>,
    },
  };
  return doc;
}

function assertWritable(doc: LobbyStateDocument): void {
  if (doc.v > 1) throw new Error(`Lobby state version ${doc.v} is newer than supported version 1.`);
  if (doc.v !== 1) throw new Error(`Unsupported lobby state version ${doc.v}.`);
}

function finish(before: LobbyStateDocument, next: LobbyStateDocument): LobbyStateOperation {
  assertWritable(before);
  assertDocumentSize(next);
  return { doc: next, changed: !equal(before, next) };
}

export function applyMatchPatch(input: LobbyStateDocument, patch: unknown): LobbyStateOperation {
  assertWritable(input);
  if (!isPlainObject(patch)) throw new Error("Match patch must be a plain object.");
  for (const key of Object.keys(patch)) if (!MATCH_KEYS.has(key)) throw new Error(`Unknown match field: ${key}.`);
  const next = clone(input);
  for (const [key, value] of Object.entries(patch)) {
    if (["teamRed", "teamBlue"].includes(key)) {
      if (typeof value !== "string" || value.length > 100) throw new Error(`${key} must be a string of at most 100 characters.`);
    } else if (["teamRedScore", "teamBlueScore"].includes(key)) {
      if (!Number.isInteger(value) || (value as number) < 0 || (value as number) > 99) throw new Error(`${key} must be an integer from 0 to 99.`);
    } else if (key === "bestOf") {
      if (value !== null && (!Number.isInteger(value) || (value as number) < 1 || (value as number) > 99)) throw new Error("bestOf must be null or an integer from 1 to 99.");
    } else if (key === "nextPickTeam") {
      if (value !== null && (typeof value !== "string" || value.length > 100)) throw new Error("nextPickTeam must be null or a string of at most 100 characters.");
    } else if (key === "lastPlay") {
      if (value !== null && (!isPlainObject(value) || jsonBytes(value) > 1024)) throw new Error("lastPlay must be null or a plain object up to 1 KB serialized.");
    }
    (next.match as Record<string, unknown>)[key] = clone(value);
  }
  return finish(input, next);
}

export function replaceMatch(input: LobbyStateDocument, match: unknown): LobbyStateOperation {
  if (!isPlainObject(match)) throw new Error("Match must be a plain object.");
  applyMatchPatch(input, match);
  const next = clone(input);
  next.match = clone(match) as LobbyMatch;
  assertDocumentSize(next);
  return { doc: next, changed: !equal(input, next) };
}

export function setMapSlot(input: LobbyStateDocument, slot: unknown, patch: unknown): LobbyStateOperation {
  assertWritable(input);
  if (typeof slot !== "string" || slot.length === 0 || slot.length > 64) throw new Error("slot must be a non-empty string of at most 64 characters.");
  if (!isPlainObject(patch) || jsonBytes(patch) > 2048) throw new Error("slot patch must be a plain JSON object up to 2 KB serialized.");
  const next = clone(input);
  next.maps.slots[slot] = { ...(next.maps.slots[slot] ?? {}), ...clone(patch) };
  return finish(input, next);
}

export function clearMapStates(input: LobbyStateDocument): LobbyStateOperation {
  assertWritable(input);
  const next = clone(input);
  next.maps.slots = {};
  return finish(input, next);
}

export function setActivePool(input: LobbyStateDocument, poolId: unknown): LobbyStateOperation {
  assertWritable(input);
  if (poolId !== null && (typeof poolId !== "string" || poolId.length > 128)) throw new Error("poolId must be null or a string of at most 128 characters.");
  const next = clone(input);
  next.maps.activePoolId = poolId as string | null;
  return finish(input, next);
}

export function setQualificationMode(input: LobbyStateDocument, enabled: unknown): LobbyStateOperation {
  assertWritable(input);
  if (typeof enabled !== "boolean") throw new Error("enabled must be a boolean.");
  const next = clone(input);
  next.maps.qualificationMode = enabled;
  return finish(input, next);
}

export function importMaps(input: LobbyStateDocument, maps: unknown): LobbyStateOperation {
  assertWritable(input);
  if (!isPlainObject(maps)) throw new Error("maps must be a plain object.");
  const next = clone(input);
  next.maps = { ...next.maps, ...(maps as Partial<LobbyMaps>), slots: isPlainObject((maps as Record<string, unknown>).slots) ? clone((maps as Record<string, unknown>).slots) as Record<string, Record<string, unknown>> : next.maps.slots };
  return finish(input, next);
}

export function isMapsEmpty(maps: LobbyMaps): boolean {
  return Object.keys(maps.slots).length === 0 && maps.activePoolId === null && maps.qualificationMode === false;
}
