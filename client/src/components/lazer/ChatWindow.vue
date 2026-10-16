<script setup>
import { ref, computed, nextTick, watch, onMounted, onBeforeUnmount } from "vue";
import Button from "primevue/button";
import Textarea from "primevue/textarea";
import { Menu, Send, Hash, Timer, ClipboardCheck, Link, ArrowDown, ArrowDownToLine, Ban, ShieldCheck, Crosshair } from "@lucide/vue";
import { useNickColor } from "../../composables/useNickColor";
import { useChatSettings } from "../../composables/useChatSettings";
import { escapeRegExp, highlightTextStyle, messageHasHighlight, normalizeTeamHighlights, teamTextStyle } from "../../composables/useMessageHighlighting";
import CommandBar from "./CommandBar.vue";
import { useDarkMode } from "../../composables/useDarkMode";
import NowPlaying from "./NowPlaying.vue";
import NextMap from "./NextMap.vue";
import { parseMappoolMessage } from "../../composables/useMappoolChat";

const { nickColor: baseNickColor } = useNickColor();
const { primaryColor } = useDarkMode();
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
} = useChatSettings();

const teamHighlights = computed(() =>
  normalizeTeamHighlights([
    { name: "Team A", color: redTeamColor.value },
    { name: "Team B", color: blueTeamColor.value },
    { name: "Team Red", color: redTeamColor.value },
    { name: "Team Blue", color: blueTeamColor.value },
    { name: props.teamRedName, color: redTeamColor.value },
    { name: props.teamBlueName, color: blueTeamColor.value },
  ]),
);

const props = defineProps({
  title: { type: String, default: "Referee chat" },
  chatId: { type: String, default: "" },
  connected: { type: Boolean, default: false },
  currentUser: { type: String, default: "you" },
  refereeUsers: { type: Array, default: () => [] },
  messages: {
    type: Array,
    default: () => [],
    // each message: { id, author, text, time }
  },
  autoScrollToken: { type: Number, default: 0 },
  // room facts, shown as a small subtitle line under the title
  roomSize: { type: [Number, String], default: 16 },
  timerActive: { type: Boolean, default: false },
  timerSeconds: { type: Number, default: 0 },
  matchStartCountdownSeconds: { type: Number, default: 0 },
  format: { type: String, default: "HeadToHead" },
  roomId: { type: Number, default: null },
  roomClosed: { type: Boolean, default: false },
  nowPlaying: { type: Object, default: null },
  playlistItems: { type: Array, default: () => [] },
  currentPlaylistItemId: { type: Number, default: null },
  showProgressBar: { type: Boolean, default: true },
  showProgressTimeLabel: { type: Boolean, default: true },
  teamRedName: { type: String, default: "" },
  teamBlueName: { type: String, default: "" },
  mappoolSlots: { type: Array, default: () => [] },
  getMappoolState: { type: Function, default: null },
});

function formatTimer(seconds) {
  const totalSeconds = Math.max(0, Math.floor(seconds));
  const minutes = String(Math.floor(totalSeconds / 60)).padStart(2, "0");
  const remainder = String(totalSeconds % 60).padStart(2, "0");
  return `${minutes}:${remainder}`;
}

const timerLabel = computed(() => (props.timerActive ? formatTimer(props.timerSeconds) : "No timer active"));
const displayMessages = computed(() => [...props.messages].sort((left, right) => Number(Boolean(left.pending)) - Number(Boolean(right.pending))));

const statusLabel = computed(() => (props.connected ? "Connected" : "Disconnected"));

const emit = defineEmits(["send", "toggle-sidebar", "send-command", "start-timer", "abort-timer", "download-chat-history", "mappool-action"]);

const draft = ref("");
const sentMessageHistory = new Map();
const chatInput = ref(null);
const listEl = ref(null);
const shouldAutoScroll = ref(true);
const newMessageCount = ref(0);
const AUTO_SCROLL_THRESHOLD = 24;
const AUTO_SCROLL_DURATION = 650;
let isAutoScrolling = false;
let animationFrameId;
let autoScrollTimer;
let forceAutoScroll = false;
let applyingHistoryDraft = false;

function currentHistory() {
  const key = props.chatId || props.title;
  if (!sentMessageHistory.has(key)) {
    sentMessageHistory.set(key, { messages: [], index: -1, draftBeforeNavigation: "" });
  }
  return sentMessageHistory.get(key);
}

function setHistoryDraft(value) {
  applyingHistoryDraft = true;
  draft.value = value;
  nextTick(() => {
    applyingHistoryDraft = false;
  });
}

function handleDraftInput() {
  if (applyingHistoryDraft) return;
  const history = currentHistory();
  history.index = -1;
  history.draftBeforeNavigation = "";
}

function navigateMessageHistory(direction) {
  const history = currentHistory();
  if (!history.messages.length) return;

  if (direction < 0) {
    if (history.index === -1) {
      history.draftBeforeNavigation = draft.value;
      history.index = history.messages.length;
    }
    history.index = Math.max(0, history.index - 1);
    setHistoryDraft(history.messages[history.index]);
    return;
  }

  if (history.index === -1) return;
  if (history.index < history.messages.length - 1) {
    history.index += 1;
    setHistoryDraft(history.messages[history.index]);
  } else {
    history.index = -1;
    setHistoryDraft(history.draftBeforeNavigation);
    history.draftBeforeNavigation = "";
  }
}

function getChatInputEl() {
  const el = chatInput.value?.$el || chatInput.value;
  return el && typeof el.focus === "function" ? el : null;
}

function focusChatInput() {
  const el = getChatInputEl();
  if (!el) return false;
  el.focus();
  if (typeof el.setSelectionRange === "function") {
    const cursor = el.value.length;
    el.setSelectionRange(cursor, cursor);
  }
  return true;
}

function isTypingTarget(target) {
  if (!(target instanceof HTMLElement)) return false;
  return Boolean(target.closest("input, textarea, select, [contenteditable='true'], [role='textbox']"));
}

function insertDraftText(text) {
  draft.value += text;
  nextTick(() => {
    focusChatInput();
  });
}

function nickColor(author, team) {
  if (isReferee(author)) return "var(--app-primary)";
  if (isBanchoBot(author)) return banchoBotColor.value;
  if (team?.toLowerCase() === "red") return redTeamColor.value;
  if (team?.toLowerCase() === "blue") return blueTeamColor.value;
  if (unassignedColorMode.value === "custom") {
    return unassignedColor.value;
  }
  return baseNickColor(author, props.currentUser);
}

function isReferee(author) {
  const normalizedAuthor = normalizeNick(author);
  return !!normalizedAuthor && props.refereeUsers.some((nick) => normalizeNick(nick) === normalizedAuthor);
}

function isBanchoBot(author) {
  return author === "BanchoBot" || author === "WhistleBot";
}

function normalizeNick(nick) {
  return String(nick || "")
    .replaceAll(" ", "_")
    .toLowerCase();
}

function nickStyle(author, team) {
  const color = nickColor(author, team);
  if (isBanchoBot(author) && highlightBanchoBot.value) {
    return {
      background: banchoBotColor.value,
      color: "var(--app-bg)",
    };
  }
  if (isReferee(author) && highlightReferee.value) {
    return {
      background: "var(--app-primary-dark)",
      color: "var(--app-bg)",
    };
  }
  return { color };
}

function formatTime(time, includeSeconds) {
  if (!time) return "";
  const date = new Date(time);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    ...(includeSeconds ? { second: "2-digit" } : {}),
    hour12: false,
  });
}

function messageMinute(time) {
  if (!time) return null;
  const date = new Date(time);
  if (Number.isNaN(date.getTime())) return null;
  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}-${date.getHours()}-${date.getMinutes()}`;
}

function shouldShowTime(index) {
  if (timestampMode.value === "full") return true;
  if (index === 0) return true;
  return messageMinute(props.messages[index]?.time) !== messageMinute(props.messages[index - 1]?.time);
}

function displayTime(time, index) {
  if (!shouldShowTime(index)) return "";
  return formatTime(time, timestampMode.value === "full");
}

function messageTextStyle(text) {
  return messageHasHighlight(text, highlightWords.value) ? highlightTextStyle(highlightStyles.value, highlightMessageColor.value) : {};
}

const URL_PATTERN = /https?:\/\/[^\s<]+/gi;
const CUSTOM_LINK_START_PATTERN = /\[(https?:\/\/[^\s\]]+)\s+/gi;
const TRAILING_URL_PUNCTUATION = /[.,!?;:]+$/;

function isValidUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

function plainMessageSegments(value) {
  const segments = [];
  let lastIndex = 0;

  for (const match of value.matchAll(URL_PATTERN)) {
    const rawUrl = match[0];
    const start = match.index ?? 0;
    const url = rawUrl.replace(TRAILING_URL_PUNCTUATION, "");
    if (!url || !isValidUrl(url)) continue;

    if (start > lastIndex) {
      segments.push({ type: "text", value: value.slice(lastIndex, start) });
    }
    segments.push({ type: "link", value: url });
    if (url.length < rawUrl.length) {
      segments.push({ type: "text", value: rawUrl.slice(url.length) });
    }
    lastIndex = start + rawUrl.length;
  }

  if (lastIndex < value.length) {
    segments.push({ type: "text", value: value.slice(lastIndex) });
  }

  return segments.length ? segments : [{ type: "text", value }];
}

function messageSegments(text) {
  const value = String(text || "");
  const segments = [];
  let lastIndex = 0;
  let match;

  CUSTOM_LINK_START_PATTERN.lastIndex = 0;
  while ((match = CUSTOM_LINK_START_PATTERN.exec(value))) {
    const start = match.index ?? 0;
    let depth = 1;
    let closingIndex = -1;
    for (let index = CUSTOM_LINK_START_PATTERN.lastIndex; index < value.length; index += 1) {
      if (value[index] === "[") depth += 1;
      if (value[index] === "]") {
        depth -= 1;
        if (depth === 0) {
          closingIndex = index;
          break;
        }
      }
    }
    if (closingIndex === -1) break;

    segments.push(...plainMessageSegments(value.slice(lastIndex, start)));
    segments.push({ type: "link", value: match[1], label: value.slice(CUSTOM_LINK_START_PATTERN.lastIndex, closingIndex).trim() });
    lastIndex = closingIndex + 1;
    CUSTOM_LINK_START_PATTERN.lastIndex = lastIndex;
  }

  segments.push(...plainMessageSegments(value.slice(lastIndex)));
  return segments.length ? segments : [{ type: "text", value }];
}

function teamSegments(text) {
  const value = String(text || "");
  if (!highlightTeams.value || !teamHighlights.value.length) return [{ type: "text", value }];

  const pattern = teamHighlights.value.map((team) => escapeRegExp(team.name)).join("|");
  const matcher = new RegExp(`(^|[^\\p{L}\\p{N}_])(${pattern})(?=$|[^\\p{L}\\p{N}_])`, "giu");
  const segments = [];
  let lastIndex = 0;

  for (const match of value.matchAll(matcher)) {
    const start = match.index ?? 0;
    const prefix = match[1] || "";
    const nameStart = start + prefix.length;
    if (start > lastIndex) segments.push({ type: "text", value: value.slice(lastIndex, start) });
    if (prefix) segments.push({ type: "text", value: prefix });
    const team = teamHighlights.value.find((item) => item.name.toLowerCase() === match[2].toLowerCase());
    segments.push({ type: "team", value: match[2], color: team?.color });
    lastIndex = nameStart + match[2].length;
  }

  if (lastIndex < value.length) segments.push({ type: "text", value: value.slice(lastIndex) });
  return segments.length ? segments : [{ type: "text", value }];
}

function renderMessageSegments(text) {
  return messageSegments(text).flatMap((segment) => (segment.type === "text" ? teamSegments(segment.value) : [segment]));
}

function mappoolStatus(slotId, action) {
  const state = props.getMappoolState?.(slotId) || {};
  if (state.banned) return { kind: "status", label: "banned", value: slotId };
  if (state.picked) return { kind: "status", label: "picked", value: slotId };
  if (action === "ban" && state.protected) return { kind: "status", label: "can't ban, protected", value: slotId };
  if (action === "protect" && state.protected) return { kind: "status", label: "protected", value: slotId };
  return { kind: "action", action, value: slotId };
}

function actionIcon(action) {
  return action === "ban" ? Ban : action === "protect" ? ShieldCheck : Crosshair;
}

function mappoolSegments(message) {
  if (!props.mappoolSlots.length || message.phaseAtMessage === "finished") return [{ type: "text", value: String(message.text || "") }];
  const parsed = parseMappoolMessage(message.text, props.mappoolSlots, message.phaseAtMessage || "unknown");
  if (!parsed.slots.length) return [{ type: "text", value: String(message.text || "") }];
  const segments = [];
  let lastIndex = 0;
  for (const slot of parsed.slots) {
    if (slot.start > lastIndex) segments.push({ type: "text", value: String(message.text).slice(lastIndex, slot.start) });
    const status = mappoolStatus(slot.slotId, slot.action);
    segments.push({ type: "mappool", ...status, value: status.kind === "status" ? slot.text : status.value, text: slot.text, slotId: slot.slotId, action: slot.action });
    lastIndex = slot.end;
  }
  if (lastIndex < String(message.text).length) segments.push({ type: "text", value: String(message.text).slice(lastIndex) });
  return segments;
}

function renderChatMessageSegments(message) {
  return mappoolSegments(message).flatMap((segment) => {
    if (segment.type !== "text") return [segment];
    return messageSegments(segment.value).flatMap((nested) => (nested.type === "text" ? teamSegments(nested.value) : [nested]));
  });
}

function handleMappoolClick(segment) {
  if (segment.type !== "mappool" || segment.kind !== "action") return;
  emit("mappool-action", { slotId: segment.slotId, action: segment.action });
}

const highlightMessageColor = computed(() => {
  if (highlightColorMode.value === "accent") return primaryColor.value;
  if (highlightColorMode.value === "custom") return highlightColor.value;
  return "#ffffff";
});

function isNearBottom(el) {
  return el.scrollHeight - el.clientHeight - el.scrollTop <= AUTO_SCROLL_THRESHOLD;
}

function finishAutoScroll(el) {
  isAutoScrolling = false;
  animationFrameId = undefined;
  autoScrollTimer = undefined;
  shouldAutoScroll.value = isNearBottom(el);
}

function cancelAutoScroll() {
  if (animationFrameId !== undefined) {
    cancelAnimationFrame(animationFrameId);
    animationFrameId = undefined;
  }
  clearTimeout(autoScrollTimer);
  autoScrollTimer = undefined;
  isAutoScrolling = false;
}

function animateScrollTo(el, target) {
  cancelAutoScroll();

  const start = el.scrollTop;
  const change = target - start;
  if (Math.abs(change) < 1) return;

  isAutoScrolling = true;

  if (document.hidden) {
    el.scrollTo({ top: target, behavior: "smooth" });
    autoScrollTimer = setTimeout(() => finishAutoScroll(el), AUTO_SCROLL_DURATION + 100);
    return;
  }

  const startTime = performance.now();

  function step(now) {
    if (document.hidden) {
      el.scrollTo({ top: target, behavior: "smooth" });
      autoScrollTimer = setTimeout(() => finishAutoScroll(el), AUTO_SCROLL_DURATION + 100);
      animationFrameId = undefined;
      return;
    }

    const progress = Math.min((now - startTime) / AUTO_SCROLL_DURATION, 1);
    const eased = 1 - Math.pow(1 - progress, 4);
    el.scrollTop = start + change * eased;

    if (progress < 1) {
      animationFrameId = requestAnimationFrame(step);
    } else {
      finishAutoScroll(el);
    }
  }

  animationFrameId = requestAnimationFrame(step);
}

function scrollToBottom() {
  nextTick(() => {
    const el = listEl.value;
    if (!el) return;

    const target = Math.max(0, el.scrollHeight - el.clientHeight);
    if (target - el.scrollTop < 1) return;

    if (!shouldAutoScroll.value) return;

    animateScrollTo(el, target);
  });
}

function onScroll() {
  if (!isAutoScrolling && listEl.value) {
    const nearBottom = isNearBottom(listEl.value);
    shouldAutoScroll.value = nearBottom;
    if (nearBottom) newMessageCount.value = 0;
  }
}

function onWheel(event) {
  cancelAutoScroll();
  if (event.deltaY < 0) {
    shouldAutoScroll.value = false;
  } else if (listEl.value) {
    shouldAutoScroll.value = isNearBottom(listEl.value);
  }
}

watch(
  () => props.messages.length,
  (messageLength, previousMessageLength) => {
    const nearBottom = !listEl.value || isNearBottom(listEl.value);
    const addedMessages = Math.max(0, messageLength - (previousMessageLength ?? messageLength));
    if (addedMessages > 0 && !nearBottom && !forceAutoScroll) {
      newMessageCount.value += addedMessages;
    } else if (nearBottom || forceAutoScroll) {
      newMessageCount.value = 0;
    }

    const stickToBottom = forceAutoScroll || !listEl.value || isAutoScrolling || nearBottom;
    forceAutoScroll = false;
    if (!stickToBottom) return;
    shouldAutoScroll.value = true;
    scrollToBottom();
  },
);

function scrollToLatestMessages() {
  newMessageCount.value = 0;
  forceAutoScroll = true;
  shouldAutoScroll.value = true;
  scrollToBottom();
}

watch(
  () => props.autoScrollToken,
  () => {
    forceAutoScroll = true;
    shouldAutoScroll.value = true;
    scrollToBottom();
  },
  { flush: "post" },
);

function onGlobalKeydown(event) {
  if (props.roomClosed || event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey) return;
  if (isTypingTarget(event.target)) return;

  if (event.key === "Backspace") {
    event.preventDefault();
    draft.value = draft.value.slice(0, -1);
    nextTick(() => focusChatInput());
    return;
  }

  if (event.key === "Enter") {
    event.preventDefault();
    focusChatInput();
    return;
  }

  if (event.key === " " || (event.key.length === 1 && !event.isComposing)) {
    event.preventDefault();
    insertDraftText(event.key === " " ? " " : event.key);
    return;
  }

  event.preventDefault();
  focusChatInput();
}

onMounted(() => {
  window.addEventListener("keydown", onGlobalKeydown, true);
});

onBeforeUnmount(() => {
  window.removeEventListener("keydown", onGlobalKeydown, true);
  cancelAutoScroll();
});

function send() {
  if (props.roomClosed) return;
  const text = draft.value.trim();
  if (!text) return;
  const history = currentHistory();
  history.messages.push(text);
  if (history.messages.length > 100) history.messages.shift();
  history.index = -1;
  history.draftBeforeNavigation = "";
  forceAutoScroll = true;
  shouldAutoScroll.value = true;
  emit("send", text);
  draft.value = "";
  scrollToBottom();
}

function onKeydown(e) {
  if (e.key === "ArrowUp" && !e.shiftKey) {
    e.preventDefault();
    navigateMessageHistory(-1);
    return;
  }
  if (e.key === "ArrowDown" && !e.shiftKey) {
    e.preventDefault();
    navigateMessageHistory(1);
    return;
  }
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    send();
  }
}

function forwardCommand(command) {
  if (props.roomClosed) return;
  forceAutoScroll = true;
  shouldAutoScroll.value = true;
  emit("send-command", command);
}
</script>

<template>
  <div class="chat-window">
    <div class="chat-header">
      <div class="chat-header__title">
        <button type="button" class="chat-menu" aria-label="Toggle sidebar" @click.stop="emit('toggle-sidebar')">
          <Menu :size="18" />
        </button>
        <div class="chat-header__titlegroup">
          <span class="chat-title">{{ title }}</span>
          <div class="chat-subtitle">
            <span class="chat-subtitle__item"><Hash :size="12" />{{ roomSize }}</span>
            <span class="chat-subtitle__dot">·</span>
            <span class="chat-subtitle__item"><Timer :size="12" />{{ timerLabel }}</span>
            <span class="chat-subtitle__dot">·</span>
            <span class="chat-subtitle__item"><ClipboardCheck :size="12" />{{ format }}</span>
          </div>
        </div>
      </div>
      <div class="chat-header__right">
        <div
          class="chat-status-indicator"
          :class="{
            'chat-status-indicator--offline': !connected,
          }"
        >
          <span class="chat-status-indicator__dot" aria-hidden="true"></span>
          <span class="chat-status-indicator__label">{{ statusLabel }}</span>
        </div>
      </div>
    </div>

    <NowPlaying :map="nowPlaying" :team-red-name="teamRedName" :team-blue-name="teamBlueName" :show-progress-bar="showProgressBar" :show-progress-time-label="showProgressTimeLabel" />
    <NextMap :room-id="roomId" :items="playlistItems" :current-item-id="currentPlaylistItemId" :disabled="roomClosed" />

    <div ref="listEl" class="chat-log" @scroll="onScroll" @wheel="onWheel">
      <div class="chat-log__inner">
        <div
          v-for="(msg, index) in displayMessages"
          :key="msg.id"
          class="chat-line"
          :class="{
            'chat-line--system': msg.type === 'system' && msg.isRoll !== true,
            'chat-line--pending': msg.pending,
            'chat-line--roll': msg.isRoll === true,
          }"
        >
          <template v-if="msg.type === 'system'">
            <template v-if="msg.isRoll === true">
              <span class="chat-line__time">{{ displayTime(msg.time, index) }}</span>
              <span class="chat-line__nick chat-line__nick--badge chat-line__nick--roll">{{ msg.author }}</span>
              <span class="chat-line__text">{{ msg.text }}</span>
            </template>
            <template v-else>
              <span class="chat-line__system-rule" aria-hidden="true"></span>
              <span class="chat-line__system-text">{{ msg.text }}</span>
              <span class="chat-line__system-rule" aria-hidden="true"></span>
            </template>
          </template>
          <template v-else>
            <span class="chat-line__time">{{ displayTime(msg.time, index) }}</span>
            <span
              class="chat-line__nick"
              :class="{
                'chat-line__nick--badge': (isReferee(msg.author) && highlightReferee) || (isBanchoBot(msg.author) && highlightBanchoBot),
              }"
              :style="nickStyle(msg.author, msg.team)"
              >{{ msg.author }}</span
            >
            <span class="chat-line__text" :class="{ 'chat-line__text--action': msg.isAction === true }" :style="messageTextStyle(msg.text)">
              <template v-for="(segment, segmentIndex) in renderChatMessageSegments(msg)" :key="`${msg.id}-${segmentIndex}`">
                <a v-if="segment.type === 'link'" class="chat-line__link" :href="segment.value" target="_blank" rel="noopener noreferrer">
                  <Link :size="12" aria-hidden="true" />
                  <span>{{ segment.label || segment.value }}</span>
                </a>
                <span v-else-if="segment.type === 'team'" :style="teamTextStyle(segment.color)">{{ segment.value }}</span>
                <button
                  v-else-if="segment.type === 'mappool'"
                  type="button"
                  class="chat-line__mappool-link"
                  :class="[`chat-line__mappool-link--${segment.kind}`, `chat-line__mappool-link--${segment.action || segment.label.split(' ')[0]}`]"
                  :disabled="segment.kind !== 'action'"
                  @click="handleMappoolClick(segment)"
                >
                  <component :is="actionIcon(segment.action)" v-if="segment.kind === 'action'" :size="12" aria-hidden="true" />
                  <span>{{ segment.kind === "status" ? `${segment.label} ${segment.value}` : segment.text }}</span>
                </button>
                <template v-else>{{ segment.value }}</template>
              </template>
            </span>
          </template>
        </div>
        <button v-if="roomClosed" type="button" class="chat-history-download" @click="emit('download-chat-history')">
          <ArrowDownToLine :size="14" aria-hidden="true" />
          <span>Download chat history</span>
        </button>
      </div>
      <Transition name="chat-new-messages">
        <button v-if="newMessageCount > 0" type="button" class="chat-new-messages" @click="scrollToLatestMessages">
          <ArrowDown :size="14" aria-hidden="true" />
          <span>{{ newMessageCount }} new message{{ newMessageCount === 1 ? "" : "s" }}</span>
        </button>
      </Transition>
    </div>

    <CommandBar
      docked
      :disabled="roomClosed"
      :room-id="roomId"
      :start-countdown-seconds="matchStartCountdownSeconds"
      @send-command="forwardCommand"
      @start-timer="emit('start-timer', $event)"
      @abort-timer="emit('abort-timer')"
    />

    <div class="chat-input">
      <Textarea ref="chatInput" v-model="draft" placeholder="Write a message" rows="1" autoResize class="chat-input__field" :disabled="roomClosed" @input="handleDraftInput" @keydown="onKeydown" />
      <Button rounded aria-label="Send message" class="chat-input__send" :disabled="roomClosed || !draft.trim()" @click="send">
        <Send :size="17" />
      </Button>
    </div>
  </div>
</template>

<style scoped>
.chat-window {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
  border: 1px solid var(--app-border);
  border-radius: 0.85rem;
  overflow: hidden;
  background: var(--app-panel-gradient);
  box-shadow: 0 1.5rem 4rem rgba(0, 0, 0, 0.22);
}

.chat-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  padding: 1.05rem 1.25rem;
  border-bottom: 1px solid var(--app-border);
  flex-shrink: 0;
}

.chat-title {
  font-size: 1.1rem;
  font-weight: 800;
  color: var(--app-text);
}

.chat-header__title {
  display: flex;
  align-items: center;
  gap: 1rem;
}

.chat-header__titlegroup {
  display: flex;
  flex-direction: column;
  gap: 0.2rem;
}

.chat-subtitle {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 0.4rem;
  font-size: 0.72rem;
  color: var(--app-muted);
}

.chat-subtitle__item {
  display: inline-flex;
  align-items: center;
  gap: 0.3rem;
}

.chat-subtitle__item svg {
  flex-shrink: 0;
  opacity: 0.85;
}

.chat-subtitle__dot {
  opacity: 0.5;
}

.chat-menu {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0;
  border: 0;
  background: transparent;
  color: var(--app-muted);
  cursor: pointer;
}

.chat-header__right {
  display: flex;
  align-items: center;
  gap: 0.35rem;
  flex-wrap: wrap;
  justify-content: flex-end;
}

.chat-qualification-control {
  display: inline-flex;
  align-items: center;
  gap: 0.42rem;
  min-height: 2.65rem;
  padding: 0.45rem 0.2rem;
  color: var(--app-muted);
  font-size: 0.7rem;
  font-weight: 700;
  white-space: nowrap;
}

.chat-qualification-control > svg {
  color: var(--app-purple-bright);
}

.chat-qualification-control :deep(.p-toggleswitch) {
  flex-shrink: 0;
}

.chat-status-indicator {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  width: fit-content;
  font-size: 0.78rem;
  font-weight: 800;
  line-height: 1;
  white-space: nowrap;
}

.chat-status-indicator__dot {
  width: 0.42rem;
  height: 0.42rem;
  flex-shrink: 0;
  border-radius: 50%;
  background: var(--app-green);
}

.chat-status-indicator__label {
  color: #fff;
}

.chat-status-indicator--offline .chat-status-indicator__dot {
  background: var(--app-red);
}

.chat-log {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  position: relative;
  z-index: 0;
  padding: 1rem 1.25rem;
  font-family: "Onest", sans-serif;
  background: var(--app-log-background);
}

.chat-log__inner {
  display: flex;
  flex-direction: column;
  gap: 0.15rem;
}

.chat-history-download {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  align-self: center;
  gap: 0.35rem;
  margin: 0.85rem auto 0.45rem;
  padding: 0.2rem 0.35rem;
  border: 0;
  background: transparent;
  color: var(--app-primary-bright);
  font: inherit;
  font-size: 0.72rem;
  font-weight: 700;
  cursor: pointer;
  transition:
    color 160ms ease,
    opacity 160ms ease;
}

.chat-history-download:hover {
  color: var(--app-primary);
  opacity: 0.86;
  text-decoration: underline;
  text-underline-offset: 0.15rem;
}

.chat-new-messages {
  position: sticky;
  bottom: 0.85rem;
  display: flex;
  width: fit-content;
  align-items: center;
  gap: 0.35rem;
  margin: 0.7rem auto 0;
  padding: 0.42rem 0.75rem;
  border: 1px solid rgba(var(--app-primary-rgb), 0.45);
  border-radius: 999px;
  background: var(--app-panel);
  color: var(--app-primary);
  font: inherit;
  font-size: 0.72rem;
  font-weight: 800;
  line-height: 1;
  box-shadow: 0 0.35rem 1rem rgba(0, 0, 0, 0.24);
  cursor: pointer;
  z-index: 2;
  transition:
    background-color 180ms ease,
    color 180ms ease,
    border-color 180ms ease,
    box-shadow 180ms ease,
    transform 180ms ease;
}

.chat-new-messages:hover {
  background: var(--app-primary-dark);
  color: var(--app-primary-bright);
  border-color: var(--app-primary);
  box-shadow: 0 0.45rem 1.2rem rgba(var(--app-primary-rgb), 0.24);
  transform: translateY(-1px);
}

.chat-new-messages:focus-visible {
  outline: 2px solid var(--app-primary-bright);
  outline-offset: 2px;
}

.chat-new-messages-enter-active,
.chat-new-messages-leave-active {
  transition:
    opacity 260ms ease-out,
    transform 260ms ease-out;
}

.chat-new-messages-enter-from,
.chat-new-messages-leave-to {
  opacity: 0;
  transform: translateY(1rem);
}

.chat-line {
  display: grid;
  grid-template-columns: 4.2rem max-content minmax(0, 1fr);
  align-items: baseline;
  gap: 0.6rem;
  padding: 0.18rem 0;
}

.chat-line--pending {
  opacity: 0.5;
}

.chat-line__nick--roll {
  background: #9c0101;
  color: var(--app-bg);
}

.chat-line__text--action {
  font-style: italic;
}

.chat-line__time {
  flex-shrink: 0;
  width: 4.2rem;
  text-align: right;
  font-size: 0.7rem;
  color: var(--app-muted);
}

.chat-line__nick {
  min-width: 0;
  overflow-wrap: anywhere;
  font-size: 0.78rem;
  font-weight: 700;
  line-height: 1.4;
}

.chat-line__details {
  margin-left: 0.25rem;
  color: var(--app-muted);
  font-size: 0.7rem;
  font-weight: 600;
}

.chat-line__nick--badge {
  padding: 0.06rem 0.5rem;
  border-radius: 8px;
}

.chat-line__text {
  min-width: 0;
  color: var(--app-message-text);
  font-size: 0.8rem;
  line-height: 1.4;
  overflow-wrap: anywhere;
  word-break: break-word;
  white-space: pre-wrap;
}

.chat-line__link {
  display: inline;
  color: var(--app-primary);
  text-decoration: none;
  white-space: nowrap;
}

.chat-line__link:hover {
  color: var(--app-primary-bright);
  text-decoration: underline;
}

.chat-line__link svg {
  display: inline-block;
  margin-right: 0.22rem;
  vertical-align: -0.15em;
}

.chat-line__mappool-link {
  display: inline-flex;
  align-items: center;
  gap: 0.18rem;
  margin: 0;
  padding: 0;
  border: 0;
  background: transparent;
  font: inherit;
  font-weight: 700;
  line-height: inherit;
  cursor: pointer;
  transform: translateY(2px);
}

.chat-line__mappool-link--pick {
  color: var(--app-green);
}

.chat-line__mappool-link--ban {
  color: var(--app-red);
}

.chat-line__mappool-link--protect {
  color: var(--app-yellow, #e7c45d);
}

.chat-line__mappool-link--status {
  color: var(--app-muted);
  font-style: italic;
  font-weight: 600;
  cursor: default;
}

.chat-line__mappool-link:disabled {
  opacity: 1;
}

.chat-line__mappool-link:not(:disabled):hover {
  text-decoration: underline;
  text-underline-offset: 0.14em;
}

.chat-line--system {
  display: flex;
  align-items: center;
  gap: 0.8rem;
  padding: 0.35rem 0;
}

@media (max-width: 640px) {
  .chat-header__right {
    gap: 0.25rem;
  }

  .chat-qualification-control {
    min-height: 2.35rem;
    padding: 0.35rem 0.45rem;
  }

  .chat-qualification-control > span {
    display: none;
  }

  .chat-line {
    grid-template-columns: 3.2rem max-content minmax(0, 1fr);
    gap: 0.4rem;
  }

  .chat-line__time {
    width: auto;
  }
}

.chat-line__system-rule {
  flex: 1 1 auto;
  height: 1px;
  background: linear-gradient(90deg, transparent, rgba(var(--app-primary-rgb), 0.55));
}

.chat-line__system-rule:last-child {
  background: linear-gradient(90deg, rgba(var(--app-primary-rgb), 0.55), transparent);
}

.chat-line__system-text {
  flex: 0 0 auto;
  color: var(--app-primary-bright);
  font-size: 0.76rem;
  font-weight: 700;
  text-align: center;
}

.chat-input {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.6rem 1.25rem;
  border-top: 1px solid var(--app-border);
  position: relative;
  z-index: 1;
  flex-shrink: 0;
  background: var(--app-surface);
}

.chat-input__field {
  flex: 1;
  resize: none;
  max-height: 6rem;
  min-height: 2.7rem;
  padding: 0.55rem 0.75rem;
  line-height: 1.4rem;
  border: 1px solid var(--app-border);
  border-radius: 0.6rem;
  transition:
    border-color 180ms ease,
    box-shadow 180ms ease;
}

.chat-input__field:enabled:focus {
  border-color: rgba(var(--app-primary-rgb), 0.85);
  box-shadow: 0 0 0 1px rgba(var(--app-primary-rgb), 0.18);
}

.chat-input__field:disabled {
  border-color: var(--app-border-strong);
  background: var(--app-surface-hover) !important;
  color: var(--app-muted);
  opacity: 1;
}

.chat-input__field:disabled::placeholder {
  color: var(--app-muted);
  opacity: 0.7;
}

.chat-input__send {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0;
  width: 2.7rem;
  height: 2.7rem;
  min-height: 2.7rem;
  border-radius: 50%;
  flex-shrink: 0;
  border: 1px solid rgba(var(--app-primary-bright-rgb), 0.55);
  background: var(--app-purple);
  color: #ffffff;
  transition: 180ms ease;
}

.chat-input__send:hover:not(:disabled) {
  border-color: rgba(var(--app-primary-bright-rgb), 0.8);
  background: var(--app-purple-bright);
  transform: translateY(-1px);
}

.chat-input__send:disabled {
  opacity: 0.45;
}
</style>
