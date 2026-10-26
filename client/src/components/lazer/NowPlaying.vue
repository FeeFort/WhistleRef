<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { Check, Clock3, Gamepad2, Play } from "@lucide/vue";
import { useChatSettings } from "../../composables/useChatSettings";
import { beatmapCoverBackground } from "../../composables/useBeatmapCover";
import ModIconList from "../ModIconList.vue";

const props = defineProps({
  map: { type: Object, default: null },
  teamRedName: { type: String, default: "" },
  teamBlueName: { type: String, default: "" },
  showProgressBar: { type: Boolean, default: true },
  showProgressTimeLabel: { type: Boolean, default: true },
});

const chatSettings = useChatSettings();
const progressContainer = ref(null);
const progressLabel = ref(null);
const progressPercent = ref(0);
const elapsedSeconds = ref(0);
const labelPosition = ref(0);
const progressDelayElapsed = ref(false);
let progressInterval;
let progressResizeObserver;
const PROGRESS_START_DELAY_SECONDS = 5;

function formatElapsed(seconds) {
  const total = Math.max(0, Math.floor(seconds));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}

const mapDuration = computed(() => {
  const total = Number(props.map?.totalSeconds);
  return Number.isFinite(total) && total > 0 ? formatElapsed(total) : "";
});
const rulesetName = computed(() => ({ 0: "osu!", 1: "osu!taiko", 2: "osu!catch", 3: "osu!mania" })[Number(props.map?.rulesetId)] || "osu!");

function updateProgress() {
  const map = props.map;
  const total = Number(map?.totalSeconds);
  if (!map || !props.showProgressBar || map.status !== "playing" || map.progressAborted || !map.startTimestamp || !Number.isFinite(total) || total <= 0) {
    progressDelayElapsed.value = false;
    progressPercent.value = 0;
    elapsedSeconds.value = 0;
    return;
  }
  const elapsedSinceMatchStart = Math.max(0, (Date.now() - map.startTimestamp) / 1000);
  progressDelayElapsed.value = elapsedSinceMatchStart >= PROGRESS_START_DELAY_SECONDS;
  const elapsed = Math.max(0, elapsedSinceMatchStart - PROGRESS_START_DELAY_SECONDS);
  elapsedSeconds.value = elapsed;
  progressPercent.value = Math.min(100, (elapsed / total) * 100);
  nextTick(updateLabelPosition);
}

function updateLabelPosition() {
  const containerWidth = progressContainer.value?.getBoundingClientRect().width || 0;
  const labelWidth = progressLabel.value?.getBoundingClientRect().width || 0;
  if (!containerWidth || !labelWidth) return;
  const rawPct = progressPercent.value;
  const minPct = (labelWidth / 2 / containerWidth) * 100;
  const maxPct = 100 - minPct;
  labelPosition.value = Math.min(Math.max(rawPct, minPct), maxPct);
}

function startProgressUpdates() {
  window.clearInterval(progressInterval);
  updateProgress();
  progressInterval = window.setInterval(updateProgress, 1000);
}

watch(() => [props.map?.id, props.map?.status, props.map?.startTimestamp, props.showProgressBar], startProgressUpdates, { immediate: true });
watch(
  () => props.showProgressTimeLabel,
  () => nextTick(updateLabelPosition),
);
onMounted(() => {
  progressResizeObserver = new ResizeObserver(updateLabelPosition);
  if (progressContainer.value) progressResizeObserver.observe(progressContainer.value);
  updateLabelPosition();
});
onBeforeUnmount(() => {
  window.clearInterval(progressInterval);
  progressResizeObserver?.disconnect();
});

const statusIcon = computed(() => (props.map?.status === "playing" ? Play : props.map?.status === "finished" ? Check : Clock3));
const statusLabel = computed(() => (props.map?.status === "playing" ? "Playing" : props.map?.status === "finished" ? "Finished" : props.map?.error ? "Unable to load map" : "Waiting for start"));
const beatmapUrl = computed(() => {
  const beatmapId = props.map?.beatmapId ?? props.map?.id;
  return beatmapId ? `https://osu.ppy.sh/b/${beatmapId}` : "";
});
const backgroundImage = computed(() => {
  return beatmapCoverBackground(props.map?.beatmapsetId);
});
const modLabels = Object.freeze({
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
const mods = computed(() => {
  const source = Array.isArray(props.map?.mods) ? props.map.mods : String(props.map?.mods || "").split(/\s*,\s*|\s+/);
  return source
    .map((mod) => {
      const acronym = typeof mod === "string" ? mod : mod?.acronym;
      return { acronym: modLabels[String(acronym || "").toLowerCase()] || String(acronym || "").toUpperCase(), settings: typeof mod === "object" ? mod.settings || {} : {} };
    })
    .filter((mod) => mod.acronym && !/^(?:enabled|disabled)$/i.test(mod.acronym))
    .filter((mod, index, values) => values.findIndex((candidate) => candidate.acronym === mod.acronym) === index);
});
function normalizeTeamName(value) {
  return String(value || "")
    .trim()
    .replace(/_/g, " ")
    .replace(/\s+/g, " ")
    .toLowerCase();
}
const pickedByClass = computed(() => {
  const explicitTeam = normalizeTeamName(props.map?.pickedByTeam);
  if (explicitTeam === "red" || explicitTeam === "blue") return explicitTeam;
  const value = normalizeTeamName(props.map?.pickedBy);
  const redName = normalizeTeamName(props.teamRedName);
  const blueName = normalizeTeamName(props.teamBlueName);
  if (value && redName && (value === redName || value.includes(redName) || redName.includes(value))) return "red";
  if (value && blueName && (value === blueName || value.includes(blueName) || blueName.includes(value))) return "blue";
  if (value.includes("red")) return "red";
  if (value.includes("blue")) return "blue";
  return "other";
});
const pickedByStyle = computed(() => {
  if (pickedByClass.value === "red") return { color: chatSettings.redTeamColor.value };
  if (pickedByClass.value === "blue") return { color: chatSettings.blueTeamColor.value };
  return {};
});
</script>

<template>
  <Transition name="now-playing">
    <section v-if="map" ref="progressContainer" class="now-playing" :class="`now-playing--${map.status || 'waiting'}`" :style="{ '--now-playing-image': backgroundImage }" aria-label="Now Playing">
      <div class="now-playing__backdrop" aria-hidden="true"></div>
      <div class="now-playing__content">
        <div class="now-playing__details">
          <div v-if="map.error" class="now-playing__title">{{ map.error }}</div>
          <div v-else class="now-playing__title">
            <a v-if="beatmapUrl" class="now-playing__beatmap-link" :href="beatmapUrl" target="_blank" rel="noopener noreferrer">
              {{ map.artist || "Unknown artist" }} - {{ map.title || "Unknown title" }} <span v-if="map.diff">[{{ map.diff }}]</span>
            </a>
            <template v-else>
              {{ map.artist || "Unknown artist" }} - {{ map.title || "Unknown title" }} <span v-if="map.diff">[{{ map.diff }}]</span>
            </template>
            <span v-if="map.mapperName" class="now-playing__mapper">mapped by {{ map.mapperName }}</span>
          </div>
          <div class="now-playing__meta">
            <span v-if="map.starRating != null">★ {{ Number(map.starRating).toFixed(2) }}</span>
            <span v-if="map.starRating != null && mapDuration" class="now-playing__separator">·</span>
            <span v-if="mapDuration">◷ {{ mapDuration }}</span>
            <span v-if="mapDuration" class="now-playing__separator">·</span>
            <span class="now-playing__ruleset"><Gamepad2 :size="11" />{{ rulesetName }}</span>
            <span v-if="map.pickedBy" class="now-playing__separator">·</span>
            <span v-if="map.pickedBy"
              >picked by <b class="now-playing__team" :class="`now-playing__team--${pickedByClass}`" :style="pickedByStyle">{{ map.pickedBy }}</b></span
            >
            <span v-if="mods.length" class="now-playing__separator">·</span>
            <ModIconList :mods="mods" :ruleset-id="map.rulesetId" :beatmap="map" show-settings />
          </div>
        </div>
        <div class="now-playing__status"><component :is="statusIcon" :size="13" />{{ statusLabel }}</div>
      </div>
      <Transition name="now-playing-progress">
        <div
          v-if="showProgressBar && map.status === 'playing' && !map.progressAborted && progressDelayElapsed && mapDuration && Number(map.totalSeconds) > 0"
          class="now-playing__progress"
          aria-label="Map progress"
        >
          <span v-if="showProgressTimeLabel" ref="progressLabel" class="now-playing__progress-label" :style="{ left: `${labelPosition}%` }">{{ formatElapsed(elapsedSeconds) }}</span>
          <span class="now-playing__progress-track"><span class="now-playing__progress-fill" :style="{ width: `${progressPercent}%` }"></span></span>
        </div>
      </Transition>
    </section>
  </Transition>
</template>

<style scoped>
.now-playing {
  position: relative;
  overflow: hidden;
  border-top: 1px solid var(--app-border);
  border-bottom: 1px solid var(--app-border);
  background: var(--app-surface);
  color: var(--app-text);
}
.now-playing__backdrop,
.now-playing__backdrop::before,
.now-playing__backdrop::after {
  position: absolute;
  inset: 0;
  pointer-events: none;
}
.now-playing__backdrop {
  background: var(--app-surface);
}
.now-playing__backdrop::before {
  content: "";
  right: auto;
  width: 50%;
  background-image: var(--now-playing-image);
  background-position: left center;
  background-size: cover;
  background-repeat: no-repeat;
  filter: brightness(0.62);
  -webkit-mask-image: linear-gradient(90deg, #000 0%, #000 48%, rgba(0, 0, 0, 0.92) 62%, rgba(0, 0, 0, 0.42) 82%, transparent 100%);
  mask-image: linear-gradient(90deg, #000 0%, #000 48%, rgba(0, 0, 0, 0.92) 62%, rgba(0, 0, 0, 0.42) 82%, transparent 100%);
}
.now-playing__backdrop::after {
  content: "";
  background: linear-gradient(90deg, rgba(0, 0, 0, 0.42) 0%, rgba(0, 0, 0, 0.44) 42%, rgba(8, 8, 14, 0.62) 70%, var(--app-surface) 100%);
}
.now-playing__content {
  position: relative;
  z-index: 1;
  display: flex;
  align-items: center;
  gap: 1rem;
  min-height: 3.2rem;
  padding: 0.45rem 1.4rem;
  text-shadow: 0 1px 2px rgba(0, 0, 0, 0.7);
}
.now-playing__details {
  min-width: 0;
}
.now-playing__title {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 0.8rem;
  font-weight: 800;
}
.now-playing__beatmap-link {
  color: inherit;
  text-decoration: none;
}
.now-playing__beatmap-link:hover {
  text-decoration: underline;
}
.now-playing__mapper {
  margin-left: 0.375rem;
  color: rgba(255, 255, 255, 0.45);
  font-size: 0.6875rem;
  font-weight: 400;
}
.now-playing__meta {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 0.28rem;
  margin-top: 0.18rem;
  color: rgba(255, 255, 255, 0.75);
  font-size: 0.66rem;
  text-shadow: 0 1px 4px rgba(0, 0, 0, 0.6);
}
.now-playing__separator {
  color: rgba(255, 255, 255, 0.35);
}
.now-playing__ruleset {
  display: inline-flex;
  align-items: center;
  gap: 0.18rem;
}
.now-playing__team--red {
  color: var(--app-red, #ff6d78);
}
.now-playing__team--blue {
  color: var(--app-blue, #63b3ff);
}
.now-playing__mod {
  padding: 0.12rem 0.12rem;
  color: var(--app-text);
}
.now-playing__status {
  display: inline-flex;
  align-items: center;
  gap: 0.3rem;
  flex: 0 0 auto;
  margin-left: auto;
  padding: 0.32rem 0.5rem;
  background: transparent;
  color: var(--app-primary-bright);
  font-size: 0.68rem;
  font-weight: 800;
  white-space: nowrap;
}
.now-playing--finished .now-playing__status {
  color: var(--app-green);
}
.now-playing--waiting .now-playing__status {
  color: var(--app-amber);
}
.now-playing__progress {
  position: absolute;
  right: 0;
  bottom: 0;
  left: 0;
  z-index: 2;
  height: 3px;
}
.now-playing__progress-track {
  display: block;
  width: 100%;
  height: 100%;
  background: rgba(255, 255, 255, 0.15);
}
.now-playing__progress-fill {
  display: block;
  height: 100%;
  background: var(--app-primary);
  transition: width 1s linear;
}
.now-playing__progress-label {
  position: absolute;
  bottom: 0.28rem;
  z-index: 1;
  transform: translateX(-50%);
  padding: 0.08rem 0.24rem;
  border-radius: 3px;
  background: rgba(0, 0, 0, 0.65);
  color: rgba(255, 255, 255, 0.85);
  font-size: 10px;
  line-height: 1.2;
  white-space: nowrap;
  transition: left 1s linear;
}
.now-playing-progress-enter-active,
.now-playing-progress-leave-active {
  transition: opacity 0.35s linear;
}
.now-playing-progress-enter-from,
.now-playing-progress-leave-to {
  opacity: 0;
}
.now-playing-enter-active,
.now-playing-leave-active {
  max-height: 5rem;
  transition: max-height 0.5s linear;
}
.now-playing-enter-from,
.now-playing-leave-to {
  max-height: 0;
}
</style>
