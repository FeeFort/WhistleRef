import { logger } from "../logger/logger.js";
import { getAccessToken } from "../auth/auth.js";
import { fetchApi } from "../osu-api/osuApiClient.js";
import { parseLastMapResult } from "./matchResultParser.js";
import type { MapResult, RawMatchResponse } from "../types/index.js";

const log = logger.child("stable", "matchResult");

export async function fetchLastMapResult(matchId: number): Promise<MapResult | null> {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    log.trace("Fetching match result", { matchId, attempt: attempt + 1 });
    try {
      const response = (await fetchApi(await getAccessToken(), `/matches/${matchId}`)) as RawMatchResponse;
      const result = parseLastMapResult(response);
      log.trace(result ? "Match result parsed" : "No completed map result", { matchId });
      return result;
    } catch (error) {
      log.trace("Match result fetch failed", { matchId, attempt: attempt + 1, error });
      if (attempt < 2) {
        log.trace("Match result retry scheduled", { matchId, delayMs: 1000 });
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }
    }
  }
  return null;
}
