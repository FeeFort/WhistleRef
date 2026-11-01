import type { Team } from "./bancho-bot.js";

export interface PlayerMapResult {
  userId: number;
  username: string;
  team: Team;
  score: number;
  accuracy: number; // percentage (0..100), rounded to two decimal places
  combo: number;
  misses: number;
  count300: number; // count_300 + count_geki
  count100: number; // count_100 + count_katu
  count50: number;
  mods: string[];
  passed: boolean;
  rank: string;
}

export type TeamMapResult = {
  score: number;
  misses: number;
  count300: number;
  count100: number;
  count50: number;
  accuracy: number[];
  combo: number[];
  players: PlayerMapResult[];
} & Record<`player${number}`, PlayerMapResult>;

export interface MapResult {
  matchId: number;
  gameId: number;
  beatmapId: number;
  mode: string;
  mods: string[];
  startTime: string;
  endTime: string | null;
  teamRed: TeamMapResult;
  teamBlue: TeamMapResult;
}

export interface RawMatchUser {
  id: number;
  username: string;
}

export interface RawMatchScore {
  user_id: number;
  score: number;
  accuracy: number;
  max_combo: number;
  mods: string[];
  passed: boolean;
  rank: string;
  statistics?: { count_300?: number; count_100?: number; count_50?: number; count_miss?: number; count_geki?: number; count_katu?: number };
  match?: { team?: Team; slot?: number; pass?: boolean };
}

export interface RawMatchGame {
  id: number;
  beatmap_id: number;
  mode: string;
  mods: string[];
  start_time: string;
  end_time: string | null;
  scores: RawMatchScore[];
}

export interface RawMatchEvent {
  game?: RawMatchGame;
}

export interface RawMatchResponse {
  match: { id: number };
  events: RawMatchEvent[];
  users: RawMatchUser[];
}

export type WinConditionWinner = "red" | "blue" | "tie";

export interface WinConditionContext {
  redScore: number;
  blueScore: number;
  redCombo: number;
  blueCombo: number;
  redAccuracy: number;
  blueAccuracy: number;
  redMisses: number;
  blueMisses: number;
  players?: unknown[];
  matchId?: number;
  [key: string]: unknown;
}

export interface WinConditionOutcome {
  winner: WinConditionWinner;
  error: string | null;
  systemMessages: string[];
  result: { beatmapWinner: WinConditionWinner; beatmapTeamRedScore: number; beatmapTeamBlueScore: number; scoreDifference: number } | null;
}

// SignalR API types
