import { MapResult, PlayerMapResult, RawMatchGame, RawMatchResponse, RawMatchScore, Team, TeamMapResult } from "../types/index.js";

function buildTeam(scores: RawMatchScore[], team: Team, usernameById: Map<number, string>): TeamMapResult {
  const players: PlayerMapResult[] = scores
    .filter((score) => score.match?.team === team)
    .map((score) => ({
      userId: score.user_id,
      username: usernameById.get(score.user_id) ?? `User ${score.user_id}`,
      team,
      score: Number(score.score) || 0,
      accuracy: Math.round((Number(score.accuracy) || 0) * 10000) / 100,
      combo: Number(score.max_combo) || 0,
      misses: Number(score.statistics?.count_miss) || 0,
      count300: (Number(score.statistics?.count_300) || 0) + (Number(score.statistics?.count_geki) || 0),
      count100: (Number(score.statistics?.count_100) || 0) + (Number(score.statistics?.count_katu) || 0),
      count50: Number(score.statistics?.count_50) || 0,
      mods: Array.isArray(score.mods) ? score.mods : [],
      passed: Boolean(score.passed),
      rank: score.rank ?? "",
    }));

  const result = {
    score: players.reduce((sum, player) => sum + player.score, 0),
    misses: players.reduce((sum, player) => sum + player.misses, 0),
    count300: players.reduce((sum, player) => sum + player.count300, 0),
    count100: players.reduce((sum, player) => sum + player.count100, 0),
    count50: players.reduce((sum, player) => sum + player.count50, 0),
    accuracy: players.map((player) => player.accuracy),
    combo: players.map((player) => player.combo),
    players,
  } as TeamMapResult;
  players.forEach((player, index) => {
    (result as Record<string, PlayerMapResult>)[`player${index + 1}`] = player;
  });
  return result;
}

// Skip aborted maps as they have no scores in array
export function parseLastMapResult(response: RawMatchResponse): MapResult | null {
  const games = (response.events ?? []).map((event) => event.game).filter((game): game is RawMatchGame => Boolean(game) && Array.isArray(game!.scores) && game!.scores.length > 0);
  const game = games[games.length - 1];
  if (!game) return null;

  const usernameById = new Map((response.users ?? []).map((user) => [user.id, user.username]));

  return {
    matchId: response.match.id,
    gameId: game.id,
    beatmapId: game.beatmap_id,
    mode: game.mode,
    mods: Array.isArray(game.mods) ? game.mods : [],
    startTime: game.start_time,
    endTime: game.end_time,
    teamRed: buildTeam(game.scores, "red", usernameById),
    teamBlue: buildTeam(game.scores, "blue", usernameById),
  };
}
