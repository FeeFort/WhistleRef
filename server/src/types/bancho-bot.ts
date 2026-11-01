// BanchoBot parser types
export type TeamMode = "HeadToHead" | "TagCoop" | "TeamVs" | "TagTeamVs";
export type ScoreMode = "Score" | "Accuracy" | "Combo" | "ScoreV2";
export type GameMode = "osu!" | "osu!taiko" | "osu!catch" | "osu!mania";

export type RoomInfo = { name: string; qualifiers: boolean } | { name: string; qualifiers: boolean; teamRed: string; teamBlue: string };

export type TeamSettings = {
  teamMode: TeamMode;
  scoreMode: ScoreMode;
  size?: number;
};

export type BeatmapInfo = {
  id: number;
  beatmapId: number;
  url: string;
  title: string | null;
};

export type ActiveMods = { activeMods: string | null };

export type PlayerSnapshot = {
  username: string;
  profileUrl: string;
  userId: number | null;
  avatarUrl: string | null;
  slot: number;
  ready: boolean;
  noMap: boolean;
  isHost?: true;
  team: "red" | "blue" | null;
  mods: string[];
};

export type PlayerJoined = { username: string; slot: number; team: Team | null; mods: string[] };
export type PlayerLeft = { username: string };
export type PlayerTeamChange = { username: string; team: Team };
export type PlayerSlotChange = { username: string; slot: number };
export type PlayerScore = { username: string; score: number; result: string };
export type HostChange = { host: string | null };
export type MatchFinished = { finished: true };
export type MatchMetadata = { bestOf: number } | { nextPickTeam: string };
export type SizeConfirmation = { size: number };
export type SlotLockState = { slot: number; locked: boolean };
export type TimerMessage = { type: "aborted" } | { type: "finished" } | { type: "started"; seconds: number };
export type MpSetCommand = { teamMode: TeamMode; scoreMode: ScoreMode; size: number };
export type MpSizeCommand = { size: number };

export type ParsedBanchoBotMessage =
  | { type: "room"; value: RoomInfo }
  | { type: "settings"; value: TeamSettings }
  | { type: "beatmap"; value: { currentBeatmap: BeatmapInfo } }
  | { type: "mods"; value: ActiveMods }
  | { type: "player"; value: PlayerSnapshot }
  | { type: "player_joined"; value: PlayerJoined }
  | { type: "player_left"; value: PlayerLeft }
  | { type: "player_moved"; value: PlayerSlotChange }
  | { type: "player_team_changed"; value: PlayerTeamChange }
  | { type: "player_score"; value: PlayerScore }
  | { type: "host"; value: HostChange }
  | { type: "match_finished"; value: MatchFinished }
  | { type: "metadata"; value: MatchMetadata }
  | { type: "size"; value: SizeConfirmation }
  | { type: "slot_lock"; value: SlotLockState }
  | { type: "timer"; value: TimerMessage }
  | { type: "mode"; value: GameMode }
  | null;

export type ParsedLobbyCommand = { type: "settings"; value: MpSetCommand } | { type: "size"; value: MpSizeCommand } | null;

//Server data types
export type Team = "red" | "blue";

export type Player = {
  username: string;
  profileUrl: string | null;
  userId: number | null;
  avatarUrl: string | null;
  slot: number;
  ready: boolean;
  noMap: boolean;
  isHost: boolean;
  team: Team | null;
  mods: string[];
};

export type LastPlay = {
  teamRedScore: number | null;
  teamBlueScore: number | null;
  scoreDifference: number | null;
  winnerTeam: Team | null;
};

export type Timer = {
  active: boolean;
  endsAt: number | null;
};

export type LobbyState = {
  id: number | null;
  name: string;
  qualifiers: boolean;
  teamRed: string;
  teamBlue: string;
  teamRedScore: number;
  teamBlueScore: number;
  bestOf: number | null;
  nextPickTeam: string | null;
  matchStatus: string | null;
  teamRedPlayers: string[];
  teamBluePlayers: string[];
  lastPlay: LastPlay;
  players: Player[];
  currentBeatmap: BeatmapInfo | null;
  activeMods: string | null;
  host: string | null;
  teamMode: TeamMode;
  scoreMode: ScoreMode;
  mode: GameMode;
  slots: (string | null)[];
  slotLocks: boolean[];
  size: number;
  timer: Timer;
  status: "active" | "closed";
};
