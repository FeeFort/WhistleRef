<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref, watch } from "vue";
import Button from "primevue/button";
import ColorPicker from "primevue/colorpicker";
import InputText from "primevue/inputtext";
import Popover from "primevue/popover";
import SelectButton from "primevue/selectbutton";
import Toast from "primevue/toast";
import ToggleSwitch from "primevue/toggleswitch";
import { useToast } from "primevue/usetoast";
import { ArrowLeft, Check, ChevronDown, CircleX, DoorOpen, Map as MapIcon, Play, RotateCcw, Settings2, Sparkles } from "@lucide/vue";
import ChatWindow from "./components/stable/ChatWindow.vue";
import LazerChatWindow from "./components/lazer/ChatWindow.vue";
import LazerPlayerListCard from "./components/lazer/PlayerListCard.vue";
import LazerPlayersDialog from "./components/lazer/PlayersDialog.vue";
import LazerRefereesDialog from "./components/lazer/RefereesDialog.vue";
import LazerLobbyScoreCard from "./components/lazer/LobbyScoreCard.vue";
import LazerMappoolCard from "./components/lazer/MappoolCard.vue";
import AddChannelDialog from "./components/AddChannelDialog.vue";
import CreateLobbyDialog from "./components/CreateLobbyDialog.vue";
import LoginPage from "./components/LoginPage.vue";
import LobbyScoreCard from "./components/stable/LobbyScoreCard.vue";
import LobbyMessagesSettings from "./components/LobbyMessagesSettings.vue";
import MappoolCard from "./components/stable/MappoolCard.vue";
import PlayerListCard from "./components/stable/PlayerListCard.vue";
import PlayersDialog from "./components/stable/PlayersDialog.vue";
import RefereesDialog from "./components/stable/RefereesDialog.vue";
import LobbySetupDialog from "./components/stable/LobbySetupDialog.vue";
import LazerLobbySetupDialog from "./components/lazer/LobbySetupDialog.vue";
import AppSidebar from "./components/AppSidebar.vue";
import SidebarSectionCard from "./components/SidebarSectionCard.vue";
import SettingsModal from "./components/SettingsModal.vue";
import ShortcutImportExportSettings from "./components/ShortcutImportExportSettings.vue";
import UpdateDialog from "./components/UpdateDialog.vue";
import { DEFAULT_PRIMARY_COLOR, useDarkMode } from "./composables/useDarkMode";
import { DEFAULT_CHAT_SETTINGS, useChatSettings } from "./composables/useChatSettings";
import {
  HIGHLIGHT_STYLE_OPTIONS,
  escapeRegExp,
  highlightTextStyle,
  messageHasHighlight,
  normalizeTeamHighlights,
  normalizeHighlightStyles,
  normalizeHighlightWords,
  teamTextStyle,
} from "./composables/useMessageHighlighting";
import { useNickColor } from "./composables/useNickColor";
import { clearRememberedCredentials, loadRememberedCredentials, loadOsuAuthData, saveRememberedCredentials, saveOsuAuthData } from "./composables/useRememberedCredentials";
import { getOsuRedirectUri, readOsuAuthorizationCallback, startOsuAuthorization } from "./composables/useOsuOAuth";
import { useServerConnection } from "./composables/useServerConnection";
import { formatBeatmapOwners } from "./composables/useBeatmapAuthors";
import { clearLazerRoomResourceCache, getLazerCachedProfile, loadLazerCachedBeatmap, loadLazerCachedProfile, loadLazerCachedProfileByUsername } from "./composables/useLazerRoomResourceCache";
import { formatLobbyTemplate, useLobbyMessages } from "./composables/useLobbyMessages";
import { sortMappoolSlots, useMappool } from "./composables/useMappool";
import { advanceMappoolChatContext, createMappoolChatContext } from "./composables/useMappoolChat";
import { useNowPlayingSettings } from "./composables/useNowPlayingSettings";
import { NOTIFICATION_SOUNDS, NOTIFICATION_TRIGGER_OPTIONS, getNotificationSoundUrl, useNotifications } from "./composables/useNotifications";
import modsByRuleset from "./assets/mods/mods.json";

const commandScrollToken = ref(0);
const savedLogin = localStorage.getItem("whistleref-remembered-login") || "";
const currentUser = ref("");
const refereeUser = computed(() => currentUser.value);
const isAuthenticated = ref(false);
const authLoading = ref(true);
const loginLoading = ref(false);
const osuLoading = ref(false);
const osuError = ref("");
const osuClientId = ref("");
const osuClientSecret = ref("");
const osuProfile = ref(null);
const sidebarOpen = ref(true);
const settingsOpen = ref(false);
const updateDialogVisible = ref(false);
const updateDialogMode = ref("available");
const updateInfo = ref({ currentVersion: "", latestVersion: "", releaseNotesUrl: "" });
const updateDownloadedBytes = ref(0);
const updateTotalBytes = ref(0);
const updateSpeedBytesPerSecond = ref(0);
const UPDATE_SPEED_WINDOW_MS = 2000;
let updateSpeedSamples = [];
const lobbyMessagesSettingsOpen = ref(false);
const createLobbyDialogOpen = ref(false);
const addChannelDialogOpen = ref(false);
const playersDialogOpen = ref(false);
const lobbySetupDialogOpen = ref(false);
const lazerLobbySetupLoading = ref(false);
const pendingLazerLobbySettings = ref(null);
const lobbySetupUntouched = computed(() => {
  const lobby = activeLobbyState.value;
  return !lobby || (lobby.teamMode === "HeadToHead" && lobby.scoreMode === "Score");
});
const lobbySetupGameMode = computed(() => (lobbySetupUntouched.value ? 2 : ({ HeadToHead: 0, "Tag co-op": 1, "Team VS": 2, "Tag-team VS": 3 }[activeLobbyState.value?.teamMode] ?? 2)));
const lobbySetupWinCondition = computed(() => (lobbySetupUntouched.value ? 3 : ({ Score: 0, Accuracy: 1, Combo: 2, "Score V2": 3 }[activeLobbyState.value?.scoreMode] ?? 3)));
const lobbySetupOpenSlots = computed(() => Math.max(0, Math.min(16, Number(activeLobbyState.value?.size ?? 16))));
const activeChat = ref("bancho");
const unreadChats = reactive({ bancho: false });
const directChats = ref([]);
const joinedChannels = ref([]);
const lobbyStates = reactive({});
const lazerRooms = reactive({});
const lazerLobbyStates = reactive({});
const lazerCountdowns = reactive({});
const lazerMatchStartCountdowns = reactive({});
const lazerMatchPlaylistItems = reactive({});
const lazerMatchTeams = new Map();
const pendingLazerMappoolSlots = new Map();
const lazerMatchMappoolSlots = new Map();
const lazerCompletedBeatmaps = reactive({});
const lazerConnectionState = ref("disconnected");
const lazerSyncState = ref("idle");
const channelMessages = reactive({});
const pendingLazerMessages = [];
const lazerCountdownTimeouts = new Map();
const lobbyContexts = reactive({});
const pendingPartChannels = new Set();
const pendingLobbySeed = ref(null);
const pendingLobbyCreatedViaApp = ref(false);
const pendingLazerLobbySeed = ref(null);
const pendingJoinChannel = ref(null);
const lazerPlayersDialogOpen = ref(false);
const lazerRefereesDialogOpen = ref(false);
const refereesDialogOpen = ref(false);
const lazerChatRoomsBeingLoaded = new Set();
const pendingLazerInviteJoins = new Set();
let pendingJoinTimeout;
const { primaryColor, setPrimaryColor } = useDarkMode();
const {
  highlightReferee,
  highlightBanchoBot,
  highlightTeams,
  banchoBotColor,
  redTeamColor,
  blueTeamColor,
  unassignedColorMode,
  unassignedColor,
  timestampMode,
  highlightWords,
  highlightStyles,
  highlightColorMode,
  highlightColor,
  fullSlots,
} = useChatSettings();
const { nickColor: baseNickColor } = useNickColor();
const {
  state: serverState,
  lastEvent,
  login: loginToServer,
  logout: logoutFromServer,
  loginOsu,
  logoutOsu,
  sendMessage: sendServerMessage,
  joinChannel: joinServerChannel,
  partChannel: partServerChannel,
  setLobbyScore,
  setLobbySettings,
  refreshLobbyTitle,
  setActiveWinCondition,
  makeLazerRoom,
  joinLazerRoom,
  addLazerPlaylistItem,
  editLazerCurrentPlaylistItem,
  sendLazerChatMessage,
  rollLazer,
  leaveLazerRoom,
  changeLazerRoomSettings,
  loadLazerChat,
  addLazerReferee,
  removeLazerReferee,
  stopLazerMatchCountdown,
  sendLazerCommand,
  requestApi,
  checkUpdate,
  startUpdate,
  cancelUpdate,
  confirmInstall,
} = useServerConnection();
const connected = computed(() => serverState.value === "ready");
const toast = useToast();
const loginToastGroup = "irc-login";
const launchedAfterUpdate = new URLSearchParams(window.location.search).has("updated");
const { activePreset } = useLobbyMessages();
const { getActivePool, getMapState, setMapState, getQualificationMode, hasQualificationMode, setQualificationMode } = useMappool();
const { getActivePool: getLazerActivePool, getMapState: getLazerMapState, setMapState: setLazerMapState } = useMappool("lazer");
const { soundEnabled, toastEnabled, ignoreBanchoBot, sound, soundTrigger, toastTrigger } = useNotifications();
const { showNowPlaying, showProgressBar, showProgressTimeLabel } = useNowPlayingSettings();
const nowPlayingByLobby = reactive({});
const lazerNowPlayingFinishedTimeouts = new Map();
const PLAYER_PROFILE_CACHE_KEY = "whistleref-lobby-player-profiles";
const primaryColorDraft = ref(primaryColor.value);
const banchoBotColorDraft = ref(banchoBotColor.value);
const redTeamColorDraft = ref(redTeamColor.value);
const blueTeamColorDraft = ref(blueTeamColor.value);
const unassignedColorDraft = ref(unassignedColor.value);
const highlightColorDraft = ref(highlightColor.value);
const highlightStylesPopover = ref(null);
const highlightWordsInputRef = ref(null);
const highlightWordsInputDraft = ref("");
function readPlayerProfileCache() {
  try {
    const value = JSON.parse(localStorage.getItem(PLAYER_PROFILE_CACHE_KEY) || "{}");
    return value && typeof value === "object" ? value : {};
  } catch {
    return {};
  }
}
const playerProfilesByLobbyId = reactive(readPlayerProfileCache());
const lazerUserProfiles = reactive({});
const lazerStyleBeatmaps = reactive({});
const pendingLazerUserProfiles = new Set();
const pendingLazerStyleBeatmaps = new Set();
const lazerStyleChangedUsers = reactive({});
const pendingLazerPlaylistRestores = new Map();
const pendingLazerLegacyCommands = new Map();
let lazerLegacySequence = 0;
const lazerSinglePlaylistMatches = new Map();

function cacheLobbyPlayers(chatId, players) {
  if (!chatId || !Array.isArray(players)) return;
  const profiles = (playerProfilesByLobbyId[chatId] ||= {});
  let changed = false;
  for (const player of players) {
    const username = String(player.username || "").trim();
    if (!username || player.isSlot) continue;
    const key = normalizeIrcNick(username);
    const previous = profiles[key] || {};
    const next = {
      username,
      userId: player.userId ?? previous.userId ?? null,
      profileUrl: player.profileUrl || previous.profileUrl || "",
      avatarUrl: player.avatarUrl || previous.avatarUrl || "",
    };
    if (JSON.stringify(previous) !== JSON.stringify(next)) {
      profiles[key] = next;
      changed = true;
    }
  }
  if (changed) localStorage.setItem(PLAYER_PROFILE_CACHE_KEY, JSON.stringify(playerProfilesByLobbyId));
}

function clearCachedLobbyProfiles(chatId) {
  if (!chatId || !playerProfilesByLobbyId[chatId]) return;
  delete playerProfilesByLobbyId[chatId];
  localStorage.setItem(PLAYER_PROFILE_CACHE_KEY, JSON.stringify(playerProfilesByLobbyId));
}
const highlightStyleLabelMap = Object.fromEntries(HIGHLIGHT_STYLE_OPTIONS.map((option) => [option.value, option.label]));

const unassignedColorModes = [
  { label: "Random", value: "random" },
  { label: "Custom", value: "custom" },
];
const highlightColorModes = [
  { label: "Default (White)", value: "default" },
  { label: "Accent color", value: "accent" },
  { label: "Custom", value: "custom" },
];
const timestampModes = [
  { label: "Minutes", value: "minutes" },
  { label: "Full", value: "full" },
];
const notificationSounds = NOTIFICATION_SOUNDS;
const notificationTriggers = NOTIFICATION_TRIGGER_OPTIONS;
const notificationSoundMenuOpen = ref(false);
const notificationSoundMenu = ref(null);
const selectedNotificationSound = computed(() => notificationSounds.find((item) => item.value === sound.value) || notificationSounds[0]);
let notificationAudio;
let pendingNotificationSound;

const chatPreviewMessages = [
  {
    id: 1,
    time: "12:04:18",
    author: "red_player",
    team: "red",
    text: "Ready for the match.",
  },
  {
    id: 2,
    time: "12:04:24",
    author: "blue_player",
    team: "blue",
    text: "Good luck, have fun!",
  },
  {
    id: 3,
    time: "12:04:31",
    author: "referee",
    role: "referee",
    text: "Starting in a moment.",
  },
  {
    id: 4,
    time: "12:04:36",
    author: "solo_player",
    text: "All set here.",
  },
  {
    id: 5,
    time: "12:05:02",
    author: "BanchoBot",
    text: "Match settings synced.",
  },
  {
    id: 6,
    time: "12:05:08",
    author: "solo_player",
    text: "This is a highlighted message!",
    highlightPreview: true,
  },
  {
    id: 7,
    time: "12:05:14",
    author: "referee",
    role: "referee",
    text: "Team Red and Team Blue are ready to start.",
  },
];

const previewTeams = computed(() =>
  normalizeTeamHighlights([
    { name: "Team Red", color: redTeamColor.value },
    { name: "Team Blue", color: blueTeamColor.value },
  ]),
);

function previewTeamSegments(text) {
  if (!highlightTeams.value) return [{ type: "text", value: text }];
  const pattern = previewTeams.value.map((team) => escapeRegExp(team.name)).join("|");
  if (!pattern) return [{ type: "text", value: text }];
  const result = [];
  let lastIndex = 0;
  for (const match of String(text).matchAll(new RegExp(`(^|[^\\p{L}\\p{N}_])(${pattern})(?=$|[^\\p{L}\\p{N}_])`, "giu"))) {
    const start = match.index ?? 0;
    const prefix = match[1] || "";
    const nameStart = start + prefix.length;
    if (start > lastIndex) result.push({ type: "text", value: text.slice(lastIndex, start) });
    if (prefix) result.push({ type: "text", value: prefix });
    const team = previewTeams.value.find((item) => item.name.toLowerCase() === match[2].toLowerCase());
    result.push({ type: "team", value: match[2], color: team?.color });
    lastIndex = nameStart + match[2].length;
  }
  if (lastIndex < text.length) result.push({ type: "text", value: text.slice(lastIndex) });
  return result.length ? result : [{ type: "text", value: text }];
}

const highlightWordsDraft = computed({
  get: () => highlightWords.value,
  set: (value) => {
    highlightWords.value = normalizeHighlightWords(value);
  },
});

const highlightStylesDraft = computed({
  get: () => highlightStyles.value,
  set: (value) => {
    highlightStyles.value = normalizeHighlightStyles(value);
  },
});

const highlightStylesSummary = computed(() => {
  if (!highlightStyles.value.length) return "No styles";
  return highlightStyles.value.map((style) => highlightStyleLabelMap[style] || style).join(", ");
});

const primaryColorPicker = computed({
  get: () => primaryColor.value.replace("#", ""),
  set: (value) => {
    const normalized = `#${String(value).replace("#", "")}`;
    if (/^#[0-9a-f]{6}$/i.test(normalized)) setPrimaryColor(normalized);
  },
});

function normalizeOsuUser(user) {
  if (!user) return null;
  return {
    id: user.id ?? null,
    username: user.username || user.name || "",
    avatarUrl: user.avatarUrl || user.avatar || "",
  };
}

const primaryColorChanged = computed(() => primaryColor.value.toLowerCase() !== DEFAULT_PRIMARY_COLOR);

const redTeamColorPicker = computed({
  get: () => redTeamColor.value.replace("#", ""),
  set: (value) => updateChatColor(redTeamColor, value),
});

const banchoBotColorPicker = computed({
  get: () => banchoBotColor.value.replace("#", ""),
  set: (value) => updateChatColor(banchoBotColor, value),
});

const blueTeamColorPicker = computed({
  get: () => blueTeamColor.value.replace("#", ""),
  set: (value) => updateChatColor(blueTeamColor, value),
});

const unassignedColorPicker = computed({
  get: () => unassignedColor.value.replace("#", ""),
  set: (value) => updateChatColor(unassignedColor, value),
});

const highlightColorPicker = computed({
  get: () => highlightColor.value.replace("#", ""),
  set: (value) => updateChatColor(highlightColor, value),
});

const chatSettingChanged = computed(() => ({
  banchoBotColor: banchoBotColor.value.toLowerCase() !== DEFAULT_CHAT_SETTINGS.banchoBotColor,
  redTeamColor: redTeamColor.value.toLowerCase() !== DEFAULT_CHAT_SETTINGS.redTeamColor,
  blueTeamColor: blueTeamColor.value.toLowerCase() !== DEFAULT_CHAT_SETTINGS.blueTeamColor,
  unassignedColor: unassignedColor.value.toLowerCase() !== DEFAULT_CHAT_SETTINGS.unassignedColor,
  highlightWords: JSON.stringify(normalizeHighlightWords(highlightWords.value)) !== JSON.stringify(DEFAULT_CHAT_SETTINGS.highlightWords),
  highlightStyles: JSON.stringify(normalizeHighlightStyles(highlightStyles.value)) !== JSON.stringify(DEFAULT_CHAT_SETTINGS.highlightStyles),
  highlightColor: highlightColorMode.value !== DEFAULT_CHAT_SETTINGS.highlightColorMode || highlightColor.value.toLowerCase() !== DEFAULT_CHAT_SETTINGS.highlightColor,
}));

watch(
  lastEvent,
  (event) => {
    if (handleLazerError(event)) return;

    const legacyCommand = event?.requestId ? pendingLazerLegacyCommands.get(event.requestId) : null;
    if (legacyCommand && ((event.type === "ack" && event.received === legacyCommand.type) || (event.type === "error" && event.request === legacyCommand.type))) {
      pendingLazerLegacyCommands.delete(event.requestId);
      if (legacyCommand.timeoutId) window.clearTimeout(legacyCommand.timeoutId);
      appendWhistleBotMessage(legacyCommand.roomId, event.type === "ack" ? legacyCommand.success : legacyCommand.failure);
      return;
    }

    if (event?.type === "lazer_chat_history") {
      appendLazerChatHistory(event.roomId, event.messages, event.users);
      return;
    }

    if (event?.type === "ack" && event.received === "lazer_send_chat_message") {
      const pending = pendingLazerMessages.shift();
      if (pending) {
        const message = (channelMessages[pending.chatId] || []).find((item) => item.id === pending.messageId);
        if (message) {
          message.pending = false;
          message.awaitingEcho = true;
        }
      }
      return;
    }

    if (event?.type === "lazer_chat_message") {
      appendLazerChatMessage(event.roomId, event.message, event.users, true);
      return;
    }

    const lazerEvent = event?.type === "lazer_event" ? event : null;
    const lazerEventPayload = lazerEvent?.payload || {};
    const lazerEventRoomId = Number(lazerEvent?.roomId ?? lazerEventPayload.room_id);
    const lazerEventChatId = Number.isInteger(lazerEventRoomId) && lazerEventRoomId > 0 ? lazerChatId(lazerEventRoomId) : null;

    if (event?.type === "lazer_connection_state") {
      lazerConnectionState.value = event.state || "disconnected";
      return;
    }

    if (event?.type === "lazer_sync_state") {
      lazerSyncState.value = event.state || "idle";
      return;
    }

    if (lazerEvent && lazerEventChatId) {
      const room = lazerRooms[lazerEventChatId];
      if (lazerEvent.eventType === "RefereeInvited") {
        requestLazerInviteJoin(lazerEventRoomId);
      } else if (lazerEvent.eventType === "RefereeAdded" && room) {
        const userId = Number(lazerEventPayload.user_id);
        if (Number.isInteger(userId) && userId > 0) {
          const referees = Array.isArray(room.referees) ? room.referees : [];
          if (!referees.some((referee) => Number(referee.user_id) === userId)) {
            room.referees = [...referees, { user_id: userId }];
            loadLazerUserProfile(lazerEventRoomId, userId);
            const username = lazerUserProfiles[userId]?.username || `User ${userId}`;
            toast.add({ severity: "info", summary: "Referee added", detail: `${username} is now a referee.`, life: 3500 });
          }
        }
      } else if (lazerEvent.eventType === "RefereeRemoved" && room) {
        const userId = Number(lazerEventPayload.user_id);
        if (Number.isInteger(userId) && userId > 0) {
          const referee = (room.referees || []).find((candidate) => Number(candidate.user_id) === userId);
          const username = lazerUserProfiles[userId]?.username || `User ${userId}`;
          room.referees = (room.referees || []).filter((candidate) => Number(candidate.user_id) !== userId);
          if (referee) {
            toast.add({ severity: "info", summary: "Referee removed", detail: `${username} is no longer a referee.`, life: 3500 });
          }
        }
      } else if (lazerEvent.eventType === "UserKicked" && room) {
        const kickedUserId = Number(lazerEventPayload.kicked_user_id);
        if (Number(osuProfile.value?.id) === kickedUserId) {
          pendingLazerInviteJoins.delete(lazerEventRoomId);
          markLazerRoomClosed(lazerEventChatId, {
            clearResources: true,
            systemMessage: "You're not a referee in that room anymore :(",
          });
        }
      } else if (lazerEvent.eventType === "UserStyleChanged" && room) {
        const userId = Number(lazerEventPayload.user_id);
        if (Number.isInteger(userId) && userId > 0) {
          (lazerStyleChangedUsers[lazerEventRoomId] ||= {})[userId] = true;
          loadLazerStyleBeatmap(lazerEventRoomId, lazerEventPayload.beatmap_id);
        }
      } else if (lazerEvent.eventType === "UserTeamChanged" && room) {
        const userId = Number(lazerEventPayload.user_id);
        if (Number.isInteger(userId) && userId > 0) {
          let player = (room.players || []).find((candidate) => Number(candidate.user_id) === userId);
          if (!player) {
            player = {
              user_id: userId,
              status: "idle",
              style: { ruleset_id: null, beatmap_id: null },
              mods: [],
              team: null,
            };
            room.players = [...(room.players || []), player];
          }
          player.team = lazerEventPayload.team ?? null;
        }
      } else if (lazerEvent.eventType === "PlaylistItemChanged" && room && lazerEventPayload.playlist_item) {
        // Playlist rendering is driven exclusively by the next lazer_room_state
        // snapshot. PlaylistItemChanged is only a notification and must not
        // create a local playlist copy that can drift from the server state.
      } else if (lazerEvent.eventType === "MatchStarted") {
        clearLazerNowPlayingFinished(lazerEventRoomId);
        clearLazerCountdown(lazerEventRoomId);
        clearLazerMatchStartCountdown(lazerEventRoomId);
        if (room) {
          const playlistItemId = Number(lazerEventPayload.playlist_item_id) || Number(getLazerCurrentPlaylistItem(room)?.id);
          room.current_playlist_item_id = playlistItemId;
          lazerMatchPlaylistItems[lazerEventRoomId] = playlistItemId;
          const pendingSlot = pendingLazerMappoolSlots.get(lazerEventRoomId);
          if (pendingSlot) lazerMatchMappoolSlots.set(lazerEventRoomId, pendingSlot);
          pendingLazerMappoolSlots.delete(lazerEventRoomId);
          const currentItem = room.playlist.find((item) => Number(item.id) === playlistItemId);
          const matchTeams = lazerEventPayload.teams;
          lazerMatchTeams.set(lazerEventRoomId, matchTeams && typeof matchTeams === "object" ? new Map(Object.entries(matchTeams).map(([userId, team]) => [Number(userId), team])) : new Map());
          if (currentItem && room.playlist.length === 1) lazerSinglePlaylistMatches.set(lazerEventRoomId, { ...currentItem });
          else lazerSinglePlaylistMatches.delete(lazerEventRoomId);
          syncLazerNowPlaying(room);
          const map = nowPlayingByLobby[lazerEventChatId];
          if (map) {
            map.status = "playing";
            map.startTimestamp = Date.now();
            map.progressAborted = false;
          }
        }
      } else if (lazerEvent.eventType === "MatchAborted") {
        const abortedItem = lazerSinglePlaylistMatches.get(lazerEventRoomId);
        lazerSinglePlaylistMatches.delete(lazerEventRoomId);
        if (abortedItem) {
          pendingLazerPlaylistRestores.set(lazerEventRoomId, {
            beatmap_id: abortedItem.beatmap_id,
            ruleset_id: abortedItem.ruleset_id,
            required_mods: abortedItem.required_mods,
            allowed_mods: abortedItem.allowed_mods,
            freestyle: abortedItem.freestyle,
          });
        }
        clearLazerNowPlayingFinished(lazerEventRoomId);
        clearLazerMatchStartCountdown(lazerEventRoomId);
        const map = nowPlayingByLobby[lazerEventChatId];
        if (map) {
          map.status = "waiting";
          map.progressAborted = true;
        }
      } else if (lazerEvent.eventType === "MatchCompleted") {
        const completedPlaylistItemId = Number(lazerMatchPlaylistItems[lazerEventRoomId]) || Number(getLazerCurrentPlaylistItem(room)?.id);
        const completedPlaylistItem = room?.playlist?.find((item) => Number(item.id) === completedPlaylistItemId);
        if (completedPlaylistItem?.beatmap_id) lazerCompletedBeatmaps[lazerEventRoomId] = Number(completedPlaylistItem.beatmap_id);
        if (room && Number.isInteger(completedPlaylistItemId) && completedPlaylistItemId > 0) {
          void loadLazerMatchResult(room, completedPlaylistItemId, lazerMatchTeams.get(lazerEventRoomId), lazerMatchMappoolSlots.get(lazerEventRoomId));
        }
        lazerMatchTeams.delete(lazerEventRoomId);
        lazerMatchMappoolSlots.delete(lazerEventRoomId);
        delete lazerMatchPlaylistItems[lazerEventRoomId];
        const map = nowPlayingByLobby[lazerEventChatId];
        const completedItem = lazerSinglePlaylistMatches.get(lazerEventRoomId);
        lazerSinglePlaylistMatches.delete(lazerEventRoomId);
        if (completedItem) {
          pendingLazerPlaylistRestores.set(lazerEventRoomId, {
            beatmap_id: completedItem.beatmap_id,
            ruleset_id: completedItem.ruleset_id,
            required_mods: completedItem.required_mods,
            allowed_mods: completedItem.allowed_mods,
            freestyle: completedItem.freestyle,
          });
        }
        if (map) {
          map.status = "finished";
          clearLazerNowPlayingFinished(lazerEventRoomId);
          const finishedMap = map;
          const timeoutId = window.setTimeout(() => {
            lazerNowPlayingFinishedTimeouts.delete(lazerEventRoomId);
            if (nowPlayingByLobby[lazerEventChatId] === finishedMap) syncLazerNowPlaying(room, { force: true });
          }, 2500);
          lazerNowPlayingFinishedTimeouts.set(lazerEventRoomId, timeoutId);
        }
      } else if (lazerEvent.eventType === "CountdownStarted") {
        startLazerCountdown(lazerEventRoomId, Number(lazerEventPayload.seconds), Number(lazerEventPayload.countdown_id), lazerEventPayload.type);
      } else if (lazerEvent.eventType === "CountdownStopped") {
        if (room && !pendingLazerPlaylistRestores.has(lazerEventRoomId) && room.playlist.length === 1) {
          const currentItem = getLazerCurrentPlaylistItem(room) || room.playlist[0];
          if (currentItem) queueLazerPlaylistRestore(lazerEventRoomId, currentItem);
        }
        abortLazerCountdown(lazerEventRoomId, lazerEventPayload.type);
      }
    }

    const rollEvent = lazerEvent?.eventType === "RollCompleted" ? { ...lazerEventPayload, roomId: lazerEventRoomId } : null;
    if (rollEvent) {
      const roomId = Number(rollEvent.roomId);
      const chatId = lazerChatId(roomId);
      const userId = Number(rollEvent.user_id ?? rollEvent.userId);
      const player = (lazerRooms[chatId]?.players || []).find((candidate) => Number(candidate.user_id) === userId);
      const author = lazerUserProfiles[userId]?.username || (Number(osuProfile.value?.id) === userId ? currentUser.value : player?.username) || `User ${userId}`;
      const result = Number(rollEvent.result);
      const max = Number(rollEvent.max) || 100;
      if (Number.isFinite(result)) {
        appendChatMessage(chatId, {
          id: `roll-${roomId}-${userId}-${Date.now()}`,
          type: "system",
          author: "system",
          text: `${author} rolled ${result} points out of ${max}.`,
          time: new Date().toISOString(),
          isRoll: true,
        });
      }
      return;
    }

    if (event?.type === "lazer_room_state" && event.room) {
      const invitedRoomId = Number(event.room.room_id ?? event.room.roomId ?? event.room_id ?? event.roomId);
      const refereeInvited = event.refereeInvited === true || event.referee_invited === true || event.room.refereeInvited === true || event.room.referee_invited === true;
      if (refereeInvited && Number.isInteger(invitedRoomId) && invitedRoomId > 0) {
        requestLazerInviteJoin(invitedRoomId);
        return;
      }
      const room = registerLazerRoom(event.room);
      if (room && !lazerChatRoomsBeingLoaded.has(Number(room.room_id))) {
        const roomId = Number(room.room_id);
        lazerChatRoomsBeingLoaded.add(roomId);
        if (!loadLazerChat(roomId)) lazerChatRoomsBeingLoaded.delete(roomId);
      }
      return;
    }

    if (event?.type === "lazer_room_closed") {
      const id = lazerChatId(Number(event.roomId));
      markLazerRoomClosed(id, { clearResources: true });
      lazerChatRoomsBeingLoaded.delete(Number(event.roomId));
      return;
    }

    if (event?.type === "ack" && event.received === "lazer_make_room" && event.result) {
      const room = registerLazerRoom(event.result);
      const seed = pendingLazerLobbySeed.value;
      pendingLazerLobbySeed.value = null;
      if (room && seed?.lazerSettings) {
        const requested = {
          match_type: seed.lazerSettings.match_type,
          queue_mode: seed.lazerSettings.queue_mode,
          max_participants: seed.lazerSettings.max_participants,
        };
        const roomMaxParticipants = Number(room.max_participants ?? 0);
        const requestedMaxParticipants = Number(requested.max_participants ?? 0);
        const settingsDiffer =
          (requested.match_type && room.state?.type !== requested.match_type) || (requested.queue_mode && room.queue_mode !== requested.queue_mode) || roomMaxParticipants !== requestedMaxParticipants;
        if (settingsDiffer) {
          // TODO: Remove this fallback after referee hub MakeRoom settings support is deployed.
          changeLazerRoomSettings(Number(room.room_id), requested);
        }
      }
      if (room && seed) {
        const lobby = lazerLobbyStates[room.id];
        if (lobby) {
          lobby.teamAName = seed.teamRed;
          lobby.teamBName = seed.teamBlue;
          lobby.qualificationMode = seed.qualificationMode === true;
          lobby.bestOf = Number.isInteger(seed.bestOf) && seed.bestOf > 0 ? seed.bestOf : null;
          lobby.matchStatus = getMatchStatus(
            { bestOf: lobby.bestOf, nextPickTeam: lobby.nextPickTeam, teamRedScore: lobby.teamAScore, teamBlueScore: lobby.teamBScore },
            lobby.teamAName,
            lobby.teamBName,
          );
        }
      }
      if (room) activeChat.value = room.id;
      return;
    }

    if (event?.type === "lazer_rooms" && Array.isArray(event.roomIds)) {
      const roomIds = new Set(event.roomIds.map(Number));
      for (const room of Object.values(lazerRooms)) {
        if (!roomIds.has(Number(room.room_id))) markLazerRoomClosed(room.id);
      }
      return;
    }

    if (event?.type === "ack" && event.received === "lazer_join_room" && event.result) {
      const room = registerLazerRoom(event.result);
      pendingLazerInviteJoins.delete(Number(event.result.room_id));
      if (room) {
        clearPendingJoin();
        activeChat.value = room.id;
        addChannelDialogOpen.value = false;
        showJoinToast("success", "Connected", "Successfully joined the lazer room.");
      }
      return;
    }

    if (event?.type === "ack" && event.received === "lazer_change_room_settings" && lazerLobbySetupLoading.value) {
      const pendingSettings = pendingLazerLobbySettings.value;
      const pendingRoom = pendingSettings && lazerRooms[lazerChatId(pendingSettings.roomId)];
      if (pendingRoom && Number(pendingRoom.room_id) === pendingSettings.roomId) {
        pendingRoom.max_participants = pendingSettings.maxParticipants;
        if (pendingSettings.matchType) pendingRoom.state = { ...pendingRoom.state, type: pendingSettings.matchType };
        if (pendingSettings.queueMode) pendingRoom.queue_mode = pendingSettings.queueMode;
      }
      pendingLazerLobbySettings.value = null;
      lazerLobbySetupLoading.value = false;
      lobbySetupDialogOpen.value = false;
      toast.add({
        severity: "success",
        summary: "Lobby updated",
        detail: "Lazer lobby settings applied successfully.",
        life: 3500,
      });
      return;
    }

    if (event?.type === "lobby_state") {
      applyLobbyState(event);
      return;
    }

    if (event?.type === "win_condition_result") {
      const chatId = channelId(event.channel);
      if (!chatId || !joinedChannels.value.some((channel) => channel.id === chatId)) return;
      winConditionResultsByChat[chatId] = event.result || null;
      for (const message of event.systemMessages || []) {
        appendChatMessage(chatId, {
          id: nextId++,
          type: "system",
          text: message,
        });
      }
      return;
    }

    if (event?.type === "lobby_system_message") {
      const chatId = channelId(event.channel);
      if (chatId && joinedChannels.value.some((channel) => channel.id === chatId)) {
        appendChatMessage(chatId, { id: nextId++, type: "system", text: event.text });
      }
      return;
    }

    if (event?.type === "channel_joined") {
      const channel = addJoinedChannel(event.channel);
      const joinedChannelId = channelId(event.channel);
      if (pendingJoinChannel.value?.id === joinedChannelId && normalizeIrcNick(event.nick) === normalizeIrcNick(currentUser.value)) {
        clearPendingJoin();
        activeChat.value = joinedChannelId;
        addChannelDialogOpen.value = false;
        showJoinToast("success", "Connected", "Successfully joined the lobby.");
      }
      const isCreatedLobbyJoin = pendingLobbyCreatedViaApp.value && normalizeIrcNick(event.nick) === normalizeIrcNick(currentUser.value);
      if (channel && isCreatedLobbyJoin) {
        channel.createdViaCreateLobby = true;
        channel.initialLobbySetupPending = true;
        if (pendingLobbySeed.value) {
          const seededLobby = {
            ...channel.lobby,
            ...pendingLobbySeed.value,
          };
          channel.lobby = seededLobby;
          lobbyStates[channel.id] = seededLobby;
          setQualificationMode(channel.id, seededLobby.qualificationMode === true);
          if (Number.isInteger(seededLobby.bestOf) && seededLobby.bestOf > 0) {
            setLobbySettings(channel.label, seededLobby.bestOf, seededLobby.nextPickTeam);
          }
        }
        pendingLobbySeed.value = null;
        pendingLobbyCreatedViaApp.value = false;
      } else if (channel && normalizeIrcNick(event.nick) === normalizeIrcNick(currentUser.value)) {
        refreshLobbyTitle(channel.label);
      }
      return;
    }

    if (event?.type === "lobby_settings_synced") {
      const syncedChannelId = channelId(event.channel);
      const channel = joinedChannels.value.find((item) => item.id === syncedChannelId);
      if (!channel?.initialLobbySetupPending) return;
      channel.initialLobbySetupPending = false;
      activeChat.value = syncedChannelId;
      nextTick(() => {
        lobbySetupDialogOpen.value = true;
      });
      return;
    }

    if (event?.type === "irc_event" && pendingJoinChannel.value && ["403", "471", "473", "474", "475", "482"].includes(event.command)) {
      const mentionsPendingChannel = event.params?.some((param) => channelId(param) === pendingJoinChannel.value.id);
      if (mentionsPendingChannel) {
        failPendingJoin();
        return;
      }
    }

    if (event?.type === "channel_parted") {
      const partedChannelId = channelId(event.channel);
      if (pendingPartChannels.delete(partedChannelId)) return;

      const joinedChannel = joinedChannels.value.find((channel) => channel.id === partedChannelId);
      if (!joinedChannel || normalizeIrcNick(event.nick) !== normalizeIrcNick(currentUser.value)) {
        return;
      }

      markRoomClosed(partedChannelId);
      return;
    }

    if (event?.type !== "message" || !event.channel || !event.text) return;

    if (event.nick === "BanchoBot") {
      const joinedChannel = joinedChannels.value.find((channel) => channel.id === channelId(event.channel));
      if (joinedChannel && /(?:!mp\s+close|room\s+(?:has been\s+)?closed|lobby\s+(?:has been\s+)?closed)/i.test(event.text)) {
        markRoomClosed(joinedChannel.id);
      }
    }

    const joinedChannel = joinedChannels.value.find((channel) => channel.id === channelId(event.channel));
    const directChat = event.isDirectMessage && event.channel !== "BanchoBot" ? addDirectChat(event.channel) : null;
    const chatId = event.channel === "BanchoBot" ? "bancho" : directChat?.id || joinedChannel?.id;
    if (!chatId) {
      return;
    }

    if (joinedChannel && event.nick?.toLowerCase() === "banchobot") {
      applyRefereeConfirmation(joinedChannel, event.text);
    }

    const player = joinedChannel?.lobby?.players?.find((item) => normalizeIrcNick(item.username) === normalizeIrcNick(event.nick));

    handleNowPlayingEvent(chatId, event.text);
    if (joinedChannel && event.nick?.toLowerCase() === "banchobot") {
      const beatmapId = event.text.match(/https?:\/\/osu\.ppy\.sh\/b\/(\d+)/i)?.[1];
      if (beatmapId) {
        const currentMap = nowPlayingByLobby[chatId];
        const parsedBeatmapId = Number(beatmapId);
        if (Number(currentMap?.beatmapId || currentMap?.id) !== parsedBeatmapId) {
          loadManualNowPlayingMap(chatId, { id: parsedBeatmapId, beatmapId: parsedBeatmapId, url: `https://osu.ppy.sh/b/${beatmapId}` });
        }
      }
    }

    appendChatMessage(
      chatId,
      {
        id: nextId++,
        author: event.nick || "Unknown",
        text: event.text,
        time: event.timestamp,
        team: player?.team || null,
        mods: player?.mods || [],
      },
      { notify: normalizeIrcNick(event.nick) !== normalizeIrcNick(currentUser.value) },
    );
  },
  { flush: "sync" },
);

watch(primaryColor, (value) => {
  primaryColorDraft.value = value;
});

watch([banchoBotColor, redTeamColor, blueTeamColor, unassignedColor, highlightColor], ([bot, red, blue, unassigned, highlight]) => {
  banchoBotColorDraft.value = bot;
  redTeamColorDraft.value = red;
  blueTeamColorDraft.value = blue;
  unassignedColorDraft.value = unassigned;
  highlightColorDraft.value = highlight;
});

function commitPrimaryColor() {
  if (/^#[0-9a-f]{6}$/i.test(primaryColorDraft.value.trim())) {
    setPrimaryColor(primaryColorDraft.value.trim());
  } else {
    primaryColorDraft.value = primaryColor.value;
  }
}

function resetPrimaryColor() {
  setPrimaryColor(DEFAULT_PRIMARY_COLOR);
}

function updateChatColor(target, value) {
  const normalized = `#${String(value).replace("#", "")}`;
  if (/^#[0-9a-f]{6}$/i.test(normalized)) target.value = normalized;
}

function commitChatColor(target, draft) {
  if (/^#[0-9a-f]{6}$/i.test(draft.value.trim())) {
    target.value = draft.value.trim();
  } else {
    draft.value = target.value;
  }
}

function resetChatSetting(setting) {
  if (setting === "highlightReferee") {
    highlightReferee.value = DEFAULT_CHAT_SETTINGS.highlightReferee;
  } else if (setting === "redTeamColor") {
    redTeamColor.value = DEFAULT_CHAT_SETTINGS.redTeamColor;
  } else if (setting === "blueTeamColor") {
    blueTeamColor.value = DEFAULT_CHAT_SETTINGS.blueTeamColor;
  } else if (setting === "unassignedColor") {
    unassignedColorMode.value = DEFAULT_CHAT_SETTINGS.unassignedColorMode;
    unassignedColor.value = DEFAULT_CHAT_SETTINGS.unassignedColor;
  } else if (setting === "banchoBotColor") {
    banchoBotColor.value = DEFAULT_CHAT_SETTINGS.banchoBotColor;
  } else if (setting === "timestampMode") {
    timestampMode.value = DEFAULT_CHAT_SETTINGS.timestampMode;
  } else if (setting === "highlightWords") {
    highlightWords.value = [...DEFAULT_CHAT_SETTINGS.highlightWords];
    highlightWordsInputDraft.value = "";
  } else if (setting === "highlightStyles") {
    highlightStyles.value = [...DEFAULT_CHAT_SETTINGS.highlightStyles];
  } else if (setting === "highlightColor") {
    highlightColorMode.value = DEFAULT_CHAT_SETTINGS.highlightColorMode;
    highlightColor.value = DEFAULT_CHAT_SETTINGS.highlightColor;
  }
}

function focusHighlightWordsInput() {
  highlightWordsInputRef.value?.focus();
}

function addHighlightWords(tokens) {
  const nextWords = [...highlightWordsDraft.value];
  const existingWords = new Set(nextWords.map((word) => word.toLowerCase()));
  let changed = false;

  tokens.forEach((token) => {
    const word = String(token || "").trim();
    if (!word) return;
    const normalized = word.toLowerCase();
    if (existingWords.has(normalized)) return;
    existingWords.add(normalized);
    nextWords.push(word);
    changed = true;
  });

  if (changed) {
    highlightWordsDraft.value = nextWords;
  }

  return changed;
}

function commitHighlightWordsInput() {
  const tokens = highlightWordsInputDraft.value
    .split(/[,\s]+/)
    .map((word) => word.trim())
    .filter(Boolean);

  if (tokens.length) {
    addHighlightWords(tokens);
  }

  highlightWordsInputDraft.value = "";
}

function removeHighlightWord(wordToRemove) {
  const normalized = String(wordToRemove || "")
    .trim()
    .toLowerCase();
  if (!normalized) return;
  highlightWordsDraft.value = highlightWordsDraft.value.filter((word) => word.toLowerCase() !== normalized);
}

function handleHighlightWordsKeydown(event) {
  if (event.key === "Enter" || event.key === "," || event.key === " " || event.key === "Tab") {
    commitHighlightWordsInput();
  }

  if (event.key === "Enter" || event.key === "," || event.key === " ") {
    event.preventDefault();
  }

  if (event.key === "Backspace" && !highlightWordsInputDraft.value && highlightWordsDraft.value.length) {
    highlightWordsDraft.value = highlightWordsDraft.value.slice(0, -1);
  }
}

function handleHighlightWordsPaste(event) {
  const text = event.clipboardData?.getData("text") || "";
  if (!text) return;
  event.preventDefault();
  addHighlightWords(
    text
      .split(/[,\s]+/)
      .map((word) => word.trim())
      .filter(Boolean),
  );
  highlightWordsInputDraft.value = "";
}

function handleHighlightWordsWheel(event) {
  const container = event.currentTarget;
  if (!(container instanceof HTMLElement)) return;

  const delta = Math.abs(event.deltaX) > Math.abs(event.deltaY) ? event.deltaX : event.deltaY;
  if (!delta) return;

  container.scrollLeft += delta;
  event.preventDefault();
}

function previewNickStyle(message) {
  if (message.author === "BanchoBot" && highlightBanchoBot.value) {
    return {
      background: banchoBotColor.value,
      color: "var(--app-bg)",
    };
  }
  if (message.author === "BanchoBot") {
    return { color: banchoBotColor.value };
  }
  if (message.role === "referee") {
    if (highlightReferee.value) {
      return {
        background: "var(--app-primary-dark)",
        color: "var(--app-bg)",
      };
    }
    return { color: "var(--app-primary)" };
  }

  if (message.team?.toLowerCase() === "red") {
    return { color: redTeamColor.value };
  }
  if (message.team?.toLowerCase() === "blue") {
    return { color: blueTeamColor.value };
  }
  if (unassignedColorMode.value === "custom") {
    return { color: unassignedColor.value };
  }
  return { color: baseNickColor(message.author) };
}

function previewMessageStyle(message) {
  if (message.highlightPreview || messageHasHighlight(message.text, highlightWords.value)) {
    return highlightTextStyle(highlightStyles.value, highlightMessageColor.value);
  }
  return {};
}

const highlightMessageColor = computed(() => {
  if (highlightColorMode.value === "accent") return primaryColor.value;
  if (highlightColorMode.value === "custom") return highlightColor.value;
  return "#ffffff";
});

function previewMessageHighlighted(message) {
  return message.highlightPreview || messageHasHighlight(message.text, highlightWords.value);
}

function toggleHighlightStyles(event) {
  highlightStylesPopover.value?.toggle(event);
}

function highlightStyleSelected(style) {
  return highlightStylesDraft.value.includes(style);
}

function toggleHighlightStyle(style) {
  const nextStyles = highlightStylesDraft.value.includes(style) ? highlightStylesDraft.value.filter((item) => item !== style) : [...highlightStylesDraft.value, style];
  highlightStylesDraft.value = nextStyles;
}

function previewTime(time, index) {
  if (timestampMode.value === "full") return time;
  const minute = time.slice(0, 5);
  const previousMinute = chatPreviewMessages[index - 1]?.time.slice(0, 5);
  return index === 0 || minute !== previousMinute ? minute : "";
}

function handleLogout() {
  pendingPartChannels.clear();
  pendingLobbySeed.value = null;
  pendingLobbyCreatedViaApp.value = false;
  clearPendingJoin();
  directChats.value = [];
  joinedChannels.value = [];
  Object.keys(channelMessages).forEach((channelIdValue) => {
    delete channelMessages[channelIdValue];
  });
  Object.keys(lobbyStates).forEach((channelIdValue) => {
    delete lobbyStates[channelIdValue];
  });
  lazerChatRoomsBeingLoaded.clear();
  Object.keys(lazerRooms).forEach((chatId) => delete lazerRooms[chatId]);
  Object.keys(lazerLobbyStates).forEach((chatId) => delete lazerLobbyStates[chatId]);
  Object.keys(lobbyContexts).forEach((channelIdValue) => {
    delete lobbyContexts[channelIdValue];
  });
  Object.keys(roomClosedByChat).forEach((chatId) => {
    delete roomClosedByChat[chatId];
  });
  Object.keys(unreadChats).forEach((chatId) => {
    if (chatId !== "bancho") delete unreadChats[chatId];
  });
  activeChat.value = "bancho";
  logoutFromServer();
  void clearRememberedCredentials();
  currentUser.value = "";
  isAuthenticated.value = false;
  settingsOpen.value = false;
  localStorage.removeItem("whistleref-remembered-login");
}

async function checkForUpdates() {
  toast.removeGroup(loginToastGroup);
  toast.add({ group: loginToastGroup, severity: "info", summary: "Checking for updates", detail: "Checking for updates...", sticky: true });
  try {
    const result = await checkUpdate();
    if (result.available) {
      updateInfo.value = {
        currentVersion: result.currentVersion,
        latestVersion: result.latestVersion,
        releaseNotesUrl: result.releaseNotesUrl || "",
      };
      updateDialogMode.value = "available";
      updateDialogVisible.value = true;
      toast.removeGroup(loginToastGroup);
    } else {
      toast.removeGroup(loginToastGroup);
      toast.add({ group: loginToastGroup, severity: "success", summary: "Up to date", detail: "You are using the latest version.", life: 3000 });
    }
  } catch (error) {
    toast.removeGroup(loginToastGroup);
    toast.add({ group: loginToastGroup, severity: "error", summary: "Update check failed", detail: error.message || "Unable to check for updates.", life: 5000 });
  }
}

async function connectWithToast(username, password, { checkUpdates = false } = {}) {
  toast.removeGroup(loginToastGroup);
  toast.add({
    group: loginToastGroup,
    severity: "info",
    summary: "Connecting",
    detail: "Connecting to Bancho IRC...",
    sticky: true,
  });

  try {
    await loginToServer(username, password);
    if (checkUpdates) await checkForUpdates();
    else {
      toast.removeGroup(loginToastGroup);
      toast.add({
        group: loginToastGroup,
        severity: "success",
        summary: "Connected",
        detail: "Bancho IRC connection is ready.",
        life: 3000,
      });
    }
    return true;
  } catch (error) {
    toast.removeGroup(loginToastGroup);
    toast.add({
      group: loginToastGroup,
      severity: "error",
      summary: "Connection failed",
      detail: error.message || "Unable to connect to Bancho IRC.",
      life: 5000,
    });
    return false;
  }
}

function beginUpdateDownload() {
  updateDownloadedBytes.value = 0;
  updateTotalBytes.value = 0;
  updateSpeedBytesPerSecond.value = 0;
  updateSpeedSamples = [];
  updateDialogMode.value = "downloading";
  updateDialogVisible.value = true;
  startUpdate();
}

function cancelUpdateDownload() {
  cancelUpdate();
}

watch(lastEvent, (event) => {
  if (!event) return;
  if (event.type === "update_progress" && event.stage === "downloading") {
    const now = Date.now();
    updateDownloadedBytes.value = event.downloadedBytes;
    updateTotalBytes.value = event.totalBytes;

    updateSpeedSamples.push({ t: now, bytes: event.downloadedBytes });
    while (updateSpeedSamples.length > 2 && now - updateSpeedSamples[0].t > UPDATE_SPEED_WINDOW_MS) {
      updateSpeedSamples.shift();
    }

    const oldest = updateSpeedSamples[0];
    const elapsedSeconds = (now - oldest.t) / 1000;
    if (updateSpeedSamples.length > 1 && elapsedSeconds > 0) {
      updateSpeedBytesPerSecond.value = (event.downloadedBytes - oldest.bytes) / elapsedSeconds;
    }
  }
  if (event.type === "update_progress" && event.stage === "ready_to_install") {
    updateDialogMode.value = "installing";
    confirmInstall();
    setTimeout(() => window.close(), 700);
  }
  if (event.type === "update_error") {
    updateDialogVisible.value = false;
    if (event.code !== "DOWNLOAD_CANCELLED") {
      toast.removeGroup(loginToastGroup);
      toast.add({ group: loginToastGroup, severity: "error", summary: "Update failed", detail: event.message || "Unable to download the update.", life: 5000 });
    }
  }
});

async function handleLogin({ username, password, rememberMe }) {
  if (loginLoading.value) return;
  loginLoading.value = true;
  const connectedSuccessfully = await connectWithToast(username, password);

  if (connectedSuccessfully) {
    if (rememberMe) {
      void saveRememberedCredentials(username, password).catch(() => {});
      localStorage.setItem("whistleref-remembered-login", username);
    } else {
      void clearRememberedCredentials();
      localStorage.removeItem("whistleref-remembered-login");
    }
    currentUser.value = username;
    isAuthenticated.value = true;
  }
  loginLoading.value = false;
}

async function handleOsuCredentials({ clientId, clientSecret }) {
  osuClientId.value = clientId;
  osuClientSecret.value = clientSecret;
  osuError.value = "";

  try {
    const existingAuth = (await loadOsuAuthData()) || {};
    await saveOsuAuthData({
      ...existingAuth,
      clientId,
      clientSecret,
    });
  } catch {
    osuError.value = "Unable to save osu! credentials in this browser.";
  }
}

async function handleOsuLogin({ clientId, clientSecret }) {
  await handleOsuCredentials({ clientId, clientSecret });
  if (osuError.value) return;

  osuLoading.value = true;
  osuError.value = "";
  startOsuAuthorization(clientId);
}

async function handleOsuLogout() {
  await logoutOsu().catch(() => {});
  osuProfile.value = null;
  osuError.value = "";
  await saveOsuAuthData({
    clientId: osuClientId.value,
    clientSecret: osuClientSecret.value,
    user: null,
  });
  await clearRememberedCredentials();
  localStorage.removeItem("whistleref-remembered-login");
}

function handleCopyCallback() {
  toast.removeGroup(loginToastGroup);
  toast.add({
    group: loginToastGroup,
    severity: "success",
    summary: "Copied",
    detail: "Callback URL copied to clipboard.",
    life: 2500,
  });
}

onMounted(async () => {
  if (launchedAfterUpdate) {
    const url = new URL(window.location.href);
    url.searchParams.delete("updated");
    window.history.replaceState({}, "", `${url.pathname}${url.search}${url.hash}`);
    toast.removeGroup(loginToastGroup);
    toast.add({ group: loginToastGroup, severity: "success", summary: "Update complete", detail: "The update was installed successfully!", life: 5000 });
  } else {
    await checkForUpdates();
  }
  const [credentials, osuAuth] = await Promise.all([loadRememberedCredentials(), loadOsuAuthData()]);
  osuClientId.value = osuAuth?.clientId || "";
  osuClientSecret.value = osuAuth?.clientSecret || "";
  osuProfile.value = normalizeOsuUser(osuAuth?.user);

  try {
    const callback = readOsuAuthorizationCallback();
    if (callback) {
      if (!osuClientId.value || !osuClientSecret.value) {
        throw new Error("Enter your osu! OAuth credentials first.");
      }

      osuLoading.value = true;
      const authData = await loginOsu({
        clientId: osuClientId.value,
        clientSecret: osuClientSecret.value,
        code: callback.code,
        redirectUri: getOsuRedirectUri(),
      });
      await saveOsuAuthData({
        clientId: osuClientId.value,
        clientSecret: osuClientSecret.value,
        user: authData,
      });
      osuProfile.value = normalizeOsuUser(authData);
    }
  } catch (error) {
    osuError.value = error.message || "Unable to log in from osu!.";
  } finally {
    osuLoading.value = false;
  }

  if (credentials?.login && credentials?.password) {
    const connectedSuccessfully = await connectWithToast(credentials.login, credentials.password);
    if (connectedSuccessfully) {
      currentUser.value = credentials.login;
      isAuthenticated.value = true;
    }
  }
  authLoading.value = false;
});

function handlePageExit() {
  logoutFromServer();
}

onMounted(() => {
  window.addEventListener("pagehide", handlePageExit);
  window.addEventListener("beforeunload", handlePageExit);
  document.addEventListener("click", closeNotificationSoundMenu);
  document.addEventListener("keydown", onNotificationSoundKeydown);
});

onBeforeUnmount(() => {
  window.removeEventListener("pagehide", handlePageExit);
  window.removeEventListener("beforeunload", handlePageExit);
  document.removeEventListener("click", closeNotificationSoundMenu);
  document.removeEventListener("keydown", onNotificationSoundKeydown);
  for (const timeouts of lazerCountdownTimeouts.values()) {
    timeouts.forEach((timeoutId) => window.clearTimeout(timeoutId));
  }
  lazerCountdownTimeouts.clear();
  for (const countdown of Object.values(lazerMatchStartCountdowns)) {
    if (countdown?.timeoutId) window.clearTimeout(countdown.timeoutId);
  }
  for (const timeoutId of lazerNowPlayingFinishedTimeouts.values()) window.clearTimeout(timeoutId);
  lazerNowPlayingFinishedTimeouts.clear();
  pendingLazerPlaylistRestores.clear();
  for (const command of pendingLazerLegacyCommands.values()) window.clearTimeout(command.timeoutId);
  pendingLazerLegacyCommands.clear();
});

function openSettings() {
  settingsOpen.value = true;
}

function closeSettings() {
  settingsOpen.value = false;
}

const banchoMessages = ref([
  {
    id: 1,
    type: "system",
    text: "Welcome to WhistleRef!",
  },
]);
const roomClosedByChat = reactive({});
const winConditionResultsByChat = reactive({});

const activeMessages = computed(() => (activeChat.value === "bancho" ? banchoMessages.value : channelMessages[activeChat.value] || []));
const activeDirectChat = computed(() => directChats.value.find((item) => item.id === activeChat.value) || null);
function lazerChatId(roomId) {
  return `lazer:${roomId}`;
}

function parseLazerTeamNames(roomName) {
  const match = String(roomName || "").match(/\(([^()]+)\)\s+vs\s+\(([^()]+)\)/i);
  return match ? { teamAName: match[1].trim(), teamBName: match[2].trim() } : null;
}

function formatLazerWsError(message, fallback = "The server rejected the request.") {
  const text = String(message || "").trim();
  if (!text) return fallback;

  let detail = text
    .replace(/^.*?RefereeHubException:\s*/is, "")
    .replace(/^\s*Error\s+\d+\s*:\s*/i, "")
    .trim();
  const invokeFailure = detail.match(/^Failed to invoke ['\"].*?['\"] due to an error on the server\.\s*(.*)$/is);
  if (invokeFailure?.[1]) detail = invokeFailure[1].trim();
  detail = detail
    .replace(/^(?:HubException|Exception|Error):\s*/i, "")
    .replace(/\s+/g, " ")
    .trim();
  return detail || fallback;
}

function lazerErrorSummary(request) {
  return (
    {
      lazer_make_room: "Create room failed",
      lazer_join_room: "Join room failed",
      lazer_leave_room: "Leave room failed",
      lazer_load_chat: "Chat history failed",
      lazer_send_chat_message: "Message failed",
      lazer_change_room_settings: "Update room failed",
      lazer_add_playlist_item: "Add map failed",
      lazer_edit_playlist_item: "Update map failed",
      lazer_edit_current_playlist_item: "Update map failed",
      lazer_remove_playlist_item: "Remove map failed",
      lazer_close_room: "Close room failed",
      lazer_start_match: "Start match failed",
      lazer_stop_match_countdown: "Stop countdown failed",
      lazer_abort_match: "Abort match failed",
      lazer_set_lock_state: "Update room lock failed",
      lazer_move_user: "Move player failed",
      lazer_kick_player: "Kick player failed",
      lazer_invite_player: "Invite failed",
      lazer_ban_user: "Ban failed",
      lazer_add_referee: "Add referee failed",
      lazer_remove_referee: "Remove referee failed",
      lazer_roll: "Roll failed",
    }[request] || "Request failed"
  );
}

function handleLazerError(event) {
  if (!event || (event.type !== "error" && event.type !== "lazer_room_error")) return false;

  const request = event.request;
  const isRoomError = event.type === "lazer_room_error";
  const isLazerRequest = typeof request === "string" && request.startsWith("lazer_");
  if (!isRoomError && !isLazerRequest) return false;

  const legacyCommand = event.requestId ? pendingLazerLegacyCommands.get(event.requestId) : null;
  if (legacyCommand) {
    pendingLazerLegacyCommands.delete(event.requestId);
    if (legacyCommand.timeoutId) window.clearTimeout(legacyCommand.timeoutId);
    appendWhistleBotMessage(legacyCommand.roomId, formatLazerWsError(event.message, legacyCommand.failure));
    return true;
  }

  if (request === "lazer_send_chat_message") {
    const pending = pendingLazerMessages.shift();
    if (pending) {
      const list = channelMessages[pending.chatId] || [];
      const index = list.findIndex((item) => item.id === pending.messageId);
      if (index !== -1) list.splice(index, 1);
    }
  }
  if (request === "lazer_make_room") pendingLazerLobbySeed.value = null;
  if (request === "lazer_join_room") {
    if (pendingJoinChannel.value?.type === "lazer") clearPendingJoin();
    const roomId = Number(event.room_id ?? event.roomId);
    if (Number.isInteger(roomId)) pendingLazerInviteJoins.delete(roomId);
  }
  if (request === "lazer_change_room_settings") {
    pendingLazerLobbySettings.value = null;
    lazerLobbySetupLoading.value = false;
  }

  toast.add({
    severity: "error",
    summary: isRoomError ? "Lazer room sync failed" : lazerErrorSummary(request),
    detail: formatLazerWsError(event.message, "The Lazer request could not be completed."),
    life: 5000,
  });
  return true;
}

function normalizeLazerChatMessage(message, users = []) {
  if (!message || typeof message !== "object") return null;
  const source = message;
  const senderId = Number(source.sender_id ?? source.user_id ?? source.sender?.id);
  const usersById = new Map((Array.isArray(users) ? users : []).map((user) => [Number(user.user_id ?? user.id), user]));
  const sender = source.sender || (Number.isInteger(senderId) ? usersById.get(senderId) : null);
  const author = String(source.username || source.sender_username || sender?.username || source.sender_name || `User ${senderId || ""}`).trim();
  const text = String(source.content ?? source.message ?? source.text ?? "");
  if (!text) return null;
  return {
    id: source.message_id ?? source.id ?? `lazer-${Date.now()}-${Math.random()}`,
    senderId: Number.isInteger(senderId) ? senderId : null,
    author,
    text,
    time: source.created_at || source.timestamp || source.time || new Date().toISOString(),
    isAction: Boolean(source.is_action),
  };
}

function appendLazerChatHistory(roomId, messages, users = []) {
  const chatId = lazerChatId(Number(roomId));
  const normalized = (Array.isArray(messages) ? messages : []).map((message) => normalizeLazerChatMessage(message, users)).filter(Boolean);
  // History may arrive after live messages or local system notifications.
  const historyIds = new Set(normalized.map((message) => String(message.id)));
  const newer = (channelMessages[chatId] || []).filter((message) => !historyIds.has(String(message.id)));
  channelMessages[chatId] = [...normalized, ...newer];
  unreadChats[chatId] ??= false;
}

function appendLazerChatMessage(roomId, message, users = [], notify = true) {
  const normalized = normalizeLazerChatMessage(message, users);
  if (!normalized) return;
  const chatId = lazerChatId(Number(roomId));
  const list = (channelMessages[chatId] ||= []);
  const pending = list.find((item) => (item.pending || item.awaitingEcho) && normalizeIrcNick(item.author) === normalizeIrcNick(normalized.author) && item.text === normalized.text);
  if (pending) {
    Object.assign(pending, normalized, { pending: false, awaitingEcho: false });
    return;
  }
  if (list.some((item) => String(item.id) === String(normalized.id))) return;
  appendChatMessage(chatId, normalized, { notify: notify && normalized.author !== currentUser.value });
}

function loadLazerUserProfile(roomId, userId) {
  const id = Number(userId);
  const cacheKey = `${roomId}:${id}`;
  if (!Number.isInteger(id) || id <= 0) return;
  const cached = getLazerCachedProfile(roomId, id);
  if (cached) {
    lazerUserProfiles[id] = cached;
    return;
  }
  if (lazerUserProfiles[id] || pendingLazerUserProfiles.has(cacheKey)) return;
  pendingLazerUserProfiles.add(cacheKey);
  void loadLazerCachedProfile(roomId, id, requestApi)
    .then((profile) => {
      if (!profile || typeof profile !== "object") return;
      lazerUserProfiles[id] = profile;
    })
    .catch(() => {})
    .finally(() => pendingLazerUserProfiles.delete(cacheKey));
}

function loadLazerStyleBeatmap(roomId, beatmapId) {
  const parsedRoomId = Number(roomId);
  const parsedBeatmapId = Number(beatmapId);
  const key = `${parsedRoomId}:${parsedBeatmapId}`;
  if (!Number.isInteger(parsedRoomId) || parsedRoomId <= 0 || !Number.isInteger(parsedBeatmapId) || parsedBeatmapId <= 0) return;
  if (lazerStyleBeatmaps[key] || pendingLazerStyleBeatmaps.has(key)) return;
  pendingLazerStyleBeatmaps.add(key);
  void loadLazerCachedBeatmap(parsedRoomId, parsedBeatmapId, requestApi)
    .then((beatmap) => {
      if (beatmap) lazerStyleBeatmaps[key] = beatmap;
    })
    .catch(() => {})
    .finally(() => pendingLazerStyleBeatmaps.delete(key));
}

function registerLazerRoom(room) {
  if (!room || !Number.isInteger(Number(room.room_id))) return null;
  for (const player of room.players || []) loadLazerUserProfile(room.room_id, player.user_id);
  for (const referee of room.referees || []) loadLazerUserProfile(room.room_id, referee.user_id);
  const id = lazerChatId(Number(room.room_id));
  const previousState = lazerLobbyStates[id] || {};
  const parsedTeams = parseLazerTeamNames(room.name);
  lazerRooms[id] = {
    ...room,
    playlist: getActiveLazerPlaylist(room.playlist),
    id,
    label: room.name || `Lazer room #${room.room_id}`,
    source: "lazer",
    closed: false,
  };
  lazerLobbyStates[id] = {
    ...previousState,
    id: Number(room.room_id),
    name: room.name || previousState.name || `Lazer room #${room.room_id}`,
    teamAName: parsedTeams?.teamAName || previousState.teamAName || "Team A",
    teamBName: parsedTeams?.teamBName || previousState.teamBName || "Team B",
    teamAScore: previousState.teamAScore ?? 0,
    teamBScore: previousState.teamBScore ?? 0,
    lastPlay: previousState.lastPlay || { teamRedScore: null, teamBlueScore: null, scoreDifference: null, winnerTeam: null },
    qualificationMode: previousState.qualificationMode ?? false,
    bestOf: previousState.bestOf ?? null,
    nextPickTeam: previousState.nextPickTeam ?? null,
    matchStatus: previousState.matchStatus || "—",
  };
  channelMessages[id] ||= [];
  unreadChats[id] ??= false;
  // A room snapshot is authoritative for playlist contents. If a one-map
  // match just completed, restore it only after this snapshot confirms that
  // no unplayed item remains.
  restoreLazerSinglePlaylistItem(lazerRooms[id]);
  syncLazerNowPlaying(lazerRooms[id]);
  return lazerRooms[id];
}

function getActiveLazerPlaylist(playlist) {
  const items = Array.isArray(playlist) ? playlist : [];
  return items.filter((item) => !item?.was_played);
}

function clearLazerPlaylistRestore(roomId) {
  pendingLazerPlaylistRestores.delete(Number(roomId));
}

function queueLazerPlaylistRestore(roomId, item) {
  if (!item || pendingLazerPlaylistRestores.has(Number(roomId))) return;
  pendingLazerPlaylistRestores.set(Number(roomId), {
    beatmap_id: item.beatmap_id,
    ruleset_id: item.ruleset_id,
    required_mods: item.required_mods,
    allowed_mods: item.allowed_mods,
    freestyle: item.freestyle,
  });
}

function restoreLazerSinglePlaylistItem(room) {
  const roomId = Number(room?.room_id);
  const restore = pendingLazerPlaylistRestores.get(roomId);
  if (!Number.isInteger(roomId) || roomId <= 0 || !restore || room?.closed) return;

  const items = room.playlist;
  if (!Array.isArray(items) || items.some((item) => !item?.was_played)) {
    pendingLazerPlaylistRestores.delete(roomId);
    return;
  }

  addLazerPlaylistItem(roomId, {
    beatmap_id: restore.beatmap_id,
    ruleset_id: restore.ruleset_id,
    required_mods: restore.required_mods,
    allowed_mods: restore.allowed_mods,
    freestyle: restore.freestyle,
  });
  pendingLazerPlaylistRestores.delete(roomId);
}

function getLazerCurrentPlaylistItem(room) {
  const playlist = Array.isArray(room?.playlist) ? room.playlist : [];
  const currentPlaylistItemId = Number(room?.current_playlist_item_id ?? room?.playlist_item_id ?? room?.state?.playlist_item_id);
  return (
    (Number.isInteger(currentPlaylistItemId) && playlist.find((item) => Number(item.id) === currentPlaylistItemId && !item.was_played)) ||
    [...playlist].sort((left, right) => Number(left.order) - Number(right.order)).find((item) => !item.was_played) ||
    null
  );
}

function clearLazerNowPlayingFinished(roomId) {
  const id = Number(roomId);
  const timeoutId = lazerNowPlayingFinishedTimeouts.get(id);
  if (timeoutId) window.clearTimeout(timeoutId);
  lazerNowPlayingFinishedTimeouts.delete(id);
}

function syncLazerNowPlaying(room, { force = false } = {}) {
  const chatId = room?.id;
  const playlistItem = getLazerCurrentPlaylistItem(room);
  if (!chatId) return;
  if (!playlistItem) {
    delete nowPlayingByLobby[chatId];
    return;
  }

  const currentMap = nowPlayingByLobby[chatId];
  if (!force && currentMap?.status === "finished") return;
  if (Number(currentMap?.playlistItemId) === Number(playlistItem.id) && Number(currentMap?.beatmapId) === Number(playlistItem.beatmap_id)) {
    if (force && currentMap.status === "finished") {
      currentMap.status = "waiting";
      currentMap.progressAborted = false;
      currentMap.startTimestamp = null;
      currentMap.error = null;
    }
    currentMap.mods = (Array.isArray(playlistItem.required_mods) ? playlistItem.required_mods : []).map((mod) => (typeof mod === "string" ? mod : mod?.acronym)).filter(Boolean);
    currentMap.rulesetId = playlistItem.ruleset_id;
    return;
  }
  const localPreview = getLazerMappoolPreview(room.room_id, playlistItem.beatmap_id);
  if (localPreview) {
    setLazerNowPlayingFromPreview(chatId, playlistItem, localPreview);
    return;
  }
  void loadLazerNowPlayingMap(chatId, room.room_id, playlistItem);
}

function getLazerMappoolPreview(roomId, beatmapId) {
  const pool = getLazerActivePool(lazerChatId(roomId));
  const matchSlotId = lazerMatchMappoolSlots.get(Number(roomId)) || pendingLazerMappoolSlots.get(Number(roomId));
  const slot = pool?.slots?.find((item) => item.slotId === matchSlotId) || pool?.slots?.find((item) => Number(item.beatmapId) === Number(beatmapId));
  return slot?.preview || null;
}

function setLazerNowPlayingFromPreview(chatId, playlistItem, preview) {
  const beatmapId = Number(playlistItem.beatmap_id);
  const beatmapsetId = Number(preview.beatmapsetId);
  const validBeatmapsetId = Number.isInteger(beatmapsetId) && beatmapsetId > 0 ? beatmapsetId : null;
  setNowPlaying(chatId, {
    id: beatmapId,
    beatmapId,
    playlistItemId: playlistItem.id,
    title: preview.title,
    artist: preview.artist,
    diff: preview.diff,
    mapperName: preview.author,
    starRating: preview.starRating,
    totalSeconds: preview.totalSeconds,
    beatmapsetId: validBeatmapsetId,
    coverUrl: validBeatmapsetId ? `https://assets.ppy.sh/beatmaps/${validBeatmapsetId}/covers/card@2x.jpg` : "",
    rulesetId: playlistItem.ruleset_id,
    mods: (Array.isArray(playlistItem.required_mods) ? playlistItem.required_mods : []).map((mod) => (typeof mod === "string" ? mod : mod?.acronym)).filter(Boolean),
    status: "waiting",
    error: null,
  });
}

async function loadLazerNowPlayingMap(chatId, roomId, playlistItem) {
  const beatmapId = Number(playlistItem?.beatmap_id);
  const parsedRoomId = Number(roomId);
  if (!chatId || !Number.isInteger(parsedRoomId) || parsedRoomId <= 0 || !Number.isInteger(beatmapId) || beatmapId <= 0) return;

  const requestId = `lazer-now-playing-${Date.now()}-${Math.random()}`;
  const loadingMap = {
    id: beatmapId,
    beatmapId,
    playlistItemId: playlistItem.id,
    requestId,
    status: "waiting",
    error: "Loading map…",
  };
  setNowPlaying(chatId, loadingMap);

  try {
    const info = await loadLazerCachedBeatmap(parsedRoomId, beatmapId, requestApi);
    if (nowPlayingByLobby[chatId]?.requestId !== requestId) return;
    if (!info) throw new Error("Unable to load beatmap.");
    const beatmapsetId = Number(info.beatmapsetId);
    const coverUrl = Number.isInteger(beatmapsetId) && beatmapsetId > 0 ? `https://assets.ppy.sh/beatmaps/${beatmapsetId}/covers/card@2x.jpg` : "";
    setNowPlaying(chatId, {
      id: beatmapId,
      beatmapId,
      playlistItemId: playlistItem.id,
      requestId,
      title: info.title,
      artist: info.artist,
      diff: info.diff,
      mapperName: info.mapperName,
      starRating: info.starRating,
      totalSeconds: info.totalSeconds,
      beatmapsetId: Number.isInteger(beatmapsetId) && beatmapsetId > 0 ? beatmapsetId : null,
      coverUrl,
      rulesetId: playlistItem.ruleset_id,
      mods: (Array.isArray(playlistItem.required_mods) ? playlistItem.required_mods : []).map((mod) => (typeof mod === "string" ? mod : mod?.acronym)).filter(Boolean),
      status: "waiting",
      error: null,
    });
  } catch (error) {
    if (nowPlayingByLobby[chatId]?.requestId === requestId) {
      setNowPlaying(chatId, {
        ...loadingMap,
        error: error.message || "Unable to load map",
      });
    }
  }
}

const activeLazerRoom = computed(() => lazerRooms[activeChat.value] || null);
const activeLazerRefereeUsers = computed(() => {
  const referees = activeLazerRoom.value?.referees || [];
  return referees
    .map((referee) => {
      const profile = lazerUserProfiles[referee.user_id];
      if (profile?.username) return profile.username;
      if (Number(osuProfile.value?.id) === Number(referee.user_id)) return currentUser.value;
      return "";
    })
    .filter(Boolean);
});
const activeLazerLobbyState = computed(() => lazerLobbyStates[activeChat.value] || null);
const activeLazerRoomSize = computed(() => {
  const maxParticipants = Number(activeLazerRoom.value?.max_participants);
  return Number.isFinite(maxParticipants) && maxParticipants > 0 ? maxParticipants : "Infinite";
});
const activeLazerMatchType = computed(() => {
  const type = activeLazerRoom.value?.state?.type;
  return type === "head_to_head" ? "HeadToHead" : type === "team_versus" ? "TeamVS" : "—";
});
const activeLazerCurrentPlaylistItemId = computed(() => {
  const room = activeLazerRoom.value;
  const explicitItemId = Number(room?.current_playlist_item_id ?? room?.playlist_item_id ?? room?.state?.playlist_item_id);
  return Number.isInteger(explicitItemId) ? explicitItemId : Number(getLazerCurrentPlaylistItem(room)?.id) || null;
});
const activeChatKind = computed(() => {
  if (activeChat.value === "bancho") return "bancho";
  if (activeDirectChat.value) return "dm";
  if (activeLazerRoom.value) return "lazer";
  return "lobby";
});
const activeChatTitle = computed(() => {
  if (activeChat.value === "bancho") return "BanchoBot";
  if (activeDirectChat.value) return activeDirectChat.value.label;
  if (activeLazerRoom.value) return activeLazerRoom.value.label;
  const channel = joinedChannels.value.find((item) => item.id === activeChat.value);
  return channel?.lobby?.name || channel?.label || activeChat.value;
});
watch(
  [isAuthenticated, settingsOpen, activeChatTitle],
  ([authenticated, settingsVisible, title]) => {
    document.title = authenticated && !settingsVisible && title ? `WhistleRef — ${title}` : "WhistleRef";
  },
  { immediate: true },
);
const isBanchoChat = computed(() => activeChatKind.value === "bancho");
const isDirectChat = computed(() => activeChatKind.value === "dm");
const isLazerChat = computed(() => activeChatKind.value === "lazer");
const activeChatShortcutMode = computed(() => {
  if (isBanchoChat.value) return "bancho";
  if (isDirectChat.value) return "none";
  return "referee";
});
const activeChannel = computed(() => {
  if (activeChatKind.value !== "lobby") return null;
  return joinedChannels.value.find((item) => item.id === activeChat.value);
});
const activeLobbyState = computed(() => {
  if (activeChatKind.value !== "lobby") return null;
  return lobbyStates[activeChat.value];
});
const activeQualificationMode = computed({
  get: () => getQualificationMode(activeChat.value),
  set: (value) => setQualificationMode(activeChat.value, value),
});
const activeLobbySize = computed(() => activeLobbyState.value?.size ?? 16);
const activeLobbyTeamMode = computed(() => activeLobbyState.value?.teamMode || "HeadToHead");
const activeLobbyScoreMode = computed(() => activeLobbyState.value?.scoreMode || "Score");
const activeMappoolSlots = computed(() => getActivePool(activeChat.value)?.slots || []);
const activeLazerMappoolSlots = computed(() => getLazerActivePool(activeChat.value)?.slots || []);
const activeNowPlaying = computed(() => {
  if (!showNowPlaying.value || activeChatKind.value !== "lobby" || roomClosedByChat[activeChat.value]) return null;
  const map = nowPlayingByLobby[activeChat.value];
  if (!map) return null;
  const totalSeconds = Number(map.totalSeconds);
  return {
    ...map,
    totalSeconds: Number.isFinite(totalSeconds) && totalSeconds > 0 ? totalSeconds : null,
    pickedBy: map.pickedBy || activeLobbyState.value?.nextPickTeam || null,
    pickedByTeam:
      map.pickedByTeam ||
      (map.pickedBy && normalizeIrcNick(map.pickedBy) === normalizeIrcNick(activeLobbyState.value?.teamRed)
        ? "red"
        : map.pickedBy && normalizeIrcNick(map.pickedBy) === normalizeIrcNick(activeLobbyState.value?.teamBlue)
          ? "blue"
          : null),
    mods: activeLobbyState.value?.activeMods || map.mods || [],
  };
});
const activeLazerNowPlaying = computed(() => {
  if (!showNowPlaying.value || activeChatKind.value !== "lazer" || activeLazerRoom.value?.closed) return null;
  return nowPlayingByLobby[activeChat.value] || null;
});
const activeLobbyTeamAScore = computed({
  get: () => activeLobbyState.value?.teamRedScore ?? 0,
  set: (value) => updateActiveLobbyScore("teamRedScore", value),
});
const activeLobbyTeamBScore = computed({
  get: () => activeLobbyState.value?.teamBlueScore ?? 0,
  set: (value) => updateActiveLobbyScore("teamBlueScore", value),
});
const activeLazerTeamAScore = computed({
  get: () => activeLazerLobbyState.value?.teamAScore ?? 0,
  set: (value) => updateActiveLazerScore("teamAScore", value),
});
const activeLazerTeamBScore = computed({
  get: () => activeLazerLobbyState.value?.teamBScore ?? 0,
  set: (value) => updateActiveLazerScore("teamBScore", value),
});
const activeLazerQualificationMode = computed({
  get: () => Boolean(activeLazerLobbyState.value?.qualificationMode),
  set: (value) => {
    if (activeLazerLobbyState.value) activeLazerLobbyState.value.qualificationMode = Boolean(value);
  },
});
const activeLobbyPlayers = computed(() => {
  const lobby = activeLobbyState.value;
  if (!lobby?.players) return [];
  const commonMods = lobby.activeMods
    ? lobby.activeMods
        .split(/\s*,\s*/)
        .map((mod) => mod.trim())
        .filter((mod) => mod && !/^(?:enabled|disabled|freemod|fm)$/i.test(mod))
    : [];
  const players = [...lobby.players]
    .sort((left, right) => {
      const leftSlot = Number.isFinite(left.slot) ? left.slot : Number.POSITIVE_INFINITY;
      const rightSlot = Number.isFinite(right.slot) ? right.slot : Number.POSITIVE_INFINITY;
      if (leftSlot !== rightSlot) return leftSlot - rightSlot;
      return left.username.localeCompare(right.username);
    })
    .map((player) => ({
      name: player.username,
      profileUrl: player.profileUrl || playerProfilesByLobbyId[activeChat.value]?.[normalizeIrcNick(player.username)]?.profileUrl || (player.userId ? `https://osu.ppy.sh/u/${player.userId}` : ""),
      isHost: Boolean(player.isHost) || normalizeIrcNick(player.username) === normalizeIrcNick(lobby.host),
      isReady: Boolean(player.ready),
      noMap: Boolean(player.noMap),
      avatarUrl: player.avatarUrl || playerProfilesByLobbyId[activeChat.value]?.[normalizeIrcNick(player.username)]?.avatarUrl || (player.userId ? `https://a.ppy.sh/${player.userId}` : ""),
      team: player.team || null,
      slot: player.slot ?? null,
      rulesetId: { "osu!": 0, "osu!taiko": 1, "osu!catch": 2, "osu!mania": 3 }[lobby.mode] ?? 0,
      mods: [...commonMods, ...(player.mods || [])]
        .filter((mod) => !/^(?:enabled|disabled|freemod|fm)$/i.test(String(mod).trim()))
        .filter((mod, index, mods) => mods.findIndex((candidate) => candidate.toLowerCase() === mod.toLowerCase()) === index),
    }));
  const playersBySlot = new Map(players.filter((player) => Number.isInteger(player.slot)).map((player) => [player.slot, player]));
  return Array.from({ length: 16 }, (_, index) => {
    const slot = index + 1;
    const player = playersBySlot.get(slot);
    if (player) return player;
    return {
      name: `Slot ${slot}`,
      slot,
      isSlot: true,
      isLocked: Boolean(lobby.slotLocks?.[index]),
      profileUrl: "",
      isHost: false,
      isReady: false,
      avatarUrl: "",
      team: null,
      mods: [],
    };
  });
});
const activeLobbyDisplayPlayers = computed(() => (fullSlots.value ? activeLobbyPlayers.value : activeLobbyPlayers.value.filter((player) => !player.isSlot)));
const activeLobbyReferees = computed(() => {
  const channel = joinedChannels.value.find((item) => item.id === activeChat.value);
  if (Array.isArray(channel?.referees)) {
    return channel.referees;
  }
  return currentUser.value ? [currentUser.value] : [];
});
const activeRefereeUsers = computed(() => (isDirectChat.value ? [] : activeLobbyReferees.value));
function normalizeLazerMods(mods) {
  return (Array.isArray(mods) ? mods : [])
    .map((mod) => (typeof mod === "string" ? mod : mod?.acronym))
    .filter(Boolean)
    .filter((mod, index, values) => values.indexOf(mod) === index);
}
const activeLazerPlayers = computed(() => {
  const room = activeLazerRoom.value;
  if (!room) return [];
  const refereeIds = new Set((room.referees || []).map((referee) => String(referee.user_id)));
  const playersById = new Map((room.players || []).map((player) => [player.user_id, player]));
  for (const referee of room.referees || []) {
    if (!playersById.has(referee.user_id)) {
      playersById.set(referee.user_id, {
        user_id: referee.user_id,
        status: "idle",
        style: { ruleset_id: null, beatmap_id: null },
        mods: [],
        team: null,
      });
    }
  }
  const slots = Array.isArray(room.state?.slots) ? room.state.slots : [];
  const maxParticipants = Number(room.max_participants);
  const hasLimitedSlots = Number.isFinite(maxParticipants) && maxParticipants > 0;
  const playerStyleChange = (player) => {
    if (!lazerStyleChangedUsers[Number(room.room_id)]?.[Number(player.user_id)]) return null;
    const lobbyItem = getLazerCurrentPlaylistItem(room);
    if (!lobbyItem) return null;
    const before = { rulesetId: lobbyItem.ruleset_id ?? null, beatmapId: lobbyItem.beatmap_id ?? null };
    const after = { rulesetId: player.style?.ruleset_id ?? null, beatmapId: player.style?.beatmap_id ?? null };
    if (Number(before.rulesetId) === Number(after.rulesetId) && Number(before.beatmapId) === Number(after.beatmapId)) return null;
    const beatmap = (style) => {
      const beatmapId = Number(style?.beatmapId);
      return Number.isInteger(beatmapId) && beatmapId > 0 ? lazerStyleBeatmaps[`${room.room_id}:${beatmapId}`] || null : null;
    };
    loadLazerStyleBeatmap(room.room_id, before.beatmapId);
    loadLazerStyleBeatmap(room.room_id, after.beatmapId);
    return { before: { ...before, beatmap: beatmap(before) }, after: { ...after, beatmap: beatmap(after) } };
  };
  if (!hasLimitedSlots) {
    return [...playersById.values()].map((player) => ({
      name: lazerUserProfiles[player.user_id]?.username || `User ${player.user_id}`,
      userId: player.user_id,
      slot: null,
      isReferee: refereeIds.has(String(player.user_id)),
      isHost: false,
      isReady: player.status === "ready",
      status: player.status || "idle",
      team: player.team,
      rulesetId: player.style?.ruleset_id ?? null,
      styleChange: playerStyleChange(player),
      mods: normalizeLazerMods(player.mods),
      avatarUrl: lazerUserProfiles[player.user_id]?.avatarUrl || `https://a.ppy.sh/${player.user_id}`,
      profileUrl: lazerUserProfiles[player.user_id]?.profileUrl || `https://osu.ppy.sh/users/${player.user_id}`,
    }));
  }

  const players = [];
  const displayedUserIds = new Set();
  const playerView = (player, slot) => ({
    name: lazerUserProfiles[player.user_id]?.username || `User ${player.user_id}`,
    userId: player.user_id,
    slot,
    isReferee: refereeIds.has(String(player.user_id)),
    isHost: false,
    isReady: player.status === "ready",
    status: player.status || "idle",
    team: player.team,
    rulesetId: player.style?.ruleset_id ?? null,
    styleChange: playerStyleChange(player),
    mods: normalizeLazerMods(player.mods),
    avatarUrl: lazerUserProfiles[player.user_id]?.avatarUrl || `https://a.ppy.sh/${player.user_id}`,
    profileUrl: lazerUserProfiles[player.user_id]?.profileUrl || `https://osu.ppy.sh/users/${player.user_id}`,
  });

  for (let index = 0; index < maxParticipants; index += 1) {
    const userId = slots[index];
    const player = [...playersById.values()].find((candidate) => String(candidate.user_id) === String(userId));
    if (player) {
      players.push(playerView(player, index + 1));
      displayedUserIds.add(String(player.user_id));
    } else {
      players.push({
        name: `Slot ${index + 1}`,
        slot: index + 1,
        isSlot: true,
        isHost: false,
        isReady: false,
        team: null,
        mods: [],
        avatarUrl: "",
        profileUrl: "",
      });
    }
  }

  for (const player of playersById.values()) {
    if (!displayedUserIds.has(String(player.user_id))) players.push(playerView(player, null));
  }
  return players;
});

function moveLazerPlayer({ userId, slot }) {
  const room = activeLazerRoom.value;
  const targetSlot = Number(slot);
  if (!room || !Array.isArray(room.state?.slots) || !Number.isInteger(targetSlot) || targetSlot < 1 || targetSlot > room.state.slots.length) return;
  const nextSlots = [...room.state.slots];
  const previousSlot = nextSlots.findIndex((slotUserId) => String(slotUserId) === String(userId));
  if (previousSlot !== -1) nextSlots[previousSlot] = null;
  nextSlots[targetSlot - 1] = userId;
  room.state = { ...room.state, slots: nextSlots };
}
const activeLazerDisplayPlayers = computed(() =>
  activeLazerPlayers.value.filter((player) => !player.isSlot || (Number(activeLazerRoom.value?.max_participants) > 0 && Number.isFinite(Number(activeLazerRoom.value?.max_participants)))),
);
const lobbyClock = ref(Date.now());
const activeLazerTimerSeconds = computed(() => {
  const roomId = Number(activeLazerRoom.value?.room_id);
  const countdown = lazerCountdowns[roomId];
  if (!countdown?.endsAt) return 0;
  return Math.max(0, Math.ceil((countdown.endsAt - lobbyClock.value) / 1000));
});
const activeLazerMatchStartSeconds = computed(() => {
  const roomId = Number(activeLazerRoom.value?.room_id);
  const countdown = lazerMatchStartCountdowns[roomId];
  if (!countdown?.endsAt) return 0;
  return Math.max(0, Math.ceil((countdown.endsAt - lobbyClock.value) / 1000));
});
const activeLazerTimer = computed(() => activeLazerTimerSeconds.value > 0);
const activeLobbyTimerSeconds = computed(() => {
  const timer = activeLobbyState.value?.timer;
  if (!timer?.active || !timer.endsAt) return 0;
  return Math.max(0, Math.ceil((timer.endsAt - lobbyClock.value) / 1000));
});
const activeLobbyTimer = computed(() => activeLobbyTimerSeconds.value > 0 && Boolean(activeLobbyState.value));
let lobbyClockInterval;
onMounted(() => {
  lobbyClockInterval = window.setInterval(() => {
    lobbyClock.value = Date.now();
  }, 1000);
});
onBeforeUnmount(() => {
  window.clearInterval(lobbyClockInterval);
});

let nextId = 4;

function normalizeChannel(channel) {
  return String(channel || "")
    .replace(/^:/, "")
    .toLowerCase();
}

function normalizeIrcNick(nick) {
  return normalizeChannel(nick).replaceAll(" ", "_");
}

function channelId(channel) {
  const normalizedChannel = normalizeChannel(channel);
  const multiplayerMatch = normalizedChannel.match(/^#?mp_(\d+)$/);
  return multiplayerMatch ? `mp-${multiplayerMatch[1]}` : normalizedChannel;
}

function directChatId(nick) {
  return `dm:${normalizeIrcNick(nick)}`;
}

function createDefaultLobbyState(channelName) {
  const normalizedChannel = normalizeChannel(channelName);
  const match = normalizedChannel.match(/^#?mp_(\d+)$/);
  return {
    id: match ? Number(match[1]) : null,
    name: "",
    qualifiers: false,
    teamRed: "",
    teamBlue: "",
    teamRedScore: 0,
    teamBlueScore: 0,
    bestOf: null,
    nextPickTeam: null,
    matchStatus: null,
    teamRedPlayers: [],
    teamBluePlayers: [],
    lastPlay: {
      teamRedScore: null,
      teamBlueScore: null,
      scoreDifference: null,
      winnerTeam: null,
    },
    players: [],
    currentBeatmap: null,
    activeMods: null,
    host: null,
    teamMode: "HeadToHead",
    scoreMode: "Score",
    mode: "osu!",
    size: 16,
    slotLocks: Array.from({ length: 16 }, () => false),
    timer: { active: false, endsAt: null },
    status: "active",
  };
}

function addJoinedChannel(channelName) {
  const normalizedChannel = normalizeChannel(channelName);
  if (!normalizedChannel) return;

  const existingChannel = joinedChannels.value.find((channel) => channel.id === channelId(channelName));
  if (existingChannel) return existingChannel;

  const channel = {
    id: channelId(channelName),
    label: channelName.replace(/^:/, ""),
    source: "irc",
    createdViaCreateLobby: false,
    lobby: createDefaultLobbyState(channelName),
    referees: currentUser.value ? [currentUser.value] : [],
    initialLobbySetupPending: false,
  };
  joinedChannels.value.push(channel);
  lobbyStates[channel.id] = channel.lobby;
  channelMessages[channel.id] = [];
  lobbyContexts[channel.id] = createMappoolChatContext();
  unreadChats[channel.id] = false;
  return channel;
}

function addDirectChat(nick) {
  const label = String(nick || "").trim();
  if (!label) return null;

  const id = directChatId(label);
  const existingChat = directChats.value.find((chat) => chat.id === id);
  if (existingChat) {
    existingChat.label = label;
    channelMessages[id] ||= [];
    unreadChats[id] ??= false;
    return existingChat;
  }

  const chat = {
    id,
    label,
    source: "dm",
  };
  directChats.value.push(chat);
  channelMessages[id] ||= [];
  unreadChats[id] = false;
  return chat;
}

function removeDirectChat(chatId) {
  const index = directChats.value.findIndex((chat) => chat.id === chatId);
  if (index === -1) return;

  directChats.value.splice(index, 1);
  delete channelMessages[chatId];
  delete unreadChats[chatId];
  if (activeChat.value === chatId) {
    activeChat.value = "bancho";
    unreadChats.bancho = false;
    settingsOpen.value = false;
  }
}

function applyLobbyState(event) {
  if (!event.channel || !event.state) return;
  const eventChannelId = channelId(event.channel);
  const existingChannel = joinedChannels.value.find((item) => item.id === eventChannelId);
  if (!existingChannel && pendingPartChannels.has(eventChannelId)) return;

  const channel = existingChannel || addJoinedChannel(event.channel);
  if (!channel) return;
  const currentLobby = channel.lobby || createDefaultLobbyState(event.channel);
  const incomingLobby = { ...event.state };
  delete incomingLobby.referees;

  const nextLobby = {
    ...createDefaultLobbyState(event.channel),
    ...currentLobby,
    ...incomingLobby,
    name: incomingLobby.name || currentLobby.name,
    teamRed: incomingLobby.teamRed || currentLobby.teamRed,
    teamBlue: incomingLobby.teamBlue || currentLobby.teamBlue,
    qualifiers: incomingLobby.name ? incomingLobby.qualifiers : currentLobby.qualifiers,
    timer: {
      ...currentLobby.timer,
      ...incomingLobby.timer,
    },
    lastPlay: {
      ...currentLobby.lastPlay,
      ...incomingLobby.lastPlay,
    },
    currentBeatmap: incomingLobby.currentBeatmap ? { ...incomingLobby.currentBeatmap } : currentLobby.currentBeatmap,
    teamRedPlayers: Array.isArray(incomingLobby.teamRedPlayers) ? [...incomingLobby.teamRedPlayers] : currentLobby.teamRedPlayers,
    teamBluePlayers: Array.isArray(incomingLobby.teamBluePlayers) ? [...incomingLobby.teamBluePlayers] : currentLobby.teamBluePlayers,
    players: Array.isArray(incomingLobby.players) ? incomingLobby.players.map((player) => ({ ...player })) : currentLobby.players,
    slotLocks: Array.isArray(incomingLobby.slotLocks) ? [...incomingLobby.slotLocks] : currentLobby.slotLocks,
  };
  if (!Array.isArray(incomingLobby.slotLocks) && Number.isInteger(nextLobby.size)) {
    nextLobby.slotLocks = Array.from({ length: 16 }, (_, index) => index >= nextLobby.size);
  }
  channel.lobby = nextLobby;
  lobbyStates[eventChannelId] = nextLobby;
  cacheLobbyPlayers(eventChannelId, nextLobby.players);
  if (!hasQualificationMode(eventChannelId)) {
    setQualificationMode(eventChannelId, nextLobby.qualificationMode === true || nextLobby.qualifiers === true);
  }
  channel.closed = channel.lobby.status === "closed";

  if (channel.closed) {
    markRoomClosed(channel.id);
  } else {
    delete roomClosedByChat[channel.id];
  }
}

function updateActiveLobbyScore(field, value) {
  const channel = joinedChannels.value.find((item) => item.id === activeChat.value);
  if (!channel?.lobby) return;

  const score = Math.max(0, Number.parseInt(value, 10) || 0);
  if (channel.lobby[field] === score) return;
  channel.lobby[field] = score;
  channel.lobby.matchStatus = getMatchStatus(channel.lobby, channel.lobby.teamRed || "Team A", channel.lobby.teamBlue || "Team B");
  setLobbyScore(channel.label, channel.lobby.teamRedScore, channel.lobby.teamBlueScore);
}

function updateActiveLobbySettings(settings) {
  const channel = joinedChannels.value.find((item) => item.id === activeChat.value);
  if (!channel?.lobby) return;

  const bestOf = Number.isInteger(settings.bestOf) && settings.bestOf > 0 ? settings.bestOf : null;
  const nextPickTeam = settings.nextPickTeam || null;
  channel.lobby.bestOf = bestOf;
  channel.lobby.nextPickTeam = nextPickTeam;
  channel.lobby.matchStatus = getMatchStatus(channel.lobby, channel.lobby.teamRed || "Team A", channel.lobby.teamBlue || "Team B");
  setLobbySettings(channel.label, bestOf, nextPickTeam);
}

function updateActiveLazerScore(field, value) {
  const lobby = activeLazerLobbyState.value;
  if (!lobby || !["teamAScore", "teamBScore"].includes(field)) return;
  lobby[field] = Math.max(0, Number.parseInt(value, 10) || 0);
  lobby.matchStatus = getMatchStatus({ bestOf: lobby.bestOf, nextPickTeam: lobby.nextPickTeam, teamRedScore: lobby.teamAScore, teamBlueScore: lobby.teamBScore }, lobby.teamAName, lobby.teamBName);
}

function updateActiveLazerSettings(settings) {
  const lobby = activeLazerLobbyState.value;
  if (!lobby) return;
  lobby.bestOf = Number.isInteger(settings.bestOf) && settings.bestOf > 0 ? settings.bestOf : null;
  lobby.nextPickTeam = settings.nextPickTeam || null;
  lobby.matchStatus = getMatchStatus({ bestOf: lobby.bestOf, nextPickTeam: lobby.nextPickTeam, teamRedScore: lobby.teamAScore, teamBlueScore: lobby.teamBScore }, lobby.teamAName, lobby.teamBName);
}

function applyRefereeConfirmation(channel, text) {
  const added = text.match(/^Added\s+(.+?)\s+to the match referees\.?$/i);
  const removed = text.match(/^Removed\s+(.+?)\s+from the match referees\.?$/i);
  if (!added && !removed) return;

  const action = added ? "add" : "remove";
  const nickname = (added || removed)[1].trim();
  const referees = Array.isArray(channel.referees) ? channel.referees : currentUser.value ? [currentUser.value] : [];
  const normalizedNickname = normalizeIrcNick(nickname);

  if (action === "add") {
    if (referees.some((referee) => normalizeIrcNick(referee) === normalizedNickname)) {
      return;
    }
    channel.referees = [...referees, nickname];
    return;
  }

  channel.referees = referees.filter((referee) => normalizeIrcNick(referee) !== normalizedNickname);
}

function removeJoinedChannel(channelName) {
  const normalizedChannel = normalizeChannel(channelName);
  const channel = joinedChannels.value.find((item) => item.id === channelId(channelName));
  if (!channel) return;

  if (activeChat.value === channel.id) activeChat.value = "bancho";
  joinedChannels.value = joinedChannels.value.filter((item) => item.id !== channel.id);
  delete channelMessages[channel.id];
  delete unreadChats[channel.id];
  delete lobbyStates[channel.id];
  delete lobbyContexts[channel.id];
}

function selectChat(chatId) {
  activeChat.value = chatId;
  unreadChats[chatId] = false;
  settingsOpen.value = false;
}

function playNotificationSound(filename = sound.value) {
  const url = getNotificationSoundUrl(filename);
  if (!url) return;

  if (notificationAudio && !notificationAudio.paused && !notificationAudio.ended) {
    pendingNotificationSound = filename;
    return;
  }

  notificationAudio = new Audio(url);
  notificationAudio.volume = 1;
  notificationAudio.onended = () => {
    notificationAudio = undefined;
    if (pendingNotificationSound) {
      const nextSound = pendingNotificationSound;
      pendingNotificationSound = undefined;
      playNotificationSound(nextSound);
    }
  };
  notificationAudio.play().catch(() => {
    notificationAudio = undefined;
    pendingNotificationSound = undefined;
  });
}

function previewNotificationSound(filename) {
  if (!soundEnabled.value) return;
  const url = getNotificationSoundUrl(filename);
  if (!url) return;

  if (notificationAudio) {
    notificationAudio.onended = null;
    notificationAudio.pause();
    notificationAudio = undefined;
  }
  pendingNotificationSound = undefined;

  const audio = new Audio(url);
  audio.volume = 1;
  audio.onended = () => {
    if (notificationAudio === audio) notificationAudio = undefined;
  };
  notificationAudio = audio;
  audio.play().catch(() => {
    if (notificationAudio === audio) notificationAudio = undefined;
  });
}

function toggleNotificationSoundMenu() {
  if (!soundEnabled.value) return;
  notificationSoundMenuOpen.value = !notificationSoundMenuOpen.value;
}

function selectNotificationSound(value) {
  if (!soundEnabled.value) return;
  sound.value = value;
  notificationSoundMenuOpen.value = false;
}

function closeNotificationSoundMenu(event) {
  if (!notificationSoundMenu.value?.contains(event.target)) {
    notificationSoundMenuOpen.value = false;
  }
}

function onNotificationSoundKeydown(event) {
  if (event.key === "Escape") notificationSoundMenuOpen.value = false;
}

function notificationChatTitle(chatId) {
  if (chatId === "bancho") return "BanchoBot";
  const directChat = directChats.value.find((chat) => chat.id === chatId);
  if (directChat) return directChat.label;
  const channel = joinedChannels.value.find((item) => item.id === chatId);
  return channel?.lobby?.name || channel?.label || chatId;
}

function notificationMatchesTrigger(trigger, message) {
  return trigger === "always" || messageHasHighlight(message.text, highlightWords.value);
}

function isAppFocused() {
  return document.visibilityState === "visible" && document.hasFocus();
}

function notifyIncomingMessage(chatId, message) {
  if (activeChat.value === chatId && isAppFocused()) return;
  if (ignoreBanchoBot.value && message.author?.toLowerCase() === "banchobot") return;

  if (soundEnabled.value && notificationMatchesTrigger(soundTrigger.value, message)) {
    playNotificationSound();
  }

  if (toastEnabled.value && notificationMatchesTrigger(toastTrigger.value, message)) {
    toast.add({
      severity: "info",
      summary: notificationChatTitle(chatId),
      detail: `${message.author || "Unknown"}: ${message.text}`,
      life: 5000,
    });
  }
}

function appendChatMessage(chatId, message, { notify = false } = {}) {
  const list = chatId === "bancho" ? banchoMessages.value : (channelMessages[chatId] ||= []);
  const normalizedMessage = { ...message, time: message.time || new Date().toISOString() };
  if (chatId !== "bancho" && joinedChannels.value.some((channel) => channel.id === chatId)) {
    const context = (lobbyContexts[chatId] ||= createMappoolChatContext());
    normalizedMessage.phaseAtMessage = advanceMappoolChatContext(context, normalizedMessage, { roomClosed: Boolean(roomClosedByChat[chatId]) });
  }
  list.push(normalizedMessage);
  if (activeChat.value !== chatId) {
    unreadChats[chatId] = true;
  }
  if (notify) notifyIncomingMessage(chatId, message);
}

function appendWhistleBotMessage(roomId, text) {
  const id = Number(roomId);
  if (!Number.isInteger(id) || id <= 0 || !text) return;
  appendChatMessage(lazerChatId(id), {
    id: `whistlebot-${Date.now()}-${Math.random()}`,
    author: "WhistleBot",
    text,
    time: new Date().toISOString(),
  });
}

function nextLazerLegacyRequestId() {
  lazerLegacySequence += 1;
  return `lazer-legacy-${Date.now()}-${lazerLegacySequence}`;
}

function sendLegacyLazerRequest(roomId, type, payload, { success, failure }) {
  const requestId = nextLazerLegacyRequestId();
  const command = {
    roomId,
    type,
    success,
    failure,
    timeoutId: window.setTimeout(() => {
      if (!pendingLazerLegacyCommands.delete(requestId)) return;
      appendWhistleBotMessage(roomId, failure);
    }, 12000),
  };
  pendingLazerLegacyCommands.set(requestId, command);
  if (sendLazerCommand(type, { room_id: roomId, ...payload }, requestId)) return true;
  pendingLazerLegacyCommands.delete(requestId);
  window.clearTimeout(command.timeoutId);
  appendWhistleBotMessage(roomId, failure);
  return false;
}

function normalizeLazerUserName(value) {
  return String(value || "")
    .trim()
    .replace(/^@+/, "")
    .replaceAll("_", " ")
    .toLowerCase();
}

async function resolveLazerLegacyUser(roomId, target) {
  const value = String(target || "")
    .trim()
    .replace(/^#(?=\d)/, "");
  if (!value) return null;
  const numericId = /^\d+$/.test(value) ? Number(value) : null;
  if (Number.isInteger(numericId) && numericId > 0) {
    const cached = getLazerCachedProfile(roomId, numericId) || lazerUserProfiles[numericId];
    if (cached?.username) return { userId: numericId, username: cached.username };
    try {
      const profile = await loadLazerCachedProfile(roomId, numericId, requestApi);
      if (profile) {
        lazerUserProfiles[numericId] = profile;
        return { userId: numericId, username: profile.username || `User ${numericId}` };
      }
    } catch {
      return { userId: numericId, username: `User ${numericId}` };
    }
    return { userId: numericId, username: `User ${numericId}` };
  }

  const normalized = normalizeLazerUserName(value);
  for (const [userId, profile] of Object.entries(lazerUserProfiles)) {
    if (normalizeLazerUserName(profile?.username) === normalized) return { userId: Number(userId), username: profile.username };
  }
  try {
    const profile = await loadLazerCachedProfileByUsername(roomId, value, requestApi);
    if (!profile) return null;
    lazerUserProfiles[profile.userId] = profile;
    return { userId: profile.userId, username: profile.username || value };
  } catch {
    return null;
  }
}

function lazerLegacyPlayerExists(roomId, userId) {
  const room = lazerRooms[lazerChatId(roomId)];
  return Array.isArray(room?.players) && room.players.some((player) => Number(player?.user_id) === Number(userId));
}

async function handleLazerLegacyCommand(roomId, input) {
  const match = String(input || "")
    .trim()
    .match(/^!mp\s+([a-z]+)(?:\s+([\s\S]*))?$/i);
  if (!match) return;
  const command = match[1].toLowerCase();
  const args = String(match[2] || "").trim();
  const failure = "The command could not be completed.";

  if (command === "lock" || command === "unlock") {
    const locked = command === "lock";
    sendLegacyLazerRequest(roomId, "lazer_set_lock_state", { locked }, { success: locked ? "Locked the match" : "Unlocked the match", failure });
    return;
  }

  if (command === "size") {
    if (!/^\d+$/.test(args)) return;
    const size = Number(args);
    sendLegacyLazerRequest(roomId, "lazer_change_room_settings", { max_participants: size }, { success: `Changed match to size ${size || "Infinite"}`, failure });
    return;
  }

  if (command === "set") {
    const setMatch = args.match(/^(\d+)\s+(\d+)$/);
    if (!setMatch) return;
    const mode = Number(setMatch[1]);
    const size = Number(setMatch[2]);
    const modes = { 0: ["head_to_head", "HeadToHead"], 2: ["team_versus", "TeamVs"] };
    if (mode === 1 || mode === 3) {
      appendWhistleBotMessage(roomId, "This team mode is not supported in Lazer.");
      return;
    }
    if (!modes[mode]) return;
    const [match_type, label] = modes[mode];
    sendLegacyLazerRequest(roomId, "lazer_change_room_settings", { match_type, max_participants: size }, { success: `Changed match settings to ${size || "Infinite"} slots, ${label}`, failure });
    return;
  }

  if (command === "move") {
    const moveMatch = args.match(/^(.+?)\s+(\d+)$/);
    if (!moveMatch || Number(moveMatch[2]) < 1) return;
    const slot = Number(moveMatch[2]);
    const user = await resolveLazerLegacyUser(roomId, moveMatch[1]);
    if (!user || !lazerLegacyPlayerExists(roomId, user.userId)) return appendWhistleBotMessage(roomId, "User not found");
    sendLegacyLazerRequest(
      roomId,
      "lazer_move_user",
      { user_id: user.userId, slot: slot - 1 },
      { success: `Moved ${user.username} into slot ${slot}`, failure: `Failed to move player to slot ${slot}` },
    );
    return;
  }

  if (command === "invite" || command === "addref" || command === "removeref") {
    const user = await resolveLazerLegacyUser(roomId, args);
    if (!user) return appendWhistleBotMessage(roomId, "User not found");
    const details =
      command === "invite"
        ? ["lazer_invite_player", `Invited ${user.username} to the room`]
        : command === "addref"
          ? ["lazer_add_referee", `Added ${user.username} to the match referees`]
          : ["lazer_remove_referee", `Removed ${user.username} from the match referees`];
    sendLegacyLazerRequest(roomId, details[0], { user_id: user.userId }, { success: details[1], failure });
    return;
  }

  if (command === "close") {
    sendLegacyLazerRequest(roomId, "lazer_close_room", {}, { success: "Closed the room", failure });
    return;
  }

  if (command === "start") {
    if (args && !/^\d+$/.test(args)) return;
    const countdown = args ? Number(args) : 0;
    sendLegacyLazerRequest(roomId, "lazer_start_match", { countdown }, { success: countdown ? `Started the match with a ${countdown} second countdown` : "Started the match", failure });
    return;
  }

  if (command === "kick") {
    const user = await resolveLazerLegacyUser(roomId, args);
    if (!user || !lazerLegacyPlayerExists(roomId, user.userId)) return appendWhistleBotMessage(roomId, "User not found");
    sendLegacyLazerRequest(roomId, "lazer_kick_player", { user_id: user.userId }, { success: `Kicked ${user.username} from the match`, failure });
    return;
  }

  if (command === "team") {
    const teamMatch = args.match(/^(.+?)\s+(red|blue)$/i);
    if (!teamMatch) return;
    const team = teamMatch[2].toLowerCase();
    const user = await resolveLazerLegacyUser(roomId, teamMatch[1]);
    if (!user || !lazerLegacyPlayerExists(roomId, user.userId)) return appendWhistleBotMessage(roomId, "User not found");
    sendLegacyLazerRequest(roomId, "lazer_move_user", { user_id: user.userId, team }, { success: `Moved ${user.username} to team ${team === "red" ? "Red" : "Blue"}`, failure });
    return;
  }

  if (command === "map") {
    if (!/^\d+$/.test(args) || Number(args) <= 0) return appendWhistleBotMessage(roomId, "Invalid map ID provided");
    try {
      const beatmap = await loadLazerCachedBeatmap(roomId, Number(args), requestApi);
      if (!beatmap) throw new Error("Map not found");
      const currentItem = getLazerCurrentPlaylistItem(lazerRooms[lazerChatId(roomId)]);
      sendLegacyLazerRequest(
        roomId,
        "lazer_edit_current_playlist_item",
        { beatmap_id: beatmap.beatmapId, ruleset_id: beatmap.rulesetId ?? currentItem?.ruleset_id ?? undefined },
        { success: `Changed beatmap to https://osu.ppy.sh/b/${beatmap.beatmapId} ${beatmap.artist} - ${beatmap.title}`, failure: "Invalid map ID provided" },
      );
    } catch {
      appendWhistleBotMessage(roomId, "Invalid map ID provided");
    }
    return;
  }

  if (command === "mods") {
    const room = lazerRooms[lazerChatId(roomId)];
    const modDefinitions = getAllLazerMultiplayerMods();
    const currentRulesetModDefinitions = getLazerMultiplayerMods(room);
    const rawTokens = args ? args.split(/\s+/).filter(Boolean) : [];
    if (rawTokens.length === 1 && rawTokens[0] === "0") {
      const currentItemId = Number(room?.current_playlist_item_id ?? room?.playlist_item_id ?? room?.state?.playlist_item_id);
      const currentItem =
        (Number.isInteger(currentItemId) && Array.isArray(room?.playlist) ? room.playlist.find((item) => Number(item?.id) === currentItemId) : null) || getLazerCurrentPlaylistItem(room);
      sendLegacyLazerRequest(
        roomId,
        "lazer_edit_current_playlist_item",
        {
          required_mods: [],
          allowed_mods: [],
          freestyle: false,
          ruleset_id: currentItem?.ruleset_id ?? undefined,
          beatmap_id: currentItem?.beatmap_id ?? undefined,
        },
        { success: "Updated match mods: disabled all mods", failure },
      );
      return;
    }
    const expandedTokens = [];
    const zeroWithFreemod = rawTokens.some((token) => token === "0") && rawTokens.every((token) => token === "0" || /^(?:fm|freemod)$/i.test(token));
    for (const rawToken of rawTokens) {
      if (zeroWithFreemod && rawToken === "0") continue;
      if (/^\d+$/.test(rawToken)) {
        const parsedMask = expandLegacyStableModMask(rawToken);
        if (!parsedMask) {
          appendWhistleBotMessage(roomId, `Mod ${rawToken} not found`);
          return;
        }
        expandedTokens.push(...parsedMask);
      } else {
        expandedTokens.push(rawToken);
      }
    }
    const tokens = normalizeMapMods(expandedTokens);
    const wantsFreemod = tokens.some((acronym) => acronym === "FM");
    const requested = tokens.filter((acronym) => acronym !== "FM");
    for (const acronym of requested) {
      const definition = modDefinitions.get(acronym);
      if (!definition) {
        appendWhistleBotMessage(roomId, `Mod ${acronym} not found`);
        return;
      }
      const currentRulesetDefinition = currentRulesetModDefinitions.get(acronym);
      const fullName = definition.Name || acronym;
      if (!currentRulesetDefinition) {
        appendWhistleBotMessage(roomId, `Mod ${fullName} is not supported in this ruleset`);
        return;
      }
      if (currentRulesetDefinition.ValidForMultiplayer !== true) {
        appendWhistleBotMessage(roomId, `Mod ${currentRulesetDefinition.Name || fullName} is not supported in multiplayer rooms`);
        return;
      }
    }

    const conflicts = [];
    for (let index = 0; index < requested.length; index += 1) {
      for (let otherIndex = index + 1; otherIndex < requested.length; otherIndex += 1) {
        const left = modDefinitions.get(requested[index]);
        const right = modDefinitions.get(requested[otherIndex]);
        const leftIncompatible = Array.isArray(left?.IncompatibleMods) && left.IncompatibleMods.map((mod) => String(mod).toUpperCase()).includes(requested[otherIndex]);
        const rightIncompatible = Array.isArray(right?.IncompatibleMods) && right.IncompatibleMods.map((mod) => String(mod).toUpperCase()).includes(requested[index]);
        if (leftIncompatible || rightIncompatible) conflicts.push(`${requested[index]} + ${requested[otherIndex]}`);
      }
    }
    if (conflicts.length) {
      appendWhistleBotMessage(roomId, formatLazerModConflictError(conflicts));
      return;
    }

    const requiredMods = requested.map((acronym) => ({ acronym }));
    const requiredConflicts = new Set(requested);
    for (const requiredAcronym of requested) {
      const requiredDefinition = modDefinitions.get(requiredAcronym);
      for (const incompatible of Array.isArray(requiredDefinition?.IncompatibleMods) ? requiredDefinition.IncompatibleMods : []) {
        requiredConflicts.add(String(incompatible).toUpperCase());
      }
    }
    for (const [acronym, definition] of modDefinitions) {
      if (requested.some((requiredAcronym) => Array.isArray(definition?.IncompatibleMods) && definition.IncompatibleMods.map((mod) => String(mod).toUpperCase()).includes(requiredAcronym))) {
        requiredConflicts.add(acronym);
      }
    }
    const allowedMods = wantsFreemod
      ? [...modDefinitions.values()]
          .filter((mod) => mod?.ValidForMultiplayer && mod?.ValidForMultiplayerAsFreeMod)
          .map((mod) => String(mod.Acronym).toUpperCase())
          .filter((acronym) => !requiredConflicts.has(acronym))
          .map((acronym) => ({ acronym }))
      : [];
    const enabledModNames = requested.map((acronym) => modDefinitions.get(acronym)?.Name || acronym);
    const summaryParts = [];
    if (enabledModNames.length) summaryParts.push(`enabled ${enabledModNames.join(", ")}`);
    summaryParts.push(`${wantsFreemod ? "enabled" : "disabled"} Freemod`);
    const currentItemId = Number(room?.current_playlist_item_id ?? room?.playlist_item_id ?? room?.state?.playlist_item_id);
    const currentItem =
      (Number.isInteger(currentItemId) && Array.isArray(room?.playlist) ? room.playlist.find((item) => Number(item?.id) === currentItemId) : null) || getLazerCurrentPlaylistItem(room);
    sendLegacyLazerRequest(
      roomId,
      "lazer_edit_current_playlist_item",
      {
        required_mods: requiredMods,
        allowed_mods: allowedMods,
        freestyle: false,
        ruleset_id: currentItem?.ruleset_id ?? undefined,
        beatmap_id: currentItem?.beatmap_id ?? undefined,
      },
      { success: `Updated match mods: ${summaryParts.join(", ")}`, failure },
    );
    return;
  }

  if (command === "abort") {
    if (nowPlayingByLobby[lazerChatId(roomId)]?.status !== "playing") return appendWhistleBotMessage(roomId, "The match is not in progress");
    sendLegacyLazerRequest(roomId, "lazer_abort_match", {}, { success: "Aborted the match", failure });
    return;
  }

  if (command === "name") {
    if (!args) return;
    sendLegacyLazerRequest(roomId, "lazer_change_room_settings", { name: args }, { success: `Room name updated to "${args}"`, failure });
  }
}

function downloadChatHistory() {
  const chatId = activeChat.value;
  const messages = chatId === "bancho" ? banchoMessages.value : channelMessages[chatId] || [];
  const formatTimestamp = (value) => {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "00:00:00";
    return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false });
  };
  const lines = messages.map((message) => `[${formatTimestamp(message.time)}] ${message.author || (message.type === "system" ? "System" : "Unknown")}: ${String(message.text || "")}`);
  const blob = new Blob([`${lines.join("\n")}\n`], { type: "text/plain;charset=utf-8" });
  const link = document.createElement("a");
  const filename =
    String(activeChatTitle.value || chatId || "chat-history")
      .trim()
      .replace(/[^a-z0-9._-]+/gi, "_")
      .replace(/^_+|_+$/g, "") || "chat-history";
  link.href = URL.createObjectURL(blob);
  link.download = `${filename}-chat-history.txt`;
  link.click();
  URL.revokeObjectURL(link.href);
}

function localNowPlayingMap(map, pickedBy = null) {
  return {
    ...map,
    title: map.title || map.name,
    diff: map.diff || map.version,
    mapperName: map.mapperName || map.author || "",
    pickedBy,
    status: "waiting",
    error: null,
  };
}

function setNowPlaying(chatId, map) {
  if (!chatId) return;
  nowPlayingByLobby[chatId] = map;
}

const MOD_ALIASES = Object.freeze({
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
});
const LEGACY_STABLE_MOD_MASKS = Object.freeze({
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
});
const MODS_WITHOUT_STAR_RATING_EFFECT = new Set(["FM", "NF", "RX", "SO", "AP", "SD"]);

function expandLegacyStableModMask(value) {
  const mask = Number(value);
  if (!Number.isSafeInteger(mask) || mask <= 0) return null;
  let remaining = mask;
  const expanded = [];
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

function normalizeMapMods(value) {
  const values = Array.isArray(value) ? value : String(value || "").split(/\s*,\s*|\s+/);
  return values
    .map((mod) => String(mod).trim())
    .filter(Boolean)
    .filter((mod) => !/^(?:enabled|disabled|none)$/i.test(mod))
    .map((mod) => MOD_ALIASES[mod.toLowerCase()] || mod.toUpperCase())
    .filter((mod, index, mods) => mods.indexOf(mod) === index);
}

function getLazerMultiplayerMods(room) {
  const currentItem = getLazerCurrentPlaylistItem(room);
  const rulesetId = Number(currentItem?.ruleset_id ?? room?.ruleset_id);
  const ruleset = (Array.isArray(modsByRuleset) ? modsByRuleset : []).find((entry) => Number(entry?.RulesetID) === rulesetId) || modsByRuleset?.[0];
  const result = new Map();
  for (const mod of Array.isArray(ruleset?.Mods) ? ruleset.Mods : []) {
    const acronym = String(mod?.Acronym || "")
      .trim()
      .toUpperCase();
    if (acronym && !result.has(acronym)) result.set(acronym, mod);
  }
  return result;
}

function getAllLazerMultiplayerMods() {
  const result = new Map();
  for (const ruleset of Array.isArray(modsByRuleset) ? modsByRuleset : []) {
    for (const mod of Array.isArray(ruleset?.Mods) ? ruleset.Mods : []) {
      const acronym = String(mod?.Acronym || "")
        .trim()
        .toUpperCase();
      if (acronym && !result.has(acronym)) result.set(acronym, mod);
    }
  }
  return result;
}

function formatLazerModConflictError(conflicts) {
  const names = [...new Set(conflicts)].join(", ");
  return `Mods ${names} conflict with each other.`;
}

async function refreshNowPlayingMapAttributes(chatId, map) {
  if (!map || !chatId || !map.baseBeatmapLoaded) return;
  const lobby = lobbyStates[chatId];
  const mods = normalizeMapMods(lobby?.activeMods || map.mods);
  const baseDuration = Number(map.baseTotalSeconds ?? map.totalSeconds);
  const baseStarRating = Number(map.baseStarRating ?? map.starRating);
  const hasDoubleTime = mods.includes("DT");

  if (Number.isFinite(baseStarRating)) {
    map.starRating = baseStarRating;
  }

  if (Number.isFinite(baseDuration) && baseDuration > 0) {
    const adjustedDuration = hasDoubleTime ? baseDuration * 0.67 : baseDuration;
    map.totalSeconds = adjustedDuration;
  }

  const beatmapId = map.beatmapId || map.id;
  if (!beatmapId) return;
  const requestKey = `${chatId}:${beatmapId}:${mods.join(",")}`;
  const sameModsAsLastRequest = map.attributesModsKey === requestKey;
  if (!sameModsAsLastRequest) {
    map.attributesRequestVersion = (map.attributesRequestVersion || 0) + 1;
    map.attributesModsKey = requestKey;
  }

  const affectingMods = mods.filter((mod) => !MODS_WITHOUT_STAR_RATING_EFFECT.has(mod));
  if (!affectingMods.length || sameModsAsLastRequest) return;

  const requestVersion = map.attributesRequestVersion;

  try {
    const response = await requestApi(`/beatmaps/${beatmapId}/attributes`, "POST", { mods: affectingMods });
    const starRating = Number(response?.attributes?.star_rating ?? response?.star_rating);
    if (Number.isFinite(starRating) && nowPlayingByLobby[chatId] === map && map.attributesRequestVersion === requestVersion) {
      map.starRating = starRating;
    }
  } catch {
    // Keep the base map data when modded attributes are unavailable.
  }
}

watch(
  () => [activeChat.value, activeLobbyState.value?.activeMods, nowPlayingByLobby[activeChat.value]?.beatmapId],
  () => {
    const chatId = activeChat.value;
    const map = nowPlayingByLobby[chatId];
    if (map?.baseBeatmapLoaded) refreshNowPlayingMapAttributes(chatId, map);
  },
);

async function loadManualNowPlayingMap(chatId, beatmap) {
  const beatmapId = beatmap?.beatmapId || beatmap?.id;
  if (!beatmapId) return;
  const previousMap = nowPlayingByLobby[chatId];
  if (!previousMap) {
    setNowPlaying(chatId, { ...beatmap, status: "waiting", error: "Loading map…" });
  }
  try {
    const info = await requestApi(`/beatmaps/${beatmapId}`);
    const mapperName = formatBeatmapOwners(info);
    const nextMap = {
      ...beatmap,
      title: info.title || info.beatmapset?.title || "Unknown title",
      artist: info.artist || info.beatmapset?.artist || "Unknown artist",
      diff: info.version || "",
      mapperName,
      starRating: info.difficulty_rating ?? null,
      totalSeconds: info.total_length ?? null,
      beatmapsetId: info.beatmapset_id || info.beatmapset?.id || null,
      rulesetId: info.mode_int ?? info.ruleset_id ?? beatmap.rulesetId ?? beatmap.ruleset_id ?? beatmap.mode,
      pickedBy: activeLobbyState.value?.nextPickTeam || null,
      pickedByTeam:
        activeLobbyState.value?.nextPickTeam && normalizeIrcNick(activeLobbyState.value.nextPickTeam) === normalizeIrcNick(activeLobbyState.value.teamRed)
          ? "red"
          : activeLobbyState.value?.nextPickTeam && normalizeIrcNick(activeLobbyState.value.nextPickTeam) === normalizeIrcNick(activeLobbyState.value.teamBlue)
            ? "blue"
            : null,
      status: "waiting",
      error: null,
    };
    nextMap.baseTotalSeconds = nextMap.totalSeconds;
    nextMap.baseStarRating = nextMap.starRating;
    nextMap.baseBeatmapLoaded = true;
    setNowPlaying(chatId, nextMap);
    refreshNowPlayingMapAttributes(chatId, nextMap);
  } catch (error) {
    if (!previousMap) {
      setNowPlaying(chatId, { ...beatmap, status: "waiting", error: error.message || "Unable to load map" });
    }
  }
}

function handleNowPlayingEvent(chatId, text) {
  const normalized = String(text || "").trim();
  if (/^Host is changing map\.\.\.$/i.test(normalized)) {
    delete nowPlayingByLobby[chatId];
    return;
  }
  if (/^The match has started!?$/i.test(normalized) && nowPlayingByLobby[chatId]) {
    nowPlayingByLobby[chatId].status = "playing";
    nowPlayingByLobby[chatId].startTimestamp = Date.now();
    nowPlayingByLobby[chatId].progressAborted = false;
  }
  if (/^(?:Aborted the match|The match has been aborted)!?$/i.test(normalized) && nowPlayingByLobby[chatId]) {
    nowPlayingByLobby[chatId].status = "waiting";
    nowPlayingByLobby[chatId].progressAborted = true;
  }
  if (/^The match has finished!?$/i.test(normalized) && nowPlayingByLobby[chatId]) {
    nowPlayingByLobby[chatId].status = "finished";
    window.setTimeout(() => {
      if (nowPlayingByLobby[chatId]?.status === "finished") {
        nowPlayingByLobby[chatId] = null;
      }
    }, 3000);
  }
}

function markRoomClosed(chatId) {
  if (roomClosedByChat[chatId]) return;
  roomClosedByChat[chatId] = true;
  const context = (lobbyContexts[chatId] ||= createMappoolChatContext());
  context.phase = "finished";
  delete nowPlayingByLobby[chatId];
  clearCachedLobbyProfiles(chatId);
  const channel = joinedChannels.value.find((item) => item.id === chatId);
  if (channel) {
    channel.closed = true;
    if (channel.lobby) channel.lobby.status = "closed";
  }
  appendChatMessage(chatId, {
    id: nextId++,
    type: "system",
    text: "Room closed",
  });
}

function markLazerRoomClosed(chatId, { clearResources = false, systemMessage = "Room closed" } = {}) {
  const room = lazerRooms[chatId];
  if (!room || room.closed) return;

  room.closed = true;
  delete lazerCompletedBeatmaps[Number(room.room_id)];
  delete lazerStyleChangedUsers[Number(room.room_id)];
  for (const key of Object.keys(lazerStyleBeatmaps)) {
    if (key.startsWith(`${room.room_id}:`)) delete lazerStyleBeatmaps[key];
  }
  clearLazerPlaylistRestore(Number(room.room_id));
  clearLazerCountdown(room.room_id);
  if (clearResources) clearLazerRoomResourceCache(room.room_id);
  appendChatMessage(chatId, {
    id: nextId++,
    type: "system",
    text: systemMessage,
  });
}

function requestLazerInviteJoin(roomId) {
  const id = Number(roomId);
  if (!Number.isInteger(id) || id <= 0) return false;
  const chatId = lazerChatId(id);
  if (lazerRooms[chatId] && !lazerRooms[chatId].closed) {
    activeChat.value = chatId;
    return true;
  }
  if (pendingLazerInviteJoins.has(id)) return true;
  pendingLazerInviteJoins.add(id);
  const sent = joinLazerRoom(id);
  if (!sent) {
    pendingLazerInviteJoins.delete(id);
    toast.add({ severity: "error", summary: "Room join failed", detail: "Unable to join the invited lazer room.", life: 5000 });
    return false;
  }
  showJoinToast("info", "Room invitation", "Joining the invited lazer room...");
  return true;
}

function joinChannel(channel) {
  if (channel.type === "lazer") {
    const roomId = Number(channel.roomId);
    if (!Number.isInteger(roomId) || roomId <= 0 || pendingJoinChannel.value) return;
    const chatId = lazerChatId(roomId);
    if (lazerRooms[chatId]) {
      activeChat.value = chatId;
      addChannelDialogOpen.value = false;
      return;
    }
    pendingJoinChannel.value = { type: "lazer", id: chatId, label: channel.label };
    showJoinToast("info", "Connecting", "Joining the lazer room...");
    const sent = joinLazerRoom(roomId);
    if (!sent) {
      failPendingJoin("Unable to send the join request. Please reconnect and try again.");
      return;
    }
    pendingJoinTimeout = window.setTimeout(() => failPendingJoin("The lazer room could not be joined."), 10000);
    return;
  }

  const label = channel.label || channel.id;
  const joinedChannelId = channelId(label);
  if (!joinedChannelId || pendingJoinChannel.value) return;

  const existingChannel = joinedChannels.value.find((item) => item.id === joinedChannelId);
  if (existingChannel) {
    activeChat.value = existingChannel.id;
    addChannelDialogOpen.value = false;
    return;
  }

  pendingJoinChannel.value = { id: joinedChannelId, label };
  showJoinToast("info", "Connecting", "Joining the multiplayer lobby...");
  const sent = joinServerChannel(label);
  if (!sent) {
    failPendingJoin("Unable to send the join request. Please reconnect and try again.");
    return;
  }
  pendingJoinTimeout = window.setTimeout(() => {
    failPendingJoin();
  }, 10000);
}

function showJoinToast(severity, summary, detail) {
  toast.removeGroup(loginToastGroup);
  toast.add({
    group: loginToastGroup,
    severity,
    summary,
    detail,
    ...(severity === "info" ? { sticky: true } : { life: 5000 }),
  });
}

function clearPendingJoin() {
  if (pendingJoinTimeout) {
    window.clearTimeout(pendingJoinTimeout);
    pendingJoinTimeout = undefined;
  }
  pendingJoinChannel.value = null;
}

function failPendingJoin(detail = "The lobby does not exist or you are not a referee in it. Please try again or enter another lobby.") {
  clearPendingJoin();
  showJoinToast("error", "Join failed", detail);
}

function requestPartChannel(channelName) {
  const normalizedChannelId = channelId(channelName);
  pendingPartChannels.add(normalizedChannelId);
  const sent = partServerChannel(channelName);
  if (!sent) pendingPartChannels.delete(normalizedChannelId);
  return sent;
}

function closeActiveChat(chatId = activeChat.value) {
  if (chatId === "bancho") return;

  if (directChats.value.some((chat) => chat.id === chatId)) {
    removeDirectChat(chatId);
    return;
  }

  const lazerRoom = lazerRooms[chatId];
  if (lazerRoom) {
    leaveLazerRoom(lazerRoom.room_id);
    delete lazerStyleChangedUsers[Number(lazerRoom.room_id)];
    for (const key of Object.keys(lazerStyleBeatmaps)) {
      if (key.startsWith(`${lazerRoom.room_id}:`)) delete lazerStyleBeatmaps[key];
    }
    clearLazerPlaylistRestore(Number(lazerRoom.room_id));
    delete lazerRooms[chatId];
    delete lazerLobbyStates[chatId];
    delete channelMessages[chatId];
    delete unreadChats[chatId];
    if (activeChat.value === chatId) activeChat.value = "bancho";
    return;
  }

  const index = joinedChannels.value.findIndex((channel) => channel.id === chatId);
  const channel = joinedChannels.value[index];
  if (channel) requestPartChannel(channel.label);
  if (index !== -1) joinedChannels.value.splice(index, 1);
  delete channelMessages[chatId];
  delete unreadChats[chatId];
  delete roomClosedByChat[chatId];
  delete lobbyContexts[chatId];

  activeChat.value = "bancho";
  unreadChats.bancho = false;
  settingsOpen.value = false;
}

function handleSend(text) {
  if (activeChatKind.value === "lazer") {
    const command = text.trim();
    if (/^\/savelog$/i.test(command)) {
      downloadChatHistory();
      return;
    }

    // Legacy !mp commands are deliberately local: even unknown commands must
    // not leak into the lazer room or its history.
    if (command.startsWith("!")) {
      const roomId = Number(activeLazerRoom.value?.room_id);
      if (Number.isInteger(roomId) && roomId > 0 && !activeLazerRoom.value?.closed) {
        void handleLazerLegacyCommand(roomId, command);
      }
      return;
    }

    const rollMatch = command.match(/^\/roll(?:\s+(\d+))?$/i);
    if (rollMatch) {
      const roomId = Number(activeLazerRoom.value?.room_id);
      if (!Number.isInteger(roomId) || roomId <= 0 || activeLazerRoom.value?.closed) return;
      const rollMax = rollMatch[1] ? Number(rollMatch[1]) : 100;
      if (!Number.isSafeInteger(rollMax) || rollMax < 2 || rollMax > 100) {
        appendChatMessage(lazerChatId(roomId), {
          id: `roll-usage-${Date.now()}-${Math.random()}`,
          type: "system",
          author: "system",
          text: "Usage: /roll [2-100]",
          time: new Date().toISOString(),
          isRoll: true,
        });
        return;
      }
      if (!rollLazer(roomId, rollMax)) {
        toast.add({ severity: "error", summary: "Roll failed", detail: "The server connection is not available.", life: 4000 });
      }
      return;
    }

    let messageText = text;
    let isAction = false;
    const meMatch = command.match(/^\/me(?:\s+(.+))?$/i);
    if (meMatch) {
      messageText = meMatch[1]?.trim() || "";
      if (!messageText) return;
      isAction = true;
    } else if (/^\/np$/i.test(command)) {
      messageText = "is listening to [https://github.com/FeeFort/WhistleRef WhistleRef]";
      isAction = true;
    }

    const roomId = Number(activeLazerRoom.value?.room_id);
    if (!Number.isInteger(roomId) || roomId <= 0 || activeLazerRoom.value?.closed) return;
    const lazerLobby = activeLazerLobbyState.value;
    const resolvedText = lazerLobby ? formatLobbyTemplate(messageText, getLazerLobbyTemplateValues(roomId, lazerLobby)) : messageText;
    queueLazerChatMessage(roomId, resolvedText, isAction);
    return;
  }
  const channel = activeChat.value === "bancho" ? "BanchoBot" : activeDirectChat.value?.label || joinedChannels.value.find((item) => item.id === activeChat.value)?.label;
  if (!channel) return;
  const resolvedText = activeLobbyState.value ? formatLobbyTemplate(text, getLobbyTemplateValues(activeLobbyState.value)) : text;
  if (!sendServerMessage(channel, resolvedText)) return;
  const lobbyPlayer = activeLobbyState.value?.players?.find((player) => normalizeIrcNick(player.username) === normalizeIrcNick(currentUser.value));
  appendChatMessage(activeChat.value, {
    id: nextId++,
    author: currentUser.value,
    text: resolvedText,
    time: new Date().toISOString(),
    team: lobbyPlayer?.team || null,
  });
}

function queueLazerChatMessage(roomId, text, isAction = false) {
  const id = Number(roomId);
  const messageText = String(text || "").trim();
  if (!Number.isInteger(id) || id <= 0 || !messageText) return false;

  const chatId = lazerChatId(id);
  const list = (channelMessages[chatId] ||= []);
  const pendingMessage = {
    id: `pending-${Date.now()}-${Math.random()}`,
    author: currentUser.value,
    text: messageText,
    time: new Date().toISOString(),
    isAction,
    pending: true,
  };
  list.push(pendingMessage);
  pendingLazerMessages.push({ chatId, messageId: pendingMessage.id });
  if (sendLazerChatMessage(id, messageText, isAction)) return true;

  const index = list.indexOf(pendingMessage);
  if (index !== -1) list.splice(index, 1);
  const pendingIndex = pendingLazerMessages.findIndex((item) => item.messageId === pendingMessage.id);
  if (pendingIndex !== -1) pendingLazerMessages.splice(pendingIndex, 1);
  toast.add({ severity: "error", summary: "Message failed", detail: "The chat connection is not available.", life: 4000 });
  return false;
}

function formatLazerCountdownDuration(seconds) {
  const remaining = Math.max(0, Math.floor(Number(seconds) || 0));
  const minutes = Math.floor(remaining / 60);
  const remainder = remaining % 60;
  const parts = [];
  if (minutes > 0) parts.push(`${minutes} minute${minutes === 1 ? "" : "s"}`);
  if (remainder > 0) parts.push(`${remainder} second${remainder === 1 ? "" : "s"}`);
  return parts.join(" and ") || "0 seconds";
}

function clearLazerCountdown(roomId) {
  const id = Number(roomId);
  const timeouts = lazerCountdownTimeouts.get(id) || [];
  timeouts.forEach((timeoutId) => window.clearTimeout(timeoutId));
  lazerCountdownTimeouts.delete(id);
  delete lazerCountdowns[id];
}

function clearLazerMatchStartCountdown(roomId) {
  const id = Number(roomId);
  const countdown = lazerMatchStartCountdowns[id];
  if (countdown?.timeoutId) window.clearTimeout(countdown.timeoutId);
  delete lazerMatchStartCountdowns[id];
}

function startLazerCountdown(roomId, duration, countdownId = null, countdownType = "local") {
  const id = Number(roomId);
  const totalSeconds = Math.floor(Number(duration));
  if (!Number.isInteger(id) || id <= 0 || !Number.isFinite(totalSeconds) || totalSeconds < 1) return;

  if (countdownType === "match_start") {
    if (countdownId !== null && lazerMatchStartCountdowns[id]?.countdownId === countdownId) return;
    clearLazerMatchStartCountdown(id);
    const endsAt = Date.now() + totalSeconds * 1000;
    lazerMatchStartCountdowns[id] = {
      endsAt,
      countdownId,
      timeoutId: window.setTimeout(
        () => {
          if (lazerMatchStartCountdowns[id]?.endsAt === endsAt) clearLazerMatchStartCountdown(id);
        },
        totalSeconds * 1000 + 100,
      ),
    };
    return;
  }

  if (countdownId !== null && lazerCountdowns[id]?.countdownId === countdownId) return;

  clearLazerCountdown(id);
  const endsAt = Date.now() + totalSeconds * 1000;
  const scheduledTimeouts = [];
  lazerCountdowns[id] = { endsAt, countdownId };
  lazerCountdownTimeouts.set(id, scheduledTimeouts);
  queueLazerChatMessage(id, `Countdown ends in ${formatLazerCountdownDuration(totalSeconds)}`);

  const announcements = new Set();
  for (let seconds = 60; seconds < totalSeconds; seconds += 60) announcements.add(seconds);
  [30, 10, 5, 4, 3, 2, 1].forEach((seconds) => {
    if (seconds < totalSeconds) announcements.add(seconds);
  });

  [...announcements]
    .sort((left, right) => right - left)
    .forEach((secondsRemaining) => {
      scheduledTimeouts.push(
        window.setTimeout(
          () => {
            if (lazerCountdowns[id]?.endsAt !== endsAt) return;
            queueLazerChatMessage(id, `Countdown ends in ${formatLazerCountdownDuration(secondsRemaining)}`);
          },
          (totalSeconds - secondsRemaining) * 1000,
        ),
      );
    });

  scheduledTimeouts.push(
    window.setTimeout(() => {
      if (lazerCountdowns[id]?.endsAt !== endsAt) return;
      clearLazerCountdown(id);
      queueLazerChatMessage(id, "Countdown finished");
    }, totalSeconds * 1000),
  );
}

function abortLazerCountdown(roomId, countdownType = "local") {
  const id = Number(roomId);
  if (countdownType === "match_start") clearLazerMatchStartCountdown(id);
  if (!lazerCountdowns[id]) return;
  clearLazerCountdown(id);
  queueLazerChatMessage(id, "Countdown aborted");
}

function abortActiveLazerTimer(roomId) {
  const id = Number(roomId);
  if (activeLazerMatchStartSeconds.value > 0) {
    if (stopLazerMatchCountdown(id)) clearLazerMatchStartCountdown(id);
    return;
  }
  abortLazerCountdown(id);
}

function updateActiveLobbyPlayers(update) {
  const channel = joinedChannels.value.find((item) => item.id === activeChat.value);
  const lobby = channel?.lobby;
  if (!channel || !lobby || !Array.isArray(lobby.players)) return;
  const nextLobby = {
    ...lobby,
    players: lobby.players.map((player) => ({ ...player })),
  };
  update(nextLobby.players, nextLobby);
  channel.lobby = nextLobby;
  lobbyStates[activeChat.value] = nextLobby;
}

function moveLobbyPlayer({ username, slot }) {
  if (!activeLobbyState.value || roomClosedByChat[activeChat.value]) return;
  const targetSlot = Number(slot);
  if (!Number.isInteger(targetSlot) || targetSlot < 1 || targetSlot > 16) return;
  const player = activeLobbyState.value.players.find((item) => normalizeIrcNick(item.username) === normalizeIrcNick(username));
  const target = activeLobbyState.value.players.find((item) => Number(item.slot) === targetSlot);
  if (!player || target || activeLobbyState.value.slotLocks?.[targetSlot - 1]) return;
  updateActiveLobbyPlayers((players) => {
    const current = players.find((item) => normalizeIrcNick(item.username) === normalizeIrcNick(username));
    if (current) current.slot = targetSlot;
  });
  handleCommand("!mp move " + username + " " + targetSlot);
}

function toggleLobbyPlayerTeam({ username, team }) {
  if (activeLobbyState.value?.status === "closed" || !["red", "blue"].includes(team)) return;
  const player = activeLobbyState.value?.players?.find((item) => normalizeIrcNick(item.username) === normalizeIrcNick(username));
  if (!player || !player.team) return;
  updateActiveLobbyPlayers((players) => {
    const current = players.find((item) => normalizeIrcNick(item.username) === normalizeIrcNick(username));
    if (current) current.team = team;
  });
  handleCommand("!mp team " + username + " " + team);
}

function kickLobbyPlayer({ username }) {
  if (!activeLobbyState.value || roomClosedByChat[activeChat.value]) return;
  handleCommand("!mp kick " + username);
}

function setLobbyHost({ username }) {
  if (!activeLobbyState.value || roomClosedByChat[activeChat.value]) return;
  const player = activeLobbyState.value.players.find((item) => normalizeIrcNick(item.username) === normalizeIrcNick(username));
  if (!player) return;
  updateActiveLobbyPlayers((players, lobby) => {
    players.forEach((item) => {
      item.isHost = normalizeIrcNick(item.username) === normalizeIrcNick(username);
    });
    lobby.host = username;
  });
  handleCommand("!mp host " + username);
}

function sendLobbySetup(command) {
  if (!activeLobbyState.value || roomClosedByChat[activeChat.value]) return;
  handleCommand(command);
}

function openLobbySetup() {
  if (activeChatKind.value === "lazer") {
    if (!activeLazerRoom.value || activeLazerRoom.value.closed) return;
    lobbySetupDialogOpen.value = true;
    return;
  }
  if (!activeLobbyState.value || roomClosedByChat[activeChat.value]) return;
  lobbySetupDialogOpen.value = true;
}

function applyLazerLobbySetup(settings) {
  if (!activeLazerRoom.value || activeLazerRoom.value.closed || lazerLobbySetupLoading.value) return;
  const roomId = Number(activeLazerRoom.value.room_id);
  const maxParticipants = Number(settings.max_participants);
  const matchType = settings.match_type;
  const queueMode = settings.queue_mode;
  pendingLazerLobbySettings.value = { roomId, maxParticipants, matchType, queueMode };
  lazerLobbySetupLoading.value = true;
  const sent = changeLazerRoomSettings(roomId, {
    queue_mode: queueMode,
    match_type: matchType,
    max_participants: maxParticipants,
  });
  if (!sent) {
    pendingLazerLobbySettings.value = null;
    lazerLobbySetupLoading.value = false;
    toast.add({
      severity: "error",
      summary: "Update failed",
      detail: "Unable to send lazer lobby settings.",
      life: 5000,
    });
    return;
  }
}

function handleCommand(command) {
  handleSend(command);
  if (activeChat.value === "bancho") return;
  if (/^!mp\s+abort\b/i.test(command.trim()) && nowPlayingByLobby[activeChat.value]) {
    nowPlayingByLobby[activeChat.value].status = "waiting";
    nowPlayingByLobby[activeChat.value].progressAborted = true;
  }
  if (!/^!mp\s+close\b/i.test(command.trim())) return;

  const channel = joinedChannels.value.find((item) => item.id === activeChat.value);
  if (!channel) return;

  markRoomClosed(channel.id);
  requestPartChannel(channel.label);
}

function handleCreateLobby(payload) {
  if (payload.mode === "lazer") {
    pendingLazerLobbySeed.value = payload.lobby ? { ...payload.lobby, lazerSettings: payload.lazer } : null;
    if (!makeLazerRoom(payload.lazer)) pendingLazerLobbySeed.value = null;
    return;
  }

  pendingLobbySeed.value = payload.lobby || null;
  pendingLobbyCreatedViaApp.value = Boolean(payload.lobby);
  handleCommand(payload.command);
}

async function loadLazerMatchResult(room, playlistItemId, matchTeams = new Map(), mappoolSlotId = null) {
  const roomId = Number(room?.room_id);
  const itemId = Number(playlistItemId);
  if (!Number.isInteger(roomId) || roomId <= 0 || !Number.isInteger(itemId) || itemId <= 0) return;
  try {
    const response = await requestApi(`/rooms/${roomId}/playlist/${itemId}/scores`);
    const scores = Array.isArray(response?.scores) ? response.scores : [];
    if (!scores.length) return;

    const chatId = lazerChatId(roomId);
    const appendResultMessage = (text) => {
      appendChatMessage(chatId, {
        id: nextId++,
        type: "system",
        text: String(text),
      });
    };

    const playersById = new Map((room.players || []).map((player) => [Number(player.user_id), player]));
    const teamPlayers = { red: [], blue: [] };
    for (const score of scores) {
      const player = playersById.get(Number(score.user_id));
      const team = matchTeams.get(Number(score.user_id)) || player?.team;
      if (team !== "red" && team !== "blue") continue;
      teamPlayers[team].push({
        userId: Number(score.user_id),
        username: score.user?.username || player?.username || "",
        team,
        score: Number(score.total_score) || 0,
        accuracy: Number(score.accuracy) || 0,
        combo: Number(score.max_combo) || 0,
        misses: Number(score.statistics?.miss) || 0,
        mods: Array.isArray(score.mods) ? score.mods.map((mod) => String(mod.acronym || mod)).filter(Boolean) : [],
      });

      const accuracy = Number(score.accuracy);
      const accuracyText = Number.isFinite(accuracy) ? ` | ${(accuracy * 100).toFixed(2)}% acc` : "";
      const combo = Number(score.max_combo);
      const comboText = Number.isFinite(combo) ? ` | ${combo}x combo` : "";
      const mods = Array.isArray(score.mods) ? score.mods.map((mod) => String(mod.acronym || mod)).filter(Boolean) : [];
      const modsText = mods.length ? ` | ${mods.join("+")}` : "";
      const teamLabel = team === "red" ? "Red" : "Blue";
      appendResultMessage(`${score.user?.username || player?.username || `User #${score.user_id}`} [${teamLabel}]: ${Number(score.total_score) || 0}${accuracyText}${comboText}${modsText}`);
    }
    const average = (values) => (values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0);
    const makeTeam = (team) => ({
      score: team.reduce((sum, player) => sum + player.score, 0),
      accuracy: average(team.map((player) => player.accuracy)),
      combo: average(team.map((player) => player.combo)),
      misses: team.reduce((sum, player) => sum + player.misses, 0),
      players: team,
    });
    const resultRoom = { teamRed: makeTeam(teamPlayers.red), teamBlue: makeTeam(teamPlayers.blue) };
    const baseRedScore = resultRoom.teamRed.score;
    const baseBlueScore = resultRoom.teamBlue.score;
    let redScore = baseRedScore;
    let blueScore = baseBlueScore;
    let winnerTeam = redScore === blueScore ? null : redScore > blueScore ? "red" : "blue";
    const pool = getLazerActivePool(lazerChatId(roomId));
    const completedBeatmapId = Number(room?.playlist?.find((item) => Number(item.id) === itemId)?.beatmap_id) || Number(scores[0]?.beatmap_id);
    const slot = pool?.slots?.find((item) => item.slotId === mappoolSlotId) || pool?.slots?.find((item) => Number(item.beatmapId) === completedBeatmapId);
    const condition = slot?.winCondition;
    const conditionTemplate = String(condition?.template || "score")
      .trim()
      .toLowerCase();
    // Built-in conditions read directly from the Lazer /scores response.
    // Only a Custom condition evaluates user-provided code.
    const calculated =
      conditionTemplate === "custom"
        ? await evaluateLazerWinCondition(condition?.source, resultRoom)
        : calculateLazerApiResult(conditionTemplate, resultRoom, condition?.reverse === true, pool?.freeModMultipliers || {});
    for (const message of calculated?.systemMessages || []) appendResultMessage(message);
    if (calculated?.result) {
      redScore = calculated.result.red;
      blueScore = calculated.result.blue;
      winnerTeam = calculated.winner === "tie" ? null : calculated.winner;
    }
    const state = lazerLobbyStates[chatId] || (lazerLobbyStates[chatId] = {});
    const previousRedScore = Number(state.teamAScore) || 0;
    const previousBlueScore = Number(state.teamBScore) || 0;
    const winningScore = Number.isInteger(Number(state.bestOf)) && Number(state.bestOf) > 0 ? Math.ceil(Number(state.bestOf) / 2) : null;
    const nextPickTeam = winnerTeam === "red" ? state.teamBName : winnerTeam === "blue" ? state.teamAName : state.nextPickTeam;

    state.lastPlay = {
      teamRedScore: redScore,
      teamBlueScore: blueScore,
      scoreDifference: Math.abs(redScore - blueScore),
      winnerTeam,
      metric: conditionTemplate,
    };
    state.nextPickTeam = nextPickTeam;
    if (winnerTeam === "red" && (!winningScore || previousRedScore < winningScore)) state.teamAScore = previousRedScore + 1;
    if (winnerTeam === "blue" && (!winningScore || previousBlueScore < winningScore)) state.teamBScore = previousBlueScore + 1;
  } catch (error) {
    toast.add({ severity: "error", summary: "Result loading failed", detail: formatLazerWsError(error?.message, "Unable to load the map result."), life: 5000 });
  }
}

function calculateLazerApiResult(template, room, reverse = false, multipliers = {}) {
  if (template === "freemod") {
    const normalizedMultipliers = Object.entries(multipliers || {})
      .map(([mods, value]) => ({
        mods: String(mods)
          .toUpperCase()
          .split(/[+\s]+/)
          .filter(Boolean),
        value: Number(value) || 1,
      }))
      .sort((left, right) => right.mods.length - left.mods.length);
    const total = (team) =>
      team.players.reduce((sum, player) => {
        const playerMods = new Set((player.mods || []).map((mod) => String(mod).toUpperCase()));
        const multiplier = normalizedMultipliers.find((entry) => entry.mods.every((mod) => playerMods.has(mod)))?.value || 1;
        return sum + player.score * multiplier;
      }, 0);
    return makeLazerCalculatedResult(total(room.teamRed), total(room.teamBlue), reverse);
  }
  if (template === "accuracy") return makeLazerCalculatedResult(room.teamRed.accuracy, room.teamBlue.accuracy, reverse);
  if (template === "combo") return makeLazerCalculatedResult(room.teamRed.combo, room.teamBlue.combo, reverse);
  return makeLazerCalculatedResult(room.teamRed.score, room.teamBlue.score, reverse);
}

function makeLazerCalculatedResult(red, blue, reverse = false) {
  const redValue = Number(red);
  const blueValue = Number(blue);
  if (!Number.isFinite(redValue) || !Number.isFinite(blueValue)) return null;
  return {
    winner: redValue === blueValue ? "tie" : (reverse ? redValue < blueValue : redValue > blueValue) ? "red" : "blue",
    systemMessages: [],
    result: { red: redValue, blue: blueValue },
  };
}

async function evaluateLazerWinCondition(source, room) {
  if (!String(source || "").trim()) return null;
  let winner = null;
  let result = null;
  const systemMessages = [];
  const calculateWinner = (scores, options = {}) => {
    const red = Number(scores?.red);
    const blue = Number(scores?.blue);
    if (!Number.isFinite(red) || !Number.isFinite(blue)) throw new Error("calculateWinner: red/blue scores must be numbers");
    winner = red === blue ? "tie" : (options.reverse ? red < blue : red > blue) ? "red" : "blue";
    result = { red, blue };
    return winner;
  };
  try {
    const execute = new Function("room", "system", "calculateWinner", `return (async () => { ${source} })();`);
    await execute(room, { sendMessage: (text) => systemMessages.push(String(text)) }, calculateWinner);
    return { winner, systemMessages, result };
  } catch (error) {
    toast.add({ severity: "error", summary: "Win condition failed", detail: error?.message || "Unable to evaluate the win condition.", life: 5000 });
    return null;
  }
}

function getMatchStatus(lobby, teamRedName, teamBlueName) {
  const bestOf = Number(lobby.bestOf);
  const winningScore = Number.isInteger(bestOf) && bestOf > 0 ? Math.ceil(bestOf / 2) : null;
  const teamOneScore = Number(lobby.teamRedScore) || 0;
  const teamTwoScore = Number(lobby.teamBlueScore) || 0;

  if (winningScore && teamOneScore >= winningScore && teamOneScore > teamTwoScore) {
    return `${teamRedName} wins the match! GG and WP!`;
  }
  if (winningScore && teamTwoScore >= winningScore && teamTwoScore > teamOneScore) {
    return `${teamBlueName} wins the match! GG and WP!`;
  }
  if (winningScore && teamOneScore === winningScore - 1 && teamTwoScore === winningScore - 1) {
    return "We're going to Tiebreaker!";
  }
  return lobby.nextPickTeam ? `Next Pick: ${lobby.nextPickTeam}` : "—";
}

function resolveBeatmapWinner(teamRedName, teamBlueName, teamRedScore, teamBlueScore, explicitWinner = null) {
  if (explicitWinner === teamRedName || explicitWinner === teamBlueName || explicitWinner === "Draw") {
    return explicitWinner;
  }
  if (!Number.isFinite(teamRedScore) || !Number.isFinite(teamBlueScore)) {
    return "—";
  }
  if (teamRedScore === teamBlueScore) return "Draw";
  return teamRedScore > teamBlueScore ? teamRedName : teamBlueName;
}

function getLobbyTemplateValues(lobby, result = {}, { mappoolMode = "stable", lobbyId = activeChat.value } = {}) {
  const teamRedName = lobby.teamRed || result.teamAName || "Team A";
  const teamBlueName = lobby.teamBlue || result.teamBName || "Team B";
  const teamRedScore = lobby.teamRedScore ?? 0;
  const teamBlueScore = lobby.teamBlueScore ?? 0;
  const lastPlay = lobby.lastPlay || {};
  const hasLastPlay = Number.isFinite(lastPlay.teamRedScore) && Number.isFinite(lastPlay.teamBlueScore);
  const rawBeatmapTeamRedScore = Number.isFinite(result.beatmapTeamRedScore) ? result.beatmapTeamRedScore : hasLastPlay ? lastPlay.teamRedScore : "—";
  const rawBeatmapTeamBlueScore = Number.isFinite(result.beatmapTeamBlueScore) ? result.beatmapTeamBlueScore : hasLastPlay ? lastPlay.teamBlueScore : "—";
  const explicitWinner = result.beatmapWinner === "red" ? teamRedName : result.beatmapWinner === "blue" ? teamBlueName : result.beatmapWinner === "tie" ? "Draw" : result.beatmapWinner;
  const beatmapWinner = resolveBeatmapWinner(teamRedName, teamBlueName, rawBeatmapTeamRedScore, rawBeatmapTeamBlueScore, explicitWinner);
  const accuracyMultiplier = result.accuracy === "fraction" ? 100 : 1;
  const accuracySuffix = result.accuracy ? "%" : "";
  const roundAccuracy = (score) => Math.round((score * accuracyMultiplier + Number.EPSILON) * 100) / 100;
  const formatBeatmapScore = (score) => (accuracySuffix && Number.isFinite(score) ? `${roundAccuracy(score)}%` : score);
  const beatmapTeamRedScore = formatBeatmapScore(rawBeatmapTeamRedScore);
  const beatmapTeamBlueScore = formatBeatmapScore(rawBeatmapTeamBlueScore);
  const isLazerMappool = mappoolMode === "lazer";
  const activeMappool = isLazerMappool ? getLazerActivePool(lobbyId) : getActivePool(lobbyId);
  const getPoolMapState = isLazerMappool ? getLazerMapState : getMapState;
  const availableMaps =
    sortMappoolSlots(activeMappool?.slots, activeMappool?.categories)
      .filter((slot) => {
        const state = getPoolMapState(lobbyId, slot.slotId);
        return Number(slot.beatmapId) > 0 && !/^(?:TB|Tiebreaker)\d*$/i.test(String(slot.slotId).trim()) && !state.picked && !state.banned;
      })
      .map((slot) => slot.slotId)
      .join(", ") || "—";

  return {
    beatmapWinner,
    beatmap: lobby.currentBeatmap?.url || "—",
    availableMaps,
    beatmapTeamRedScore,
    beatmapTeamBlueScore,
    teamRedName,
    teamBlueName,
    matchTeamRedScore: teamRedScore,
    matchTeamBlueScore: teamBlueScore,
    scoreDifference:
      Number.isFinite(rawBeatmapTeamRedScore) && Number.isFinite(rawBeatmapTeamBlueScore)
        ? accuracySuffix
          ? `${roundAccuracy(Math.abs(rawBeatmapTeamRedScore - rawBeatmapTeamBlueScore))}%`
          : Math.abs(rawBeatmapTeamRedScore - rawBeatmapTeamBlueScore)
        : 0,
    matchStatus: getMatchStatus(lobby, teamRedName, teamBlueName),
    bestOf: lobby.bestOf ?? "—",
  };
}

function getLazerLobbyTemplateValues(roomId, lobby, result = {}) {
  return getLobbyTemplateValues(
    {
      teamRed: lobby.teamAName,
      teamBlue: lobby.teamBName,
      teamRedScore: lobby.teamAScore,
      teamBlueScore: lobby.teamBScore,
      bestOf: lobby.bestOf,
      nextPickTeam: lobby.nextPickTeam,
      lastPlay: lobby.lastPlay || {},
      currentBeatmap: lazerCompletedBeatmaps[roomId] ? { url: `https://osu.ppy.sh/b/${lazerCompletedBeatmaps[roomId]}` } : null,
    },
    { ...result, accuracy: lobby.lastPlay?.metric === "accuracy" ? "fraction" : result.accuracy },
    { mappoolMode: "lazer", lobbyId: lazerChatId(roomId) },
  );
}

function handleMappoolPick(map) {
  if (activeChatKind.value !== "lobby") return;
  const picker = activeLobbyState.value?.players?.find((player) => normalizeIrcNick(player.username) === normalizeIrcNick(currentUser.value));
  const preview = map.preview || {};
  const totalSeconds = map.totalSeconds ?? preview.totalSeconds ?? null;
  const nextMap = {
    ...map,
    artist: preview.artist || "",
    title: preview.title || "",
    diff: preview.diff || "",
    mapperName: preview.author || "",
    beatmapsetId: preview.beatmapsetId ?? null,
    totalSeconds,
    baseTotalSeconds: totalSeconds,
    starRating: preview.starRating ?? null,
    baseStarRating: preview.starRating ?? null,
    baseBeatmapLoaded: true,
    pickedBy: activeLobbyState.value?.nextPickTeam || picker?.team || null,
    pickedByTeam:
      activeLobbyState.value?.nextPickTeam && normalizeIrcNick(activeLobbyState.value.nextPickTeam) === normalizeIrcNick(activeLobbyState.value.teamRed)
        ? "red"
        : activeLobbyState.value?.nextPickTeam && normalizeIrcNick(activeLobbyState.value.nextPickTeam) === normalizeIrcNick(activeLobbyState.value.teamBlue)
          ? "blue"
          : picker?.team || null,
    status: "waiting",
    error: null,
  };
  setNowPlaying(activeChat.value, nextMap);
  refreshNowPlayingMapAttributes(activeChat.value, nextMap);
}

function handleLazerMappoolPick(slot) {
  const roomId = Number(activeLazerRoom.value?.room_id);
  if (!Number.isInteger(roomId) || roomId <= 0 || !slot?.slotId) return;
  pendingLazerMappoolSlots.set(roomId, String(slot.slotId));
}

function rulesetNumber(ruleset) {
  return ({ osu: 0, taiko: 1, fruits: 2, mania: 3 }[ruleset] ?? Number(ruleset)) || 0;
}

function handleChatMappoolAction({ slotId, action }) {
  if (activeChatKind.value !== "lobby" || roomClosedByChat[activeChat.value]) return;
  const pool = getActivePool(activeChat.value);
  const slot = pool?.slots?.find((item) => item.slotId === slotId);
  if (!slot) return;
  const current = getMapState(activeChat.value, slot.slotId);

  if (current.banned || current.picked) return;
  if (action === "ban" && current.protected) return;

  if (action === "ban") {
    setMapState(activeChat.value, slot.slotId, { banned: true, picked: false });
    return;
  }
  if (action === "protect") {
    if (current.protected) return;
    setMapState(activeChat.value, slot.slotId, { protected: true });
    return;
  }

  const commands = [`!mp map ${slot.beatmapId} ${rulesetNumber(pool.ruleset)}`, slot.mods.length ? `!mp mods ${slot.mods.join(" ")}` : "!mp mods", ...slot.commands, ...(pool.globalCommands || [])];
  commands.forEach(handleCommand);
  setActiveWinCondition(activeChat.value, slot.beatmapId, slot.winCondition?.source || null);
  setMapState(activeChat.value, slot.slotId, { picked: true });
  handleMappoolPick(slot);
}

function handleLazerChatMappoolAction({ slotId, action }) {
  const room = activeLazerRoom.value;
  if (!room || room.closed) return;
  const pool = getLazerActivePool(activeChat.value);
  const slot = pool?.slots?.find((item) => item.slotId === slotId);
  if (!slot) return;
  const current = getLazerMapState(activeChat.value, slot.slotId);

  if (current.banned || current.picked) return;
  if (action === "ban" && current.protected) return;

  if (action === "ban") {
    setLazerMapState(activeChat.value, slot.slotId, { banned: true, picked: false });
    return;
  }
  if (action === "protect") {
    if (current.protected) return;
    setLazerMapState(activeChat.value, slot.slotId, { protected: true });
    return;
  }

  const roomId = Number(room.room_id);
  if (!Number.isInteger(roomId) || roomId <= 0) return;
  const toMods = (mods) =>
    (Array.isArray(mods) ? mods : [])
      .map((mod) => (typeof mod === "string" ? mod : mod?.acronym))
      .filter(Boolean)
      .map((acronym) => ({ acronym: String(acronym).toUpperCase() }));
  const sent = editLazerCurrentPlaylistItem(roomId, {
    beatmap_id: Number(slot.beatmapId),
    ruleset_id: rulesetNumber(pool.ruleset),
    required_mods: toMods(slot.requiredMods || slot.required_mods),
    allowed_mods: toMods(slot.allowedMods || slot.allowed_mods),
    freestyle: slot.freestyle === true,
  });
  if (!sent) {
    toast.add({ severity: "error", summary: "Pick failed", detail: "The server connection is not available.", life: 3500 });
    return;
  }
  setLazerMapState(activeChat.value, slot.slotId, { picked: true });
  handleLazerMappoolPick(slot);
}

function handleSendResult(result) {
  if (activeChat.value === "bancho") return;
  const lobby = activeLobbyState.value;
  if (!lobby) return;
  const values = getLobbyTemplateValues(lobby, {
    ...(winConditionResultsByChat[activeChat.value] || {}),
    ...result,
  });

  const outgoingMessages = activePreset.value?.messages.filter((message) => message.enabled && message.content.trim()) || [
    {
      content: "{{teamRedName}} {{matchTeamRedScore}} - {{matchTeamBlueScore}} {{teamBlueName}}",
    },
  ];

  outgoingMessages.forEach((message) => {
    handleSend(formatLobbyTemplate(message.content, values));
  });
}

function handleLazerSendResult(result) {
  const roomId = Number(activeLazerRoom.value?.room_id);
  const lobby = activeLazerLobbyState.value;
  if (!Number.isInteger(roomId) || roomId <= 0 || !lobby || activeLazerRoom.value?.closed) return;

  const values = getLazerLobbyTemplateValues(roomId, lobby, result);

  const outgoingMessages = activePreset.value?.messages.filter((message) => message.enabled && message.content.trim()) || [
    {
      content: "{{teamRedName}} {{matchTeamRedScore}} - {{matchTeamBlueScore}} {{teamBlueName}}",
    },
  ];

  outgoingMessages.forEach((message) => {
    queueLazerChatMessage(roomId, formatLobbyTemplate(message.content, values));
  });
}
</script>

<template>
  <Toast position="top-right" />
  <Toast position="top-right" :group="loginToastGroup">
    <template #messageicon="{ message }">
      <span v-if="message.severity === 'info'" class="login-toast-spinner" aria-label="Loading"></span>
      <Check v-else-if="message.severity === 'success'" :size="18" aria-label="Success" />
      <CircleX v-else-if="message.severity === 'error'" :size="18" aria-label="Error" />
    </template>
  </Toast>
  <UpdateDialog
    v-model:visible="updateDialogVisible"
    :mode="updateDialogMode"
    :current-version="updateInfo.currentVersion"
    :latest-version="updateInfo.latestVersion"
    :release-notes-url="updateInfo.releaseNotesUrl"
    :downloaded-bytes="updateDownloadedBytes"
    :total-bytes="updateTotalBytes"
    :speed-bytes-per-second="updateSpeedBytesPerSecond"
    @update="beginUpdateDownload"
    @cancel="cancelUpdateDownload"
  />
  <LoginPage
    v-if="!isAuthenticated && !authLoading"
    :initial-login="savedLogin"
    :osu-client-id="osuClientId"
    :osu-client-secret="osuClientSecret"
    :osu-profile="osuProfile"
    :osu-loading="osuLoading"
    :osu-error="osuError"
    :loading="loginLoading"
    @login="handleLogin"
    @save-osu-credentials="handleOsuCredentials"
    @osu-login="handleOsuLogin"
    @osu-logout="handleOsuLogout"
    @copy-callback="handleCopyCallback"
  />
  <AppSidebar
    v-if="isAuthenticated"
    v-model:open="sidebarOpen"
    :user-name="currentUser"
    :user-avatar="osuProfile?.avatarUrl || ''"
    :active-chat="activeChat"
    :unread-chats="unreadChats"
    :direct-chats="directChats"
    :joined-channels="joinedChannels"
    :lazer-rooms="Object.values(lazerRooms)"
    @logout="handleLogout"
    @open-settings="openSettings"
    @select-chat="selectChat"
    @open-create-lobby="createLobbyDialogOpen = true"
    @open-add-channel="addChannelDialogOpen = true"
    @close-chat="closeActiveChat"
  >
    <SettingsModal v-model:visible="settingsOpen">
      <template #app>
        <section class="settings-page__section">
          <div class="settings-page__section-heading">
            <h2>App settings</h2>
          </div>

          <div class="settings-page__setting">
            <div class="settings-page__setting-info">
              <h3>Primary color</h3>
              <p>Controls the main accent color used for active states, buttons, highlights, and other interactive elements across the app.</p>
            </div>

            <div class="settings-page__color-control">
              <ColorPicker v-model="primaryColorPicker" inputId="primary-color" />
              <InputText v-model="primaryColorDraft" aria-label="Primary color hex value" spellcheck="false" @blur="commitPrimaryColor" @keydown.enter="commitPrimaryColor" />
              <Button v-if="primaryColorChanged" text size="small" aria-label="Reset primary color" @click="resetPrimaryColor">
                <RotateCcw :size="14" />
                <span>Reset</span>
              </Button>
            </div>
          </div>
        </section>
      </template>

      <template #notifications>
        <section class="settings-page__section settings-page__section--notifications">
          <div class="settings-page__section-heading">
            <h2>Notifications</h2>
          </div>

          <div class="settings-page__setting">
            <div class="settings-page__setting-info">
              <h3>Sound notifications</h3>
              <p>Play a sound when a message arrives in a chat that is not currently open or when the app is out of focus.</p>
            </div>
            <div class="settings-page__setting-control">
              <ToggleSwitch v-model="soundEnabled" inputId="notification-sound-enabled" class="app-solid-switch" />
            </div>
          </div>

          <div class="settings-page__setting">
            <div class="settings-page__setting-info">
              <h3>Toast notifications</h3>
              <p>Show a toast when a message arrives in a chat that is not currently open or when the app is out of focus.</p>
            </div>
            <div class="settings-page__setting-control">
              <ToggleSwitch v-model="toastEnabled" inputId="notification-toast-enabled" class="app-solid-switch" />
            </div>
          </div>

          <div class="settings-page__setting">
            <div class="settings-page__setting-info">
              <h3>Ignore BanchoBot</h3>
              <p>Do not play sounds or show toasts for messages from BanchoBot.</p>
            </div>
            <div class="settings-page__setting-control">
              <ToggleSwitch v-model="ignoreBanchoBot" :disabled="!soundEnabled && !toastEnabled" inputId="notification-ignore-bancho-bot" class="app-solid-switch" />
            </div>
          </div>

          <div class="settings-page__setting">
            <div class="settings-page__setting-info">
              <h3>Notification sound</h3>
              <p>Choose a sound and preview it before using it for notifications.</p>
            </div>
            <div class="settings-page__setting-control settings-page__setting-control--wrap">
              <div ref="notificationSoundMenu" class="settings-page__sound-dropdown" :class="{ 'settings-page__sound-dropdown--disabled': !soundEnabled }">
                <button
                  type="button"
                  class="settings-page__sound-dropdown-trigger"
                  :disabled="!soundEnabled"
                  :aria-expanded="notificationSoundMenuOpen"
                  aria-haspopup="listbox"
                  aria-label="Notification sound"
                  @click.stop="toggleNotificationSoundMenu"
                >
                  <span>{{ selectedNotificationSound?.label }}</span>
                  <ChevronDown :size="14" />
                </button>
                <div v-if="notificationSoundMenuOpen && soundEnabled" class="settings-page__sound-dropdown-menu" role="listbox" aria-label="Notification sounds">
                  <div
                    v-for="item in notificationSounds"
                    :key="item.value"
                    type="button"
                    class="settings-page__sound-dropdown-option"
                    :class="{ 'settings-page__sound-dropdown-option--selected': item.value === sound }"
                    role="option"
                    :aria-selected="item.value === sound"
                  >
                    <button type="button" class="settings-page__sound-dropdown-select" @click="selectNotificationSound(item.value)">{{ item.label }}</button>
                    <button
                      v-tooltip.top="`Preview ${item.label}`"
                      type="button"
                      class="settings-page__sound-dropdown-preview"
                      :disabled="!soundEnabled"
                      :aria-label="`Preview ${item.label}`"
                      @click.stop="previewNotificationSound(item.value)"
                    >
                      <Play :size="13" />
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div class="settings-page__setting">
            <div class="settings-page__setting-info">
              <h3>Sound notification scenario</h3>
              <p>Choose whether sound plays for every message or only messages containing a highlight word.</p>
            </div>
            <div class="settings-page__setting-control">
              <SelectButton
                v-model="soundTrigger"
                :options="notificationTriggers"
                optionLabel="label"
                optionValue="value"
                :allowEmpty="false"
                :disabled="!soundEnabled"
                aria-label="Sound notification scenario"
              />
            </div>
          </div>

          <div class="settings-page__setting">
            <div class="settings-page__setting-info">
              <h3>Toast notification scenario</h3>
              <p>Choose whether toast appears for every message or only messages containing a highlight word.</p>
            </div>
            <div class="settings-page__setting-control">
              <SelectButton
                v-model="toastTrigger"
                :options="notificationTriggers"
                optionLabel="label"
                optionValue="value"
                :allowEmpty="false"
                :disabled="!toastEnabled"
                aria-label="Toast notification scenario"
              />
            </div>
          </div>
        </section>
      </template>

      <template #now-playing>
        <section class="settings-page__section">
          <div class="settings-page__section-heading">
            <h2>Now Playing</h2>
          </div>
          <div class="settings-page__setting">
            <div class="settings-page__setting-info">
              <h3>Show now playing</h3>
              <p>Show the currently selected beatmap above the chat log.</p>
            </div>
            <div class="settings-page__setting-control">
              <ToggleSwitch v-model="showNowPlaying" inputId="show-now-playing" class="app-solid-switch" />
            </div>
          </div>
          <div class="settings-page__setting">
            <div class="settings-page__setting-info">
              <h3>Show progress bar</h3>
              <p>Show elapsed time and progress for the currently playing map.</p>
            </div>
            <div class="settings-page__setting-control">
              <ToggleSwitch v-model="showProgressBar" inputId="show-progress-bar" class="app-solid-switch" />
            </div>
          </div>
          <div class="settings-page__setting">
            <div class="settings-page__setting-info">
              <h3>Show progress time</h3>
              <p>Show the elapsed time label above the progress bar.</p>
            </div>
            <div class="settings-page__setting-control">
              <ToggleSwitch v-model="showProgressTimeLabel" inputId="show-progress-time-label" class="app-solid-switch" />
            </div>
          </div>
        </section>
      </template>

      <template #lobby>
        <section class="settings-page__section settings-page__section--lobby">
          <div class="settings-page__section-heading">
            <h2>Lobby settings</h2>
          </div>

          <div class="settings-page__setting">
            <div class="settings-page__setting-info">
              <h3>Result messages</h3>
              <p>Choose and customize the messages sent by the Send Result button.</p>
            </div>
            <div class="settings-page__setting-control">
              <Button text size="small" @click="lobbyMessagesSettingsOpen = true">
                <Settings2 :size="14" />
                <span>Set up messages</span>
              </Button>
            </div>
          </div>
          <div class="settings-page__setting">
            <div class="settings-page__setting-info">
              <h3>Slot display</h3>
              <p>Show only occupied players or display all 16 lobby slots with their open/locked state.</p>
            </div>
            <div class="settings-page__setting-control">
              <SelectButton
                v-model="fullSlots"
                :options="[
                  { label: 'Short slots', value: false },
                  { label: 'Full slots', value: true },
                ]"
                optionLabel="label"
                optionValue="value"
                :allowEmpty="false"
                aria-label="Slot display mode"
              />
            </div>
          </div>
        </section>

        <LobbyMessagesSettings v-model:visible="lobbyMessagesSettingsOpen" />
      </template>

      <template #shortcuts>
        <section class="settings-page__section">
          <div class="settings-page__section-heading">
            <h2>Shortcuts</h2>
          </div>
          <ShortcutImportExportSettings />
        </section>
      </template>

      <template #chat>
        <section class="settings-page__section settings-page__section--chat">
          <div class="settings-page__section-heading">
            <h2>Chat settings</h2>
          </div>

          <div class="settings-page__chat-preview" aria-label="Chat preview">
            <div v-for="(message, index) in chatPreviewMessages" :key="message.id" class="settings-page__chat-line">
              <span class="settings-page__chat-time">
                {{ previewTime(message.time, index) }}
              </span>
              <span
                class="settings-page__chat-nick"
                :class="{
                  'settings-page__chat-nick--badge': (message.role === 'referee' && highlightReferee) || (message.author === 'BanchoBot' && highlightBanchoBot),
                }"
                :style="previewNickStyle(message)"
                >{{ message.author }}</span
              >
              <span class="settings-page__chat-text" :class="{ 'settings-page__chat-text--highlighted': previewMessageHighlighted(message) }" :style="previewMessageStyle(message)">
                <template v-for="(segment, segmentIndex) in previewTeamSegments(message.text)" :key="`${message.id}-team-${segmentIndex}`">
                  <span v-if="segment.type === 'team'" :style="teamTextStyle(segment.color)">{{ segment.value }}</span>
                  <template v-else>{{ segment.value }}</template>
                </template>
              </span>
            </div>
          </div>

          <div class="settings-page__settings-list">
            <div class="settings-page__setting">
              <div class="settings-page__setting-info">
                <h3>Highlight team names</h3>
                <p>Show team names in bold using the red and blue team colors.</p>
              </div>
              <div class="settings-page__setting-control">
                <ToggleSwitch v-model="highlightTeams" inputId="highlight-team-names" class="app-solid-switch" />
              </div>
            </div>

            <div class="settings-page__setting">
              <div class="settings-page__setting-info">
                <h3>Highlight referee</h3>
                <p>Show the referee name as a filled accent badge in chat.</p>
              </div>
              <div class="settings-page__setting-control">
                <ToggleSwitch v-model="highlightReferee" inputId="highlight-referee" class="app-solid-switch" />
              </div>
            </div>

            <div class="settings-page__setting">
              <div class="settings-page__setting-info">
                <h3>Highlight BanchoBot</h3>
                <p>Show BanchoBot as a filled color badge in chat.</p>
              </div>
              <div class="settings-page__setting-control">
                <ToggleSwitch v-model="highlightBanchoBot" inputId="highlight-bancho-bot" class="app-solid-switch" />
              </div>
            </div>

            <div class="settings-page__setting settings-page__setting--highlight">
              <div class="settings-page__setting-info">
                <h3>Highlight words</h3>
                <p>Messages containing any of these words will use the selected text styles.</p>
              </div>
              <div class="settings-page__setting-control settings-page__setting-control--highlight">
                <div class="settings-page__highlight-tags" @click="focusHighlightWordsInput" @wheel="handleHighlightWordsWheel">
                  <div class="settings-page__highlight-chiplist" aria-label="Highlight words">
                    <button
                      v-for="word in highlightWordsDraft"
                      :key="word"
                      type="button"
                      class="settings-page__highlight-chip"
                      :aria-label="`Remove highlight word ${word}`"
                      @mousedown.prevent
                      @click.stop="removeHighlightWord(word)"
                    >
                      <span class="settings-page__highlight-chip-label">{{ word }}</span>
                      <CircleX :size="12" />
                    </button>
                    <input
                      ref="highlightWordsInputRef"
                      v-model="highlightWordsInputDraft"
                      class="settings-page__highlight-input"
                      aria-label="Highlight words"
                      placeholder="Type a word"
                      spellcheck="false"
                      @blur="commitHighlightWordsInput"
                      @keydown="handleHighlightWordsKeydown"
                      @paste="handleHighlightWordsPaste"
                    />
                  </div>
                </div>
              </div>
            </div>

            <div class="settings-page__setting">
              <div class="settings-page__setting-info">
                <h3>Highlight styles</h3>
                <p>Pick one or more text styles for highlighted messages.</p>
              </div>
              <div class="settings-page__setting-control settings-page__setting-control--styles">
                <Button text size="small" class="settings-page__styles-button" aria-label="Choose highlight styles" @click="toggleHighlightStyles">
                  <Sparkles :size="14" />
                  <span>{{ highlightStylesSummary }}</span>
                  <ChevronDown :size="12" />
                </Button>
              </div>
            </div>

            <div class="settings-page__setting">
              <div class="settings-page__setting-info">
                <h3>Highlight message color</h3>
                <p>Choose the text color used for messages containing a highlighted word.</p>
              </div>
              <div class="settings-page__setting-control settings-page__setting-control--wrap">
                <SelectButton v-model="highlightColorMode" :options="highlightColorModes" optionLabel="label" optionValue="value" :allowEmpty="false" aria-label="Highlight message color mode" />
                <template v-if="highlightColorMode === 'custom'">
                  <ColorPicker v-model="highlightColorPicker" />
                  <InputText
                    v-model="highlightColorDraft"
                    aria-label="Highlight message color hex value"
                    spellcheck="false"
                    @blur="commitChatColor(highlightColor, highlightColorDraft)"
                    @keydown.enter="commitChatColor(highlightColor, highlightColorDraft)"
                  />
                </template>
                <Button v-if="chatSettingChanged.highlightColor" text size="small" aria-label="Reset highlight message color" @click="resetChatSetting('highlightColor')">
                  <RotateCcw :size="14" />
                  <span>Reset</span>
                </Button>
              </div>
            </div>

            <div class="settings-page__setting">
              <div class="settings-page__setting-info">
                <h3>BanchoBot color</h3>
                <p>Color used for the BanchoBot name and highlight badge.</p>
              </div>
              <div class="settings-page__setting-control">
                <ColorPicker v-model="banchoBotColorPicker" />
                <InputText
                  v-model="banchoBotColorDraft"
                  aria-label="BanchoBot color hex value"
                  spellcheck="false"
                  @blur="commitChatColor(banchoBotColor, banchoBotColorDraft)"
                  @keydown.enter="commitChatColor(banchoBotColor, banchoBotColorDraft)"
                />
                <Button v-if="chatSettingChanged.banchoBotColor" text size="small" aria-label="Reset BanchoBot color" @click="resetChatSetting('banchoBotColor')">
                  <RotateCcw :size="14" />
                  <span>Reset</span>
                </Button>
              </div>
            </div>

            <div class="settings-page__setting">
              <div class="settings-page__setting-info">
                <h3>Red team color</h3>
                <p>Color used for player names assigned to the red team.</p>
              </div>
              <div class="settings-page__setting-control">
                <ColorPicker v-model="redTeamColorPicker" />
                <InputText
                  v-model="redTeamColorDraft"
                  aria-label="Red team color hex value"
                  spellcheck="false"
                  @blur="commitChatColor(redTeamColor, redTeamColorDraft)"
                  @keydown.enter="commitChatColor(redTeamColor, redTeamColorDraft)"
                />
                <Button v-if="chatSettingChanged.redTeamColor" text size="small" aria-label="Reset red team color" @click="resetChatSetting('redTeamColor')">
                  <RotateCcw :size="14" />
                  <span>Reset</span>
                </Button>
              </div>
            </div>

            <div class="settings-page__setting">
              <div class="settings-page__setting-info">
                <h3>Blue team color</h3>
                <p>Color used for player names assigned to the blue team.</p>
              </div>
              <div class="settings-page__setting-control">
                <ColorPicker v-model="blueTeamColorPicker" />
                <InputText
                  v-model="blueTeamColorDraft"
                  aria-label="Blue team color hex value"
                  spellcheck="false"
                  @blur="commitChatColor(blueTeamColor, blueTeamColorDraft)"
                  @keydown.enter="commitChatColor(blueTeamColor, blueTeamColorDraft)"
                />
                <Button v-if="chatSettingChanged.blueTeamColor" text size="small" aria-label="Reset blue team color" @click="resetChatSetting('blueTeamColor')">
                  <RotateCcw :size="14" />
                  <span>Reset</span>
                </Button>
              </div>
            </div>

            <div class="settings-page__setting">
              <div class="settings-page__setting-info">
                <h3>Unassigned player color</h3>
                <p>Use a stable random palette color or choose a custom one.</p>
              </div>
              <div class="settings-page__setting-control settings-page__setting-control--wrap">
                <SelectButton v-model="unassignedColorMode" :options="unassignedColorModes" optionLabel="label" optionValue="value" :allowEmpty="false" aria-label="Unassigned player color mode" />
                <template v-if="unassignedColorMode === 'custom'">
                  <ColorPicker v-model="unassignedColorPicker" />
                  <InputText
                    v-model="unassignedColorDraft"
                    aria-label="Unassigned player color hex value"
                    spellcheck="false"
                    @blur="commitChatColor(unassignedColor, unassignedColorDraft)"
                    @keydown.enter="commitChatColor(unassignedColor, unassignedColorDraft)"
                  />
                </template>
                <Button
                  v-if="unassignedColorMode === 'custom' && chatSettingChanged.unassignedColor"
                  text
                  size="small"
                  aria-label="Reset unassigned player color"
                  @click="resetChatSetting('unassignedColor')"
                >
                  <RotateCcw :size="14" />
                  <span>Reset</span>
                </Button>
              </div>
            </div>

            <div class="settings-page__setting">
              <div class="settings-page__setting-info">
                <h3>Timestamp format</h3>
                <p>Choose between minute-only and full timestamps in chat.</p>
              </div>
              <div class="settings-page__setting-control">
                <SelectButton v-model="timestampMode" :options="timestampModes" optionLabel="label" optionValue="value" :allowEmpty="false" aria-label="Timestamp format" />
              </div>
            </div>
          </div>
        </section>

        <Popover ref="highlightStylesPopover" class="settings-page__styles-popover">
          <div class="settings-page__styles-popover-body">
            <button
              v-for="option in HIGHLIGHT_STYLE_OPTIONS"
              :key="option.value"
              type="button"
              class="settings-page__styles-option"
              :class="{ 'settings-page__styles-option--selected': highlightStyleSelected(option.value) }"
              :aria-pressed="highlightStyleSelected(option.value)"
              @click="toggleHighlightStyle(option.value)"
            >
              <span class="settings-page__styles-option-left">
                <Check v-if="highlightStyleSelected(option.value)" :size="14" class="settings-page__styles-option-check" />
                <span v-else class="settings-page__styles-option-check settings-page__styles-option-check--spacer" aria-hidden="true"></span>
                <component :is="option.icon" :size="14" />
                <span class="settings-page__styles-option-label">{{ option.label }}</span>
              </span>
            </button>
          </div>
        </Popover>
      </template>
    </SettingsModal>

    <div class="app-layout">
      <LazerChatWindow
        v-if="activeChatKind === 'lazer'"
        :title="activeChatTitle"
        :chat-id="activeChat"
        :room-id="activeLazerRoom?.room_id"
        :connected="connected && !activeLazerRoom?.closed"
        :messages="activeMessages"
        :current-user="currentUser"
        :referee-users="activeLazerRefereeUsers"
        :room-size="activeLazerRoomSize"
        :room-closed="Boolean(activeLazerRoom?.closed)"
        :timer-active="activeLazerTimer"
        :timer-seconds="activeLazerTimerSeconds"
        :match-start-countdown-seconds="activeLazerMatchStartSeconds"
        :format="activeLazerMatchType"
        :now-playing="activeLazerNowPlaying"
        :playlist-items="activeLazerRoom?.playlist || []"
        :current-playlist-item-id="activeLazerCurrentPlaylistItemId"
        :show-progress-bar="showProgressBar"
        :show-progress-time-label="showProgressTimeLabel"
        :team-red-name="activeLazerLobbyState?.teamAName || ''"
        :team-blue-name="activeLazerLobbyState?.teamBName || ''"
        :mappool-slots="activeLazerMappoolSlots"
        :get-mappool-state="(slotId) => getLazerMapState(activeChat, slotId)"
        :auto-scroll-token="commandScrollToken"
        @send="handleSend"
        @mappool-action="handleLazerChatMappoolAction"
        @send-command="handleCommand"
        @start-timer="startLazerCountdown(activeLazerRoom?.room_id, $event)"
        @abort-timer="abortActiveLazerTimer(activeLazerRoom?.room_id)"
        @download-chat-history="downloadChatHistory"
        @toggle-sidebar="sidebarOpen = !sidebarOpen"
      />
      <ChatWindow
        v-else
        :title="activeChatTitle"
        :chat-id="activeChat"
        :connected="connected"
        :messages="activeMessages"
        :current-user="currentUser"
        :referee-users="activeRefereeUsers"
        :shortcut-mode="activeChatShortcutMode"
        :auto-scroll-token="commandScrollToken"
        :room-size="activeLobbySize"
        :room-closed="Boolean(roomClosedByChat[activeChat])"
        :timer-active="activeLobbyTimer"
        :timer-seconds="activeLobbyTimerSeconds"
        :format="activeLobbyTeamMode"
        :win-condition="activeLobbyScoreMode"
        :now-playing="activeNowPlaying"
        :show-progress-bar="showProgressBar"
        :show-progress-time-label="showProgressTimeLabel"
        :team-red-name="activeLobbyState?.teamRed || ''"
        :team-blue-name="activeLobbyState?.teamBlue || ''"
        :mappool-slots="activeMappoolSlots"
        :get-mappool-state="(slotId) => getMapState(activeChat, slotId)"
        @send="handleSend"
        @mappool-action="handleChatMappoolAction"
        @send-command="handleCommand"
        @create-lobby="createLobbyDialogOpen = true"
        @download-chat-history="downloadChatHistory"
        @toggle-sidebar="sidebarOpen = !sidebarOpen"
      />

      <div v-if="activeChatKind === 'lazer'" class="app-layout__side">
        <SidebarSectionCard title="Lobby" :icon="DoorOpen">
          <LazerLobbyScoreCard
            v-model:qualification-mode="activeLazerQualificationMode"
            v-model:team-a-score="activeLazerTeamAScore"
            v-model:team-b-score="activeLazerTeamBScore"
            :show-match-controls="!activeLazerQualificationMode"
            :show-qualification-toggle="true"
            :lobby-id="String(activeLazerRoom?.room_id || '')"
            :team-a-name="activeLazerLobbyState?.teamAName || 'Team A'"
            :team-b-name="activeLazerLobbyState?.teamBName || 'Team B'"
            :best-of="activeLazerLobbyState?.bestOf"
            :next-pick-team="activeLazerLobbyState?.nextPickTeam"
            :can-edit="currentUser === refereeUser"
            lazer-mode
            :room-link="activeLazerRoom ? `https://osu.ppy.sh/multiplayer/rooms/${activeLazerRoom.room_id}` : ''"
            :disabled="Boolean(activeLazerRoom?.closed)"
            :referees="activeLazerRoom?.referees || []"
            :referees-visible="lazerRefereesDialogOpen"
            @send-result="handleLazerSendResult"
            @update-settings="updateActiveLazerSettings"
            @configure-lobby="openLobbySetup"
            @manage-referees="lazerRefereesDialogOpen = true"
          />
        </SidebarSectionCard>
        <LazerPlayerListCard :players="activeLazerDisplayPlayers" :current-user="currentUser" :disabled="Boolean(activeLazerRoom?.closed)" @open-players="lazerPlayersDialogOpen = true" />
        <SidebarSectionCard title="Mappool" :icon="MapIcon" scrollable>
          <LazerMappoolCard
            :disabled="Boolean(activeLazerRoom?.closed)"
            :lobby-id="activeChat"
            :room-id="activeLazerRoom?.room_id"
            :qualification-mode="activeLazerQualificationMode"
            @send-command="handleCommand"
            @pick-map="handleLazerMappoolPick"
          />
        </SidebarSectionCard>
      </div>
      <div v-else-if="activeChatKind === 'lobby'" class="app-layout__side">
        <SidebarSectionCard title="Lobby" :icon="DoorOpen">
          <LobbyScoreCard
            v-model:qualification-mode="activeQualificationMode"
            v-model:team-a-score="activeLobbyTeamAScore"
            v-model:team-b-score="activeLobbyTeamBScore"
            :lobby-id="activeLobbyState?.id ? String(activeLobbyState.id) : ''"
            :team-a-name="activeLobbyState?.teamRed || 'Team A'"
            :team-b-name="activeLobbyState?.teamBlue || 'Team B'"
            :best-of="activeLobbyState?.bestOf"
            :next-pick-team="activeLobbyState?.nextPickTeam"
            :can-edit="currentUser === refereeUser"
            :show-match-controls="!activeQualificationMode"
            :show-qualification-toggle="!activeChannel?.createdViaCreateLobby"
            :disabled="Boolean(roomClosedByChat[activeChat])"
            :mp-link="activeLobbyState?.id ? `https://osu.ppy.sh/mp/${activeLobbyState.id}` : ''"
            :referees-visible="refereesDialogOpen"
            @send-result="handleSendResult"
            @update-settings="updateActiveLobbySettings"
            @configure-lobby="openLobbySetup"
            @manage-referees="refereesDialogOpen = true"
          />
        </SidebarSectionCard>
        <PlayerListCard :players="activeLobbyDisplayPlayers" :current-user="currentUser" :disabled="Boolean(roomClosedByChat[activeChat])" @open-players="playersDialogOpen = true" />
        <SidebarSectionCard title="Mappool" :icon="MapIcon" scrollable>
          <MappoolCard
            :disabled="Boolean(roomClosedByChat[activeChat])"
            :lobby-id="activeChat"
            :qualification-mode="activeQualificationMode"
            @send-command="handleCommand"
            @pick-map="handleMappoolPick"
          />
        </SidebarSectionCard>
      </div>

      <CreateLobbyDialog v-model:visible="createLobbyDialogOpen" @create="handleCreateLobby" />

      <AddChannelDialog v-model:visible="addChannelDialogOpen" :loading="Boolean(pendingJoinChannel)" @join="joinChannel" />
      <PlayersDialog
        v-if="activeChatKind === 'lobby'"
        v-model:visible="playersDialogOpen"
        :players="activeLobbyPlayers"
        :disabled="Boolean(roomClosedByChat[activeChat])"
        @move-player="moveLobbyPlayer"
        @toggle-team="toggleLobbyPlayerTeam"
        @kick-player="kickLobbyPlayer"
        @set-host="setLobbyHost"
      />
      <LazerPlayersDialog
        v-if="activeChatKind === 'lazer'"
        v-model:visible="lazerPlayersDialogOpen"
        :players="activeLazerPlayers"
        :room-id="activeLazerRoom?.room_id || null"
        :disabled="Boolean(activeLazerRoom?.closed)"
        @move-player="moveLazerPlayer"
      />
      <LazerRefereesDialog
        v-if="activeChatKind === 'lazer'"
        v-model:visible="lazerRefereesDialogOpen"
        :referees="(activeLazerRoom?.referees || []).map((referee) => ({ ...referee, name: lazerUserProfiles[referee.user_id]?.username, avatarUrl: lazerUserProfiles[referee.user_id]?.avatarUrl }))"
        :room-id="activeLazerRoom?.room_id || null"
        :current-user-id="Number(osuProfile?.id) || null"
        :disabled="Boolean(activeLazerRoom?.closed)"
      />
      <RefereesDialog v-if="activeChatKind === 'lobby'" v-model:visible="refereesDialogOpen" />
      <LazerLobbySetupDialog
        v-if="activeChatKind === 'lazer'"
        v-model:visible="lobbySetupDialogOpen"
        :disabled="Boolean(activeLazerRoom?.closed)"
        :loading="lazerLobbySetupLoading"
        :initial-queue-mode="activeLazerRoom?.queue_mode || 'host_only'"
        :initial-match-type="activeLazerRoom?.state?.type || 'team_versus'"
        :initial-max-participants="activeLazerRoom?.max_participants ?? null"
        @send="applyLazerLobbySetup"
      />
      <LobbySetupDialog
        v-else
        v-model:visible="lobbySetupDialogOpen"
        :disabled="Boolean(roomClosedByChat[activeChat])"
        :initial-game-mode="lobbySetupGameMode"
        :initial-win-condition="lobbySetupWinCondition"
        :initial-open-slots="lobbySetupOpenSlots"
        @send="sendLobbySetup"
      />
    </div>
  </AppSidebar>
</template>

<style scoped>
.login-toast-spinner {
  width: 1.1rem;
  height: 1.1rem;
  flex: 0 0 auto;
  border: 2px solid currentColor;
  border-right-color: transparent;
  border-radius: 50%;
  animation: login-toast-spin 0.75s linear infinite;
}

@keyframes login-toast-spin {
  to {
    transform: rotate(360deg);
  }
}

.app-layout {
  display: flex;
  gap: 0.9rem;
  height: 100%;
  padding: 1.15rem;
  align-items: stretch;
}

.settings-page {
  height: 100%;
  padding: 1.15rem;
  color: var(--app-text);
}

.settings-page__header {
  display: flex;
  align-items: center;
  gap: 0.9rem;
  padding: 0.35rem 0;
}

.settings-page__back {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 2.25rem;
  height: 2.25rem;
  padding: 0;
  border: 1px solid var(--app-border);
  border-radius: 0.6rem;
  background: var(--app-control);
  color: var(--app-muted);
  cursor: pointer;
}

.settings-page__back:hover {
  border-color: rgba(var(--app-primary-rgb), 0.28);
  background: rgba(var(--app-primary-rgb), 0.14);
  color: var(--app-primary-bright);
}

.settings-page__title {
  display: flex;
  align-items: center;
  gap: 0.65rem;
}

.settings-page__title svg {
  color: var(--app-primary-bright);
}

.settings-page__title h1 {
  margin: 0;
  font-size: 1.3rem;
  font-weight: 800;
}

.settings-page__section {
  width: 100%;
  margin-top: 1.8rem;
  color: var(--app-text);
}

.settings-page__section-heading h2 {
  margin: 0;
  font-size: 1.1rem;
  font-weight: 800;
}

.settings-page__setting {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 2rem;
  margin-top: 1.25rem;
  padding: 1rem 0;
}

.settings-page__setting-info {
  min-width: 0;
}

.settings-page__setting-info h3 {
  margin: 0;
  font-size: 0.85rem;
  font-weight: 800;
}

.settings-page__setting-info p {
  max-width: 34rem;
  margin: 0.35rem 0 0;
  color: var(--app-muted);
  font-size: 0.76rem;
  line-height: 1.5;
}

.settings-page__color-control {
  display: flex;
  align-items: center;
  gap: 0.55rem;
  flex-shrink: 0;
}

.settings-page__color-control :deep(.p-colorpicker-preview) {
  width: 2.35rem;
  height: 2.35rem;
  border: 1px solid var(--app-border-strong);
  border-radius: 0.55rem;
  box-shadow: inset 0 0 0 0.15rem var(--app-surface-raised);
}

.settings-page__color-control :deep(.p-inputtext) {
  width: 6.4rem;
  padding: 0.55rem 0.65rem;
  border: 1px solid var(--app-border);
  border-radius: 0.55rem;
  background: var(--app-control);
  color: var(--app-text);
  font-family: ui-monospace, Consolas, monospace;
  font-size: 0.76rem;
}

.settings-page__color-control :deep(.p-inputtext:hover) {
  border-color: var(--app-border-strong) !important;
}

.settings-page__color-control :deep(.p-inputtext:focus) {
  border-color: var(--app-primary-bright) !important;
  box-shadow: 0 0 0 0.15rem rgba(var(--app-primary-rgb), 0.16) !important;
}

.settings-page__color-control :deep(.p-button) {
  gap: 0.35rem;
  padding: 0.45rem 0.55rem;
  color: var(--app-muted);
  font-size: 0.72rem;
}

.settings-page__color-control :deep(.p-button:hover) {
  color: var(--app-primary-bright);
  background: rgba(var(--app-primary-rgb), 0.12);
}

.settings-page__section--chat {
  margin-top: 2.25rem;
}

.settings-page__chat-preview {
  margin-top: 1rem;
  padding: 0.7rem 0.9rem;
  border: 1px solid var(--app-border);
  border-radius: 0.65rem;
  background: var(--app-surface);
}

.settings-page__chat-line {
  display: flex;
  align-items: baseline;
  gap: 0.55rem;
  padding: 0.28rem 0;
  color: var(--app-message-text);
  font-size: 0.78rem;
}

.settings-page__chat-time {
  width: 4rem;
  flex-shrink: 0;
  color: var(--app-muted);
  font-size: 0.68rem;
  text-align: right;
}

.settings-page__chat-nick {
  flex-shrink: 0;
  font-weight: 800;
}

.settings-page__chat-nick--badge {
  padding: 0.04rem 0.45rem;
  border-radius: 0.5rem;
}

.settings-page__chat-text {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.settings-page__settings-list {
  margin-top: 1rem;
}

.settings-page__settings-list .settings-page__setting {
  margin-top: 0;
  padding: 0.9rem 0;
  border-bottom: 1px solid var(--app-border);
}

.settings-page__setting-control {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 0.55rem;
  flex-shrink: 0;
}

.settings-page__setting-control--wrap {
  flex-wrap: wrap;
}

.settings-page__setting-control--stack {
  align-items: stretch;
  flex-direction: column;
  gap: 0.6rem;
}

.settings-page__setting-control--styles {
  align-items: center;
  justify-content: flex-end;
  flex-wrap: nowrap;
}

.settings-page__setting--highlight {
  align-items: center;
  gap: 1.25rem;
}

.settings-page__setting--highlight .settings-page__setting-info {
  flex: 1 1 auto;
}

.settings-page__setting-control--highlight {
  align-items: center;
  justify-content: flex-end;
  flex: 0 1 22rem;
  width: min(100%, 22rem);
  max-width: 22rem;
  min-width: 0;
  flex-wrap: nowrap;
  gap: 0.9rem;
}

.settings-page__highlight-tags {
  display: flex;
  flex-wrap: nowrap;
  align-items: center;
  min-width: 0;
  width: 100%;
  max-width: 100%;
  height: 2.6rem;
  min-height: 2.6rem;
  max-height: 2.6rem;
  padding: 0.35rem 0.55rem;
  border: 1px solid var(--app-border);
  border-radius: 0.65rem;
  background: var(--app-control);
  overflow-x: auto;
  overflow-y: hidden;
  white-space: nowrap;
  scrollbar-width: none;
  -ms-overflow-style: none;
}

.settings-page__highlight-tags:focus-within {
  border-color: rgba(var(--app-primary-rgb), 0.4);
  box-shadow: 0 0 0 0.15rem rgba(var(--app-primary-rgb), 0.14);
}

.settings-page__highlight-tags::-webkit-scrollbar {
  display: none;
}

.settings-page__highlight-chiplist {
  display: flex;
  flex: 0 0 auto;
  align-items: center;
  gap: 0.45rem;
  width: max-content;
  min-width: 0;
  overflow: visible;
  white-space: nowrap;
}

.settings-page__highlight-chip {
  display: inline-flex;
  align-items: center;
  flex: 0 0 auto;
  gap: 0.35rem;
  padding: 0.28rem 0.6rem;
  border: 1px solid rgba(var(--app-primary-rgb), 0.18);
  border-radius: 999px;
  background: rgba(var(--app-primary-rgb), 0.12);
  color: var(--app-primary-bright);
  font-size: 0.72rem;
  white-space: nowrap;
  cursor: pointer;
}

.settings-page__highlight-chip:hover {
  border-color: rgba(var(--app-primary-rgb), 0.28);
  background: rgba(var(--app-primary-rgb), 0.18);
}

.settings-page__highlight-chip-label {
  min-width: 0;
}

.settings-page__highlight-chip svg {
  flex: 0 0 auto;
}

.settings-page__highlight-input {
  flex: 0 0 9rem;
  width: 9rem;
  min-width: 7rem;
  max-width: 9rem;
  padding: 0;
  border: 0;
  outline: none;
  background: transparent;
  color: var(--app-text);
  font-size: 0.76rem;
  box-shadow: none;
}

.settings-page__highlight-input::placeholder {
  color: var(--app-muted);
}

.settings-page__highlight-input:focus {
  outline: none;
}

.settings-page__styles-button {
  justify-content: space-between;
  min-width: 0;
  width: 100%;
}

.settings-page__styles-button :deep(.p-button-label) {
  flex: 1 1 auto;
  text-align: left;
}

.settings-page__styles-popover {
  overflow: hidden;
  border: 1px solid var(--app-border);
  border-radius: 0.8rem;
  background: var(--app-surface-raised);
  box-shadow: 0 1.25rem 3rem rgba(0, 0, 0, 0.35);
}

.settings-page__styles-popover :deep(.p-popover-content) {
  padding: 0.65rem;
}

.settings-page__styles-popover-body {
  display: flex;
  flex-direction: column;
  gap: 0.2rem;
  min-width: 14rem;
  max-width: 18rem;
  max-height: 13rem;
  overflow: auto;
}

.settings-page__styles-option {
  display: flex;
  align-items: center;
  width: 100%;
  gap: 0;
  padding: 0.6rem 0.72rem;
  border: 1px solid transparent;
  border-radius: 0.6rem;
  background: transparent;
  color: var(--app-text);
  cursor: pointer;
  text-align: left;
}

.settings-page__styles-option:hover,
.settings-page__styles-option:focus-visible {
  background: rgba(var(--app-primary-rgb), 0.12);
  outline: none;
}

.settings-page__styles-option--selected {
  background: rgba(var(--app-primary-rgb), 0.18);
}

.settings-page__styles-option-left {
  display: flex;
  align-items: center;
  gap: 0.55rem;
  min-width: 0;
  width: 100%;
}

.settings-page__styles-option-check {
  flex: 0 0 auto;
  color: var(--app-primary-bright);
}

.settings-page__styles-option-check--spacer {
  width: 14px;
  height: 14px;
}

.settings-page__styles-option {
  font-size: 0.78rem;
}

.settings-page__styles-option-label {
  flex: 1 1 auto;
  min-width: 0;
}

.settings-page__styles-option svg {
  color: var(--app-primary-bright);
}

.settings-page__setting-control code {
  color: var(--app-muted);
  font-family: ui-monospace, Consolas, monospace;
  font-size: 0.72rem;
}

.settings-page__setting-control :deep(.p-inputtext) {
  width: 6.4rem;
  padding: 0.55rem 0.65rem;
  border: 1px solid var(--app-border);
  border-radius: 0.55rem;
  background: var(--app-control);
  color: var(--app-text);
  font-family: ui-monospace, Consolas, monospace;
  font-size: 0.76rem;
}

.settings-page__setting-control :deep(.p-inputtext:hover) {
  border-color: var(--app-border-strong) !important;
}

.settings-page__setting-control :deep(.p-inputtext:focus) {
  border-color: var(--app-primary-bright) !important;
  box-shadow: 0 0 0 0.15rem rgba(var(--app-primary-rgb), 0.16) !important;
}

.settings-page__sound-dropdown {
  position: relative;
  width: 12.4rem;
}

.settings-page__sound-dropdown-trigger {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  min-height: 2.2rem;
  padding: 0.55rem 0.7rem;
  border: 1px solid var(--app-border);
  border-radius: 0.55rem;
  background: var(--app-control);
  color: var(--app-text);
  font: inherit;
  font-size: 0.76rem;
  text-align: left;
  cursor: pointer;
  transition:
    border-color 0.18s ease,
    box-shadow 0.18s ease;
}

.settings-page__sound-dropdown-trigger:not(:disabled):hover,
.settings-page__sound-dropdown-trigger:not(:disabled)[aria-expanded="true"] {
  border-color: var(--app-primary-bright);
}

.settings-page__sound-dropdown-trigger:not(:disabled)[aria-expanded="true"] {
  box-shadow: 0 0 0 0.15rem rgba(var(--app-primary-rgb), 0.16);
}

.settings-page__sound-dropdown--disabled {
  opacity: 0.42;
  filter: saturate(0.35);
}

.settings-page__sound-dropdown--disabled .settings-page__sound-dropdown-trigger {
  cursor: not-allowed;
}

.settings-page__sound-dropdown-trigger svg {
  flex-shrink: 0;
  color: var(--app-muted);
}

.settings-page__sound-dropdown-menu {
  position: absolute;
  z-index: 20;
  top: calc(100% + 0.35rem);
  right: 0;
  left: 0;
  max-height: 15rem;
  overflow-y: auto;
  padding: 0.3rem;
  border: 1px solid var(--app-border);
  border-radius: 0.55rem;
  background: var(--app-surface-raised);
  box-shadow: 0 1rem 2.5rem rgba(0, 0, 0, 0.35);
}

.settings-page__sound-dropdown-option {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  gap: 0.55rem;
  padding: 0.1rem 0.2rem 0.1rem 0.7rem;
  border-radius: 0.4rem;
  background: transparent;
  color: var(--app-text);
}

.settings-page__sound-dropdown-option:hover,
.settings-page__sound-dropdown-option:focus-within {
  background: rgba(var(--app-primary-rgb), 0.12);
  outline: none;
}

.settings-page__sound-dropdown-option--selected {
  background: rgba(var(--app-primary-rgb), 0.18);
  color: var(--app-primary-bright);
}

.settings-page__sound-dropdown-select {
  flex: 1 1 auto;
  min-width: 0;
  padding: 0.45rem 0;
  border: 0;
  background: transparent;
  color: inherit;
  font: inherit;
  font-size: 0.76rem;
  text-align: left;
  cursor: pointer;
}

.settings-page__sound-dropdown-select:focus-visible,
.settings-page__sound-dropdown-preview:focus-visible {
  outline: 2px solid var(--app-primary-bright);
  outline-offset: -1px;
}

.settings-page__sound-dropdown-preview {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 1.8rem;
  height: 1.8rem;
  flex: 0 0 auto;
  padding: 0;
  border: 0;
  border-radius: 0.35rem;
  background: transparent;
  color: var(--app-muted);
  cursor: pointer;
}

.settings-page__sound-dropdown-preview:hover {
  background: rgba(var(--app-primary-rgb), 0.18);
  color: var(--app-primary-bright);
}

.settings-page__sound-dropdown-preview:disabled {
  cursor: not-allowed;
}

.settings-page__setting-control :deep(.p-colorpicker-preview) {
  width: 2.2rem;
  height: 2.2rem;
  border: 1px solid var(--app-border-strong);
  border-radius: 0.55rem;
  box-shadow: inset 0 0 0 0.15rem var(--app-surface-raised);
}

.settings-page__setting-control :deep(.p-button) {
  gap: 0.35rem;
  padding: 0.45rem 0.55rem;
  color: var(--app-muted);
  font-size: 0.72rem;
}

.settings-page__setting-control :deep(.p-button:hover) {
  color: var(--app-primary-bright);
  background: rgba(var(--app-primary-rgb), 0.12);
}

.settings-page__setting-control :deep(.p-selectbutton) {
  display: inline-flex;
}

.settings-page__setting-control :deep(.p-selectbutton .p-togglebutton-content) {
  border-radius: 0;
  background: transparent !important;
  box-shadow: none;
}

.settings-page__setting-control :deep(.p-selectbutton .p-togglebutton) {
  min-width: 4.2rem;
  padding: 0.45rem 0.6rem;
  border-color: var(--app-border);
  background: var(--app-control);
  color: var(--app-muted);
  font-size: 0.72rem;
}

.settings-page__setting-control :deep(.p-selectbutton .p-togglebutton.p-togglebutton-checked) {
  border-color: rgba(var(--app-primary-rgb), 0.35);
  background: rgba(var(--app-primary-rgb), 0.16);
  color: var(--app-primary-bright);
}

.settings-page__setting-control :deep(.p-disabled),
.settings-page__setting-control :deep(.p-disabled *) {
  cursor: not-allowed !important;
}

.settings-page__setting-control :deep(.p-selectbutton .p-togglebutton.p-disabled),
.settings-page__setting-control :deep(.p-selectbutton .p-togglebutton[data-p-disabled="true"]) {
  opacity: 0.42;
  filter: saturate(0.35);
}

.settings-page__setting-control :deep(.p-toggleswitch.p-disabled),
.settings-page__setting-control :deep(.p-toggleswitch[data-p-disabled="true"]) {
  opacity: 0.42;
  filter: saturate(0.35);
}

@media (max-width: 620px) {
  .settings-page__setting {
    align-items: flex-start;
    flex-direction: column;
    gap: 0.9rem;
  }
}

.app-layout > :first-child {
  flex: 1 1 auto;
  min-width: 0;
  min-height: 0;
}

.app-layout__side {
  display: flex;
  flex-direction: column;
  gap: 0.9rem;
  width: 280px;
  min-height: 0;
  flex-shrink: 0;
  overflow: hidden;
}

@media (max-width: 900px) {
  .app-layout {
    height: auto;
    min-height: 100vh;
    flex-direction: column;
  }

  .app-layout__side {
    width: 100%;
    overflow: visible;
  }

  .app-layout__side > .sidebar-section-card--scrollable {
    max-height: 32rem;
  }
}
</style>
