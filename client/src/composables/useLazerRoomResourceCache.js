import { reactive } from "vue";

const STORAGE_KEY = "whistleref-lazer-room-resource-cache-v1";
const inFlight = new Map();

function readCache() {
  try {
    const cached = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
    return cached && typeof cached === "object" && !Array.isArray(cached) ? cached : {};
  } catch {
    return {};
  }
}

const rooms = reactive(readCache());

function persist() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(rooms));
  } catch {
    // A full or unavailable storage must not prevent room data from loading.
  }
}

function roomCache(roomId, create = true) {
  const id = Number(roomId);
  if (!Number.isInteger(id) || id <= 0) return null;
  if (!rooms[id] && create) rooms[id] = { profiles: {}, beatmaps: {} };
  return rooms[id] || null;
}

function validId(value) {
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
}

function schedule(key, task) {
  if (inFlight.has(key)) return inFlight.get(key);
  const run = Promise.resolve().then(task);
  inFlight.set(key, run);
  return run.finally(() => inFlight.delete(key));
}

export function getLazerCachedProfile(roomId, userId) {
  const id = validId(userId);
  return id ? roomCache(roomId, false)?.profiles?.[id] || null : null;
}

export async function loadLazerCachedProfile(roomId, userId, requestApi) {
  const room = roomCache(roomId);
  const id = validId(userId);
  if (!room || !id) return null;
  if (room.profiles?.[id]) return room.profiles[id];
  const profile = await schedule(`profile:${roomId}:${id}`, async () => {
    const response = await requestApi(`/users/${id}`);
    const value = {
      userId: id,
      username: String(response?.username || response?.name || "").trim(),
      avatarUrl: String(response?.avatar_url || response?.avatarUrl || "").trim(),
      profileUrl: `https://osu.ppy.sh/users/${id}`,
    };
    room.profiles[id] = value;
    persist();
    return value;
  });
  return profile;
}

export async function loadLazerCachedProfileByUsername(roomId, username, requestApi) {
  const room = roomCache(roomId);
  const normalized = String(username || "")
    .trim()
    .replace(/^@+/, "");
  if (!room || !normalized) return null;
  const cached = Object.values(room.profiles || {}).find((profile) => String(profile?.username || "").toLowerCase() === normalized.toLowerCase());
  if (cached) return cached;
  const cacheKey = normalized.toLowerCase();
  return schedule(`profile-name:${roomId}:${cacheKey}`, async () => {
    const response = await requestApi(`/users/@${encodeURIComponent(normalized)}`);
    const id = validId(response?.id ?? response?.user_id);
    if (!id) return null;
    const value = {
      userId: id,
      username: String(response?.username || response?.name || normalized).trim(),
      avatarUrl: String(response?.avatar_url || response?.avatarUrl || "").trim(),
      profileUrl: `https://osu.ppy.sh/users/${id}`,
    };
    room.profiles[id] = value;
    persist();
    return value;
  });
}

export function getLazerCachedBeatmap(roomId, beatmapId) {
  const id = validId(beatmapId);
  return id ? roomCache(roomId, false)?.beatmaps?.[id] || null : null;
}

export async function loadLazerCachedBeatmap(roomId, beatmapId, requestApi) {
  const room = roomCache(roomId);
  const id = validId(beatmapId);
  if (!room || !id) return null;
  if (room.beatmaps?.[id]) return room.beatmaps[id];
  const beatmap = await schedule(`beatmap:${roomId}:${id}`, async () => {
    const info = await requestApi(`/beatmaps/${id}`);
    const value = {
      beatmapId: id,
      artist: info?.artist || info?.beatmapset?.artist || "Unknown artist",
      title: info?.title || info?.beatmapset?.title || "Unknown title",
      diff: info?.version || "",
      beatmapsetId: info?.beatmapset_id || info?.beatmapset?.id || null,
      mapperName: typeof info?.creator === "string" ? info.creator : info?.creator?.username || "",
      starRating: info?.difficulty_rating ?? null,
      totalSeconds: info?.total_length ?? null,
      rulesetId: info?.mode_int ?? info?.ruleset_id ?? null,
    };
    room.beatmaps[id] = value;
    persist();
    return value;
  });
  return beatmap;
}

export function clearLazerRoomResourceCache(roomId) {
  const id = validId(roomId);
  if (!id || !rooms[id]) return;
  delete rooms[id];
  persist();
}
