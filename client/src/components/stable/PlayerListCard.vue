<script setup>
import { computed } from "vue";
import { Ban, CircleCheck, CircleMinus, Lock, LockOpen, Settings, Users } from "@lucide/vue";
import { useNickColor } from "../../composables/useNickColor";
import { useChatSettings } from "../../composables/useChatSettings";
import SvgMarkup from "../SvgMarkup.vue";
import modsMetadata from "../../assets/mods/mods.json";
import modHexRaw from "../../assets/mods/mod-icon.svg?raw";

const modIconSources = import.meta.glob("../../assets/mods/*/*.svg", { eager: true, query: "?raw", import: "default" });

function svgBody(raw) {
  return String(raw || "")
    .replace(/<defs>[\s\S]*?<\/defs>/g, "")
    .replace(/\sclip-path="[^"]*"/g, "")
    .replace(/^[\s\S]*?<svg[^>]*>/, "")
    .replace(/<\/svg>\s*$/, "");
}

const hexBody = svgBody(modHexRaw);

const props = defineProps({
  players: {
    type: Array,
    default: () => [],
    // each: { name, profileUrl, isHost, isReady, avatarUrl, mods }
    // mods is an optional array of mod acronyms, e.g. ['HD', 'DT'] -
    // rendered as small icons once mod art is wired in
  },
  currentUser: { type: String, default: "" },
  disabled: { type: Boolean, default: false },
});
const emit = defineEmits(["open-players"]);

const { nickColor } = useNickColor();
const { redTeamColor, blueTeamColor } = useChatSettings();

const MOD_CODES = Object.freeze({
  easy: "EZ",
  nofail: "NF",
  halftime: "HT",
  hardrock: "HR",
  suddendeath: "SD",
  doubletime: "DT",
  hidden: "HD",
  flashlight: "FL",
  relax: "RX",
  relax2: "AP",
  spunout: "SO",
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

const visiblePlayers = computed(() => props.players.filter((player) => !player.isReferee));
const realPlayerCount = computed(() => visiblePlayers.value.filter((player) => !player.isSlot).length);

function colorFor(player) {
  if (player.team === "red") return redTeamColor.value;
  if (player.team === "blue") return blueTeamColor.value;
  return nickColor(player.name, props.currentUser);
}

function initials(name) {
  return name.slice(0, 2).toUpperCase();
}

function playerNameStyle(player) {
  if (player.isSlot) return { color: "var(--app-muted)" };
  if (player.team === "red") return { color: redTeamColor.value };
  if (player.team === "blue") return { color: blueTeamColor.value };
  return { color: nickColor(player.name, props.currentUser) };
}

function modCode(mod) {
  const value = String(typeof mod === "string" ? mod : mod?.acronym || mod?.name || "").trim();
  return MOD_CODES[value.toLowerCase()] || value.toUpperCase();
}

function playerMods(player) {
  return (player.mods || []).map(modCode).filter((mod, index, mods) => mods.indexOf(mod) === index);
}

const categoryColors = Object.freeze({
  DifficultyReduction: ["#b3ff66", "#3c591e"],
  DifficultyIncrease: ["#ff6666", "#591e1e"],
  Automation: ["#66ccff", "#1e4659"],
  Conversion: ["#8c66ff", "#2d1e59"],
  Fun: ["#ff66ab", "#591e39"],
  System: ["#ffcc22", "#594605"],
});

function modInfo(player, acronym) {
  const rulesetMods = modsMetadata.find((entry) => Number(entry.RulesetID) === Number(player.rulesetId ?? 0))?.Mods || [];
  return rulesetMods.find((entry) => String(entry.Acronym).toUpperCase() === String(acronym).toUpperCase()) || null;
}

function modIconSvg(player, acronym) {
  const mod = modInfo(player, acronym);
  if (!mod) return "";
  const folder = String(mod.Type || "")
    .replace(/([a-z])([A-Z])/g, "$1-$2")
    .toLowerCase();
  const slug = String(mod.Name || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  const raw = modIconSources[`../../assets/mods/${folder}/${slug}.svg`];
  const colors = categoryColors[mod.Type];
  if (!raw || !colors) return "";
  const hex = hexBody.replace(/fill="white"/g, `fill="${colors[0]}"`);
  const glyph = svgBody(raw).replace(/(fill|stroke)="white"/g, `$1="${colors[1]}"`);
  return `<svg viewBox="10 7 100 70" fill="none" aria-hidden="true"><g transform="translate(10 7)">${hex}</g><g transform="translate(60 42) scale(.85) translate(-60 -42)">${glyph}</g></svg>`;
}

function moreModsIconSvg() {
  const hex = hexBody.replace(/fill="white"/g, 'fill="#ffcc22"');
  const glyph = `<g fill="#594605"><circle cx="12" cy="12" r="1.8"/><circle cx="19" cy="12" r="1.8"/><circle cx="5" cy="12" r="1.8"/></g>`;
  return `<svg viewBox="10 7 100 70" fill="none" aria-hidden="true"><g transform="translate(10 7)">${hex}</g><g transform="translate(60 42) scale(3.7) translate(-12 -12)">${glyph}</g></svg>`;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function moreModsTooltip(player, mods) {
  const rows = mods
    .slice(3)
    .map((acronym) => {
      const info = modInfo(player, acronym);
      const name = info?.Name || modCode(acronym);
      const icon = modIconSvg(player, acronym);
      return `<span class="app-tooltip__more-mod-row"><span class="app-tooltip__more-mod-icon">${icon || escapeHtml(modCode(acronym))}</span><span>${escapeHtml(name)}</span></span>`;
    })
    .join("");
  return { html: `<div class="app-tooltip__more-mods">${rows}</div>`, interactive: true };
}
</script>

<template>
  <div class="player-list">
    <div class="player-list__header">
      <span class="player-list__heading"><Users :size="18" /> Players</span>
      <span class="player-list__header-actions">
        <span class="player-list__count">{{ realPlayerCount }}</span>
        <button v-tooltip.top="'Manage players'" type="button" class="player-list__settings" :disabled="disabled" aria-label="Manage players" @click="emit('open-players')">
          <Settings :size="14" />
        </button>
      </span>
    </div>

    <ul class="player-list__items" :class="{ 'player-list__items--scrollable': visiblePlayers.length > 5 }">
      <li v-for="player in visiblePlayers" :key="player.name" class="player-row">
        <span
          v-if="player.isSlot"
          v-tooltip.top="player.isLocked ? 'Locked slot' : 'Open slot'"
          class="player-row__avatar player-row__avatar--slot"
          :class="{ 'player-row__avatar--locked': player.isLocked }"
        >
          <Lock v-if="player.isLocked" :size="13" />
          <LockOpen v-else :size="13" />
        </span>
        <span v-else-if="player.avatarUrl" class="player-row__avatar" :style="{ backgroundImage: `url(${player.avatarUrl})` }" />
        <span v-else class="player-row__avatar player-row__avatar--placeholder" :style="{ background: colorFor(player) }">{{ initials(player.name) }}</span>

        <span class="player-row__identity">
          <a v-if="player.profileUrl" class="player-row__name player-row__name--link" :style="playerNameStyle(player)" :href="player.profileUrl" target="_blank" rel="noopener noreferrer">
            {{ player.name }}
          </a>
          <span v-else class="player-row__name" :style="playerNameStyle(player)">
            {{ player.name }}
          </span>
          <svg v-if="player.isHost" class="player-row__host" width="13" height="13" viewBox="0 0 24 24" fill="currentColor" role="img" aria-label="Host">
            <path stroke="none" d="M0 0h24v24H0z" fill="none" />
            <path
              d="M19 19h-14c-.5 0 -.9 -.3 -1 -.8l-2 -10c0 -.4 .1 -.8 .5 -1.1c.4 -.2 .8 -.2 1.1 0l4.1 3.3l3.4 -5.1c.4 -.6 1.3 -.6 1.7 0l3.4 5.1l4.1 -3.3c.3 -.3 .8 -.3 1.1 0c.4 .2 .5 .6 .5 1.1l-2 10c0 .5 -.5 .8 -1 .8z"
            />
          </svg>
        </span>
        <span v-if="player.isSlot" class="player-row__slot-state" :class="{ 'player-row__slot-state--locked': player.isLocked }">
          {{ player.isLocked ? "Locked" : "Open" }}
        </span>

        <span v-if="playerMods(player).length" class="player-row__mods" :class="{ 'player-row__mods--overlapped': playerMods(player).length > 3 }">
          <span
            v-for="mod in playerMods(player).slice(0, 3)"
            :key="mod"
            v-tooltip.top="modInfo(player, mod)?.Name || modCode(mod)"
            class="player-row__mod"
            :aria-label="modInfo(player, mod)?.Name || modCode(mod)"
          >
            <SvgMarkup v-if="modIconSvg(player, mod)" :svg="modIconSvg(player, mod)" />
            <span v-else class="player-row__mod-fallback">{{ modCode(mod) }}</span>
          </span>
          <span v-if="playerMods(player).length > 3" v-tooltip.top="moreModsTooltip(player, playerMods(player))" class="player-row__mod player-row__mod--more" aria-label="More mods"
            ><SvgMarkup :svg="moreModsIconSvg()"
          /></span>
        </span>

        <span v-if="!player.isSlot && player.noMap" v-tooltip.top="'No Map'" class="player-row__no-map">
          <Ban :size="14" />
        </span>
        <span v-else-if="!player.isSlot" class="player-row__status" :data-ready="player.isReady">
          <CircleCheck v-if="player.isReady" v-tooltip.top="'Ready'" :size="14" />
          <CircleMinus v-else v-tooltip.top="'Not ready'" :size="14" />
        </span>
      </li>

      <li v-if="!visiblePlayers.length" class="player-list__empty">No players yet</li>
    </ul>
  </div>
</template>

<style scoped>
.player-list {
  display: flex;
  flex-direction: column;
  gap: 0.8rem;
  padding: 1.1rem 1.2rem;
  border: 1px solid var(--app-border);
  border-radius: 0.85rem;
  background: var(--app-panel-gradient);
}

.player-list__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.player-list__heading {
  display: flex;
  align-items: center;
  gap: 0.65rem;
  color: var(--app-text);
  font-size: 0.82rem;
  font-weight: 800;
  text-transform: uppercase;
}

.player-list__heading svg {
  color: var(--app-purple-bright);
}

.player-list__count {
  padding: 0.15rem 0.5rem;
  border-radius: 999px;
  background: var(--app-surface-hover);
  font-size: 0.72rem;
  color: var(--app-text);
}

.player-list__header-actions {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
}

.player-list__settings {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 1.7rem;
  height: 1.7rem;
  padding: 0;
  border: 0;
  border-radius: 0.45rem;
  background: transparent;
  color: var(--app-muted);
  cursor: pointer;
  transition:
    color 140ms ease,
    background 140ms ease;
}

.player-list__settings:hover {
  background: var(--app-surface-hover);
  color: var(--app-primary-bright);
}

.player-list__settings:disabled {
  cursor: not-allowed;
  opacity: 0.38;
}

.player-list__settings:disabled:hover {
  background: transparent;
  color: var(--app-muted);
}

.player-list__settings:focus-visible {
  outline: 2px solid var(--app-primary-bright);
  outline-offset: 2px;
}

.player-list__items {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
}

.player-list__items--scrollable {
  max-height: calc(5 * 1.375rem + 4 * 0.4rem);
  overflow-y: auto;
  margin-right: -1.2rem;
  padding-right: 1.2rem;
}

.player-row {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 0.85rem;
  color: var(--app-text);
}

.player-row__avatar {
  width: 22px;
  height: 22px;
  border-radius: 50%;
  flex-shrink: 0;
  background-size: cover;
  background-position: center;
}

.player-row__avatar--placeholder {
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 0.6rem;
  font-weight: 700;
  color: #fff;
}

.player-row__avatar--slot {
  display: flex;
  align-items: center;
  justify-content: center;
  color: #737985;
  background: var(--app-surface-hover);
}

.player-row__avatar--slot.player-row__avatar--locked {
  color: #4d535f;
}

.player-row__name {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.player-row__identity {
  display: flex;
  align-items: center;
  flex: 1 1 auto;
  min-width: 0;
  gap: 0.3rem;
}

.player-row__slot-state {
  flex-shrink: 0;
  color: #737985;
  font-size: 0.68rem;
  font-weight: 600;
}

.player-row__slot-state--locked {
  color: #4d535f;
}

.player-row__name--link {
  text-decoration: none;
}

.player-row__name--link:hover {
  text-decoration: underline;
}

.player-row__mods {
  display: flex;
  align-items: center;
  gap: 0.2rem;
  flex-shrink: 0;
}

.player-row__mod {
  display: inline-flex;
  width: 1.55rem;
  height: 1.1rem;
  flex: 0 0 auto;
  align-items: center;
  justify-content: center;
  color: transparent;
}

.player-row__mod :deep(svg) {
  display: block;
  width: 100%;
  height: 100%;
}

.player-row__mods--overlapped {
  gap: 0;
}

.player-row__mods--overlapped .player-row__mod {
  position: relative;
  margin-left: -0.58rem;
  transition:
    margin-left 150ms ease,
    transform 150ms ease;
}

.player-row__mods--overlapped .player-row__mod:first-child {
  margin-left: 0;
}

.player-row__mods--overlapped .player-row__mod:hover {
  z-index: 2;
}

.player-row__mods--overlapped:hover .player-row__mod {
  margin-left: 0;
}

.player-row__mods--overlapped:hover {
  gap: 0.28rem;
}

.player-row__mod--more {
  cursor: default;
}

.player-row__mod-fallback {
  color: var(--app-muted);
  font-size: 0.55rem;
  font-weight: 700;
}

.player-row__host {
  flex-shrink: 0;
  color: var(--p-yellow-400, #eab308);
}

.player-row__ready {
  flex-shrink: 0;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--app-muted);
  opacity: 0.4;
}

.player-row__ready[data-ready="true"] {
  background: var(--p-green-500, #22c55e);
  opacity: 1;
}

.player-row__status {
  display: inline-flex;
  flex-shrink: 0;
  align-items: center;
  justify-content: center;
}

.player-row__status[data-ready="true"] {
  color: #22c55e;
}

.player-row__status[data-ready="false"] {
  color: #ef4444;
}

.player-row__no-map {
  display: inline-flex;
  flex-shrink: 0;
  color: var(--p-red-500, #ef4444);
}

.player-list__empty {
  font-size: 0.8rem;
  color: var(--app-muted);
  padding: 0.4rem 0;
}
</style>
