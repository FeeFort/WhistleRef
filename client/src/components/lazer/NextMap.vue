<script setup>
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from "vue";
import Button from "primevue/button";
import Dialog from "primevue/dialog";
import InputText from "primevue/inputtext";
import { useToast } from "primevue/usetoast";
import { ArrowRightLeft, Gamepad2, ListMusic, Plus, RefreshCw, Trash2 } from "@lucide/vue";
import { useServerConnection } from "../../composables/useServerConnection";
import { beatmapCoverBackground } from "../../composables/useBeatmapCover";
import { getLazerCachedBeatmap, loadLazerCachedBeatmap } from "../../composables/useLazerRoomResourceCache";
import ModIconList from "../ModIconList.vue";
import PlaylistModsModal from "./PlaylistModsModal.vue";

const props = defineProps({
  roomId: { type: Number, default: null },
  items: { type: Array, default: () => [] },
  currentItemId: { type: Number, default: null },
  disabled: { type: Boolean, default: false },
});

const visible = ref(false);
const beatmapId = ref("");
const submitting = ref(false);
const removingId = ref(null);
const swappingItemId = ref(null);
const modsSettingsVisible = ref(false);
const modsItemId = ref(null);
const toast = useToast();
const { addLazerPlaylistItem, editLazerCurrentPlaylistItem, editLazerPlaylistItem, removeLazerPlaylistItem, requestApi, lastEvent } = useServerConnection();
const beatmaps = reactive({});
const loadingBeatmapIds = new Set();

const orderedItems = computed(() => [...props.items].sort((left, right) => Number(left.order) - Number(right.order)));
const nextItem = computed(() => orderedItems.value.find((item) => Number(item.id) !== Number(props.currentItemId) && !item.was_played) || null);
const parsedBeatmapId = computed(() => Number.parseInt(beatmapId.value.trim(), 10));
const isSwapping = computed(() => swappingItemId.value !== null);
const swappingItem = computed(() => orderedItems.value.find((item) => Number(item.id) === Number(swappingItemId.value)) || null);
const modsItem = computed(() => orderedItems.value.find((item) => Number(item.id) === Number(modsItemId.value)) || null);
const canAdd = computed(() => Number.isInteger(parsedBeatmapId.value) && parsedBeatmapId.value > 0 && Number.isInteger(props.roomId) && props.roomId > 0);
const canSubmit = computed(() => (isSwapping.value ? canAdd.value && swappingItem.value : canAdd.value));

function itemLabel(item) {
  const preview = beatmaps[item.beatmap_id];
  if (!preview) return `Beatmap #${item.beatmap_id}`;
  return `${preview.artist || "Unknown artist"} - ${preview.title || "Unknown title"}${preview.diff ? ` [${preview.diff}]` : ""}`;
}

function itemMapper(item) {
  return beatmaps[item?.beatmap_id]?.mapperName || "";
}

function itemMeta(item) {
  const preview = beatmaps[item?.beatmap_id];
  if (!preview) return [];
  const values = [];
  if (Number.isFinite(Number(preview.starRating))) values.push(`★ ${Number(preview.starRating).toFixed(2)}`);
  if (Number.isFinite(Number(preview.totalSeconds)) && Number(preview.totalSeconds) > 0) {
    const seconds = Math.floor(Number(preview.totalSeconds));
    values.push(`◷ ${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`);
  }
  return values;
}

function itemMods(item) {
  return itemModsFrom(item, "required_mods");
}

function itemModsFrom(item, field) {
  return (Array.isArray(item?.[field]) ? item[field] : [])
    .map((mod) => (typeof mod === "string" ? mod : { acronym: mod?.acronym, settings: mod?.settings || {} }))
    .filter((mod) => (typeof mod === "string" ? mod : mod.acronym));
}

function itemRuleset(item) {
  return { 0: "osu!", 1: "osu!taiko", 2: "osu!catch", 3: "osu!mania" }[Number(item?.ruleset_id)] || "osu!";
}

function itemBackground(item) {
  return beatmapCoverBackground(beatmaps[item?.beatmap_id]?.beatmapsetId);
}

async function loadBeatmap(item) {
  const id = Number(item?.beatmap_id);
  if (!Number.isInteger(id) || id <= 0 || beatmaps[id] || loadingBeatmapIds.has(id)) return;
  const cached = getLazerCachedBeatmap(props.roomId, id);
  if (cached) {
    beatmaps[id] = cached;
    return;
  }
  loadingBeatmapIds.add(id);
  try {
    const beatmap = await loadLazerCachedBeatmap(props.roomId, id, requestApi);
    if (beatmap) beatmaps[id] = beatmap;
  } catch {
    // Keep the beatmap ID as a readable fallback if the optional preview request fails.
  } finally {
    loadingBeatmapIds.delete(id);
  }
}

function loadPlaylistBeatmaps() {
  props.items.forEach((item) => void loadBeatmap(item));
}

function itemUrl(item) {
  return Number(item?.beatmap_id) > 0 ? `https://osu.ppy.sh/b/${item.beatmap_id}` : "";
}

const nextMapBackground = computed(() => beatmapCoverBackground(beatmaps[nextItem.value?.beatmap_id]?.beatmapsetId));

function open() {
  if (!props.disabled) visible.value = true;
}

function add() {
  if (!canSubmit.value || submitting.value) return;
  const payload = {
    beatmap_id: parsedBeatmapId.value,
    ruleset_id: isSwapping.value ? swappingItem.value.ruleset_id : 0,
    required_mods: isSwapping.value ? swappingItem.value.required_mods : undefined,
    allowed_mods: isSwapping.value ? swappingItem.value.allowed_mods : undefined,
    freestyle: isSwapping.value ? swappingItem.value.freestyle : undefined,
  };
  if (!isSwapping.value) {
    submitting.value = addLazerPlaylistItem(props.roomId, payload);
    return;
  }
  const isCurrent = Number(swappingItem.value.id) === Number(props.currentItemId);
  submitting.value = isCurrent ? editLazerCurrentPlaylistItem(props.roomId, payload) : editLazerPlaylistItem(props.roomId, Number(swappingItem.value.id), payload);
}

function beginSwap(item) {
  if (props.disabled || submitting.value || removingId.value !== null) return;
  const itemId = Number(item.id);
  if (Number(swappingItemId.value) === itemId) {
    swappingItemId.value = null;
    beatmapId.value = "";
    return;
  }
  swappingItemId.value = itemId;
  beatmapId.value = "";
}

function openModsSettings(item) {
  modsItemId.value = Number(item.id);
  modsSettingsVisible.value = true;
}

function handleEscape(event) {
  if (event.code !== "Escape" || event.isComposing) return;
  if (modsSettingsVisible.value) return;
  if (visible.value) {
    event.preventDefault();
    event.stopImmediatePropagation();
    if (!submitting.value && removingId.value === null) visible.value = false;
  }
}

function remove(item) {
  if (props.disabled || item?.was_played || orderedItems.value.length <= 1 || removingId.value !== null || !Number.isInteger(props.roomId)) return;
  removingId.value = Number(item.id);
  if (!removeLazerPlaylistItem(props.roomId, removingId.value)) removingId.value = null;
}

watch(lastEvent, (event) => {
  if (["lazer_add_playlist_item", "lazer_edit_current_playlist_item", "lazer_edit_playlist_item"].includes(event?.received || event?.request)) {
    if (!submitting.value) return;
    submitting.value = false;
    if (event.type === "ack") {
      beatmapId.value = "";
      swappingItemId.value = null;
      loadPlaylistBeatmaps();
    }
  }
  if (event?.received === "lazer_remove_playlist_item" || event?.request === "lazer_remove_playlist_item") {
    removingId.value = null;
  }
});

watch(() => props.items.map((item) => item.beatmap_id).join(","), loadPlaylistBeatmaps, { immediate: true });
onMounted(() => document.addEventListener("keydown", handleEscape, true));
onBeforeUnmount(() => document.removeEventListener("keydown", handleEscape, true));
</script>

<template>
  <section class="next-map" :style="{ '--next-map-image': nextMapBackground }" aria-label="Next map">
    <div class="next-map__backdrop" aria-hidden="true"></div>
    <div class="next-map__details">
      <span class="next-map__label">Next map:</span>
      <a v-if="nextItem" class="next-map__link" :href="itemUrl(nextItem)" target="_blank" rel="noopener noreferrer">{{ itemLabel(nextItem) }}</a>
      <span v-else class="next-map__empty">No next map</span>
    </div>
    <Button text size="small" class="next-map__configure" :disabled="disabled" @click="open">
      <ListMusic :size="14" />
      <span>Configure playlist</span>
    </Button>
  </section>

  <Dialog
    v-model:visible="visible"
    modal
    :close-on-escape="false"
    dismissableMask
    class="playlist-dialog"
    header="Configure playlist"
    :style="{ width: '34rem' }"
    :pt="{ mask: { class: 'app-dialog-mask' } }"
  >
    <div class="playlist-dialog__add">
      <InputText v-model="beatmapId" inputmode="numeric" :placeholder="isSwapping ? 'New beatmap ID' : 'Beatmap ID'" :disabled="disabled || submitting || removingId !== null" @keydown.enter="add" />
      <Button :loading="submitting" :disabled="disabled || !canSubmit || submitting || removingId !== null" @click="add">
        <RefreshCw v-if="isSwapping" :size="15" />
        <Plus v-else :size="15" />
        <span>{{ isSwapping ? "Swap" : "Add" }}</span>
      </Button>
    </div>
    <div class="playlist-dialog__list">
      <article
        v-for="item in orderedItems"
        :key="item.id"
        class="playlist-dialog__item"
        :class="{ 'playlist-dialog__item--current': Number(item.id) === Number(currentItemId) }"
        :style="{ '--playlist-item-image': itemBackground(item) }"
      >
        <div class="playlist-dialog__item-backdrop" aria-hidden="true"></div>
        <div class="playlist-dialog__item-main">
          <div class="playlist-dialog__item-title">
            <a class="playlist-dialog__item-link" :href="itemUrl(item)" target="_blank" rel="noopener noreferrer">{{ itemLabel(item) }}</a>
            <span v-if="itemMapper(item)" class="playlist-dialog__item-mapper">mapped by {{ itemMapper(item) }}</span>
          </div>
          <div v-if="itemMeta(item).length || itemMods(item).length" class="playlist-dialog__item-meta">
            <template v-for="(value, index) in itemMeta(item)" :key="value">
              <span v-if="index" class="playlist-dialog__item-separator">·</span>
              <span>{{ value }}</span>
            </template>
            <span v-if="itemMeta(item).length" class="playlist-dialog__item-separator">·</span>
            <span class="playlist-dialog__item-ruleset"><Gamepad2 :size="11" />{{ itemRuleset(item) }}</span>
            <span v-if="itemMeta(item).length && itemMods(item).length" class="playlist-dialog__item-separator">·</span>
            <ModIconList :mods="itemMods(item)" :ruleset-id="item.ruleset_id" :max="5" :beatmap="beatmaps[item.beatmap_id]" show-settings />
          </div>
        </div>
        <span class="playlist-dialog__item-actions">
          <Button
            v-tooltip.top="'Swap beatmap'"
            text
            rounded
            class="playlist-dialog__swap-button"
            :class="{ 'playlist-dialog__swap-button--active': Number(swappingItemId) === Number(item.id) }"
            :disabled="disabled || submitting || removingId !== null"
            :aria-label="`Swap ${itemLabel(item)}`"
            @click="beginSwap(item)"
          >
            <RefreshCw :size="15" />
          </Button>
          <Button
            v-tooltip.top="'Mods'"
            text
            rounded
            class="playlist-dialog__mods-button"
            :disabled="disabled || submitting || removingId !== null"
            :aria-label="`Mods for ${itemLabel(item)}`"
            @click="openModsSettings(item)"
          >
            <ArrowRightLeft :size="15" />
          </Button>
          <Button
            v-tooltip.top="item.was_played ? 'Played maps cannot be removed' : orderedItems.length <= 1 ? 'The last map cannot be removed' : 'Remove map'"
            text
            rounded
            severity="danger"
            class="playlist-dialog__remove-button"
            :loading="removingId === Number(item.id)"
            :disabled="disabled || item.was_played || orderedItems.length <= 1 || removingId !== null"
            :aria-label="`Remove ${itemLabel(item)}`"
            @click="remove(item)"
          >
            <Trash2 :size="15" />
          </Button>
        </span>
      </article>
      <span v-if="!orderedItems.length" class="playlist-dialog__empty">The playlist is empty.</span>
    </div>
  </Dialog>

  <PlaylistModsModal
    v-model:visible="modsSettingsVisible"
    :room-id="roomId"
    :item="modsItem"
    :beatmap="modsItem ? beatmaps[modsItem.beatmap_id] : null"
    :current-item-id="currentItemId"
    :disabled="disabled || submitting || removingId !== null"
  />
</template>

<style scoped>
.next-map {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  min-height: 2.55rem;
  padding: 0.45rem 1.4rem;
  overflow: hidden;
  border-bottom: 1px solid var(--app-border);
  background: var(--app-surface);
}
.next-map__backdrop,
.next-map__backdrop::before,
.next-map__backdrop::after {
  position: absolute;
  inset: 0;
  pointer-events: none;
}
.next-map__backdrop {
  background: var(--app-surface);
}
.next-map__backdrop::before {
  content: "";
  right: auto;
  width: 42%;
  background-image: var(--next-map-image);
  background-position: left center;
  background-size: cover;
  background-repeat: no-repeat;
  filter: brightness(0.5);
  -webkit-mask-image: linear-gradient(90deg, #000 0%, #000 42%, rgba(0, 0, 0, 0.75) 68%, transparent 100%);
  mask-image: linear-gradient(90deg, #000 0%, #000 42%, rgba(0, 0, 0, 0.75) 68%, transparent 100%);
}
.next-map__backdrop::after {
  content: "";
  background: linear-gradient(90deg, rgba(0, 0, 0, 0.3) 0%, rgba(8, 8, 14, 0.5) 48%, var(--app-surface) 100%);
}
.next-map__details,
.next-map__configure {
  position: relative;
  z-index: 1;
}
.next-map__details {
  min-width: 0;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
  font-size: 0.75rem;
  text-shadow: 0 1px 2px rgba(0, 0, 0, 0.7);
}
.next-map__label {
  margin-right: 0.35rem;
  color: var(--app-muted);
  font-weight: 700;
}
.next-map__link {
  color: var(--app-text);
  font-weight: 700;
  text-decoration: none;
}
.next-map__link:hover {
  text-decoration: underline;
}
.next-map__empty {
  color: var(--app-muted);
}
.next-map__configure {
  display: inline-flex;
  flex: 0 0 auto;
  gap: 0.35rem;
  color: var(--app-primary-bright) !important;
  font-size: 0.72rem;
  font-weight: 800;
}
.next-map__configure:hover:not(:disabled) {
  background: rgba(var(--app-primary-rgb), 0.1) !important;
}
.playlist-dialog__add {
  display: flex;
  gap: 0.5rem;
  margin-bottom: 0.85rem;
}
.playlist-dialog__add :deep(.p-inputtext) {
  height: 2.15rem;
  min-width: 0;
  flex: 1 1 auto;
  border: 1px solid var(--app-border) !important;
  border-radius: 0.45rem;
  background: var(--app-control) !important;
  color: var(--app-text) !important;
  box-shadow: none !important;
  font-size: 0.74rem;
}
.playlist-dialog__add :deep(.p-inputtext::placeholder) {
  color: var(--app-muted);
}
.playlist-dialog__add :deep(.p-inputtext:hover:not(:disabled)) {
  border-color: rgba(var(--app-primary-rgb), 0.5) !important;
}
.playlist-dialog__add :deep(.p-inputtext:focus) {
  border-color: var(--app-primary) !important;
  box-shadow: 0 0 0 0.15rem rgba(var(--app-primary-rgb), 0.16) !important;
}
.playlist-dialog__add :deep(.p-button) {
  display: inline-flex;
  min-height: 2.15rem;
  flex: 0 0 auto;
  gap: 0.35rem;
  justify-content: center;
  border: 1px solid var(--app-primary) !important;
  border-radius: 0.45rem;
  background: var(--app-primary) !important;
  color: var(--app-bg) !important;
  font-size: 0.74rem;
  font-weight: 800;
}
.playlist-dialog__add :deep(.p-button:hover:not(:disabled)) {
  border-color: var(--app-primary-bright) !important;
  background: var(--app-primary-bright) !important;
}
.playlist-dialog__add :deep(.p-button:disabled) {
  opacity: 0.55;
}
.playlist-dialog__list {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  max-height: 24rem;
  overflow: auto;
}
.playlist-dialog__item {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  min-height: 4rem;
  padding: 0.55rem 0.65rem;
  overflow: hidden;
  border: 1px solid var(--app-border);
  border-radius: 0.65rem;
  background: var(--app-control);
}
.playlist-dialog__item--current {
  border-color: var(--app-purple-bright);
}
.playlist-dialog__item-backdrop,
.playlist-dialog__item-backdrop::before,
.playlist-dialog__item-backdrop::after {
  position: absolute;
  inset: 0;
  pointer-events: none;
}
.playlist-dialog__item-backdrop {
  background: var(--app-control);
}
.playlist-dialog__item-backdrop::before {
  content: "";
  background-image: var(--playlist-item-image);
  background-position: center;
  background-size: cover;
  background-repeat: no-repeat;
  filter: brightness(0.45);
}
.playlist-dialog__item-backdrop::after {
  content: "";
  background: linear-gradient(90deg, rgba(8, 8, 14, 0.62) 0%, rgba(8, 8, 14, 0.48) 52%, rgba(8, 8, 14, 0.62) 100%);
}
.playlist-dialog__item-main,
.playlist-dialog__item-actions {
  position: relative;
  z-index: 1;
}
.playlist-dialog__item-main {
  min-width: 0;
}
.playlist-dialog__item-title {
  display: flex;
  align-items: baseline;
  min-width: 0;
  gap: 0.4rem;
}
.playlist-dialog__item-link {
  overflow: hidden;
  color: var(--app-text);
  font-size: 0.8rem;
  font-weight: 700;
  text-decoration: none;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.playlist-dialog__item-link:hover {
  text-decoration: underline;
}
.playlist-dialog__item-mapper {
  overflow: hidden;
  flex: 0 1 auto;
  color: rgba(255, 255, 255, 0.48);
  font-size: 0.67rem;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.playlist-dialog__item-meta {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 0.3rem;
  margin-top: 0.22rem;
  color: rgba(255, 255, 255, 0.72);
  font-size: 0.65rem;
}
.playlist-dialog__item-ruleset {
  display: inline-flex;
  align-items: center;
  gap: 0.18rem;
}
.playlist-dialog__item-mod {
  padding: 0.08rem 0.12rem;
  color: var(--app-text);
  font-weight: 700;
}
.playlist-dialog__item-actions {
  display: inline-flex;
  align-items: center;
  gap: 0.1rem;
  flex: 0 0 auto;
}
.playlist-dialog__swap-button,
.playlist-dialog__remove-button {
  border-color: transparent !important;
  background: transparent !important;
}
.playlist-dialog__swap-button {
  color: #63a9ff !important;
}
.playlist-dialog__swap-button:hover:not(:disabled),
.playlist-dialog__swap-button--active {
  background: rgba(99, 169, 255, 0.14) !important;
  color: #8bc2ff !important;
}
.playlist-dialog__swap-button--active {
  box-shadow: inset 0 0 0 1px rgba(99, 169, 255, 0.4);
}
.playlist-dialog__mods-button {
  border-color: transparent !important;
  background: transparent !important;
  color: #65d89a !important;
}
.playlist-dialog__mods-button:hover:not(:disabled) {
  background: rgba(101, 216, 154, 0.14) !important;
  color: #8aebb5 !important;
}
.playlist-dialog__remove-button {
  color: var(--app-red) !important;
}
.playlist-dialog__remove-button:hover:not(:disabled) {
  background: rgba(255, 91, 103, 0.14) !important;
  color: var(--app-red) !important;
}
.playlist-mods-dialog__categories {
  display: grid;
  gap: 0.55rem;
  max-height: 31rem;
  overflow-x: auto;
  padding-bottom: 0.15rem;
}
.playlist-mods-dialog__category {
  min-width: 9rem;
  overflow: hidden;
  border: 1px solid var(--app-border);
  border-radius: 0.65rem;
  background: var(--app-control);
}
.playlist-mods-dialog__category-title {
  display: flex;
  align-items: center;
  gap: 0.42rem;
  margin: 0;
  padding: 0.65rem 0.6rem;
  border-bottom: 1px solid var(--app-border);
  color: var(--app-muted);
  font-size: 0.65rem;
  font-weight: 700;
  letter-spacing: 0.035em;
  line-height: 1.15;
  text-transform: uppercase;
}
.playlist-mods-dialog__category-dot {
  display: inline-block;
  width: 0.42rem;
  height: 0.42rem;
  flex: 0 0 auto;
  border-radius: 50%;
  background: var(--category-color);
}
.playlist-mods-dialog__category-select-all {
  width: calc(100% - 0.9rem);
  margin: 0.35rem 0.45rem 0;
  padding: 0.25rem 0.35rem !important;
  border: 1px solid transparent !important;
  border-radius: 0.35rem !important;
  color: var(--app-muted) !important;
  font-size: 0.58rem !important;
  text-align: left;
}
.playlist-mods-dialog__category-select-all:hover:not(:disabled) {
  border-color: rgba(var(--app-primary-rgb), 0.25) !important;
  background: rgba(var(--app-primary-rgb), 0.1) !important;
  color: var(--app-primary-bright) !important;
}
.playlist-mods-dialog__category-list {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
  max-height: 24rem;
  padding: 0.45rem;
  overflow-y: auto;
  scrollbar-width: thin;
}
.playlist-mods-dialog__mod {
  display: flex;
  align-items: center;
  gap: 0.45rem;
  min-height: 2.15rem;
  padding: 0.3rem 0.4rem;
  border: 1px solid var(--mod-base) !important;
  border-radius: 0.45rem;
  background: var(--mod-base) !important;
  color: #f6f8ff !important;
  font-size: 0.68rem;
  font-weight: 700;
  text-align: left;
  transition:
    background 150ms ease,
    border-color 150ms ease,
    color 150ms ease,
    transform 150ms ease;
}
.playlist-mods-dialog__mod-copy {
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: 0.12rem;
}
.playlist-mods-dialog__mod-name {
  line-height: 1.05;
}
.playlist-mods-dialog__mod-description {
  display: block;
  overflow: hidden;
  color: rgba(255, 255, 255, 0.62);
  font-size: 0.56rem;
  font-weight: 500;
  line-height: 1.15;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.playlist-mods-dialog__mod--selected .playlist-mods-dialog__mod-description {
  color: rgba(21, 25, 35, 0.72);
}
.playlist-mods-dialog__mod-icon {
  display: inline-flex;
  flex: 0 0 auto;
  width: 2rem;
  aspect-ratio: 100 / 70;
}
.playlist-mods-dialog__mod-icon :deep(svg) {
  display: block;
  width: 100%;
  height: 100%;
}
.playlist-mods-dialog__mod:hover {
  border-color: var(--mod-selected) !important;
  background: color-mix(in srgb, var(--mod-base) 78%, var(--mod-selected)) !important;
}
.playlist-mods-dialog__mod--selected {
  border-color: var(--mod-selected) !important;
  background: var(--mod-selected) !important;
  color: #151923 !important;
}
.playlist-mods-dialog__mod--selected:hover {
  background: var(--mod-selected) !important;
}
.playlist-mods-dialog__mod--blocked {
  opacity: 0.42;
}
.playlist-mods-dialog__bulk-actions {
  display: flex;
  justify-content: flex-end;
  gap: 0.35rem;
  margin-top: 0.65rem;
}
.playlist-mods-dialog__bulk-actions :deep(.p-button) {
  min-height: 1.9rem;
  padding: 0.3rem 0.55rem;
  border: 1px solid transparent !important;
  border-radius: 0.4rem !important;
  color: var(--app-muted) !important;
  font-size: 0.68rem;
  font-weight: 700;
}
.playlist-mods-dialog__bulk-actions :deep(.p-button:hover:not(:disabled)) {
  border-color: rgba(var(--app-primary-rgb), 0.3) !important;
  background: rgba(var(--app-primary-rgb), 0.12) !important;
  color: var(--app-primary-bright) !important;
}
.playlist-mods-dialog__category--green {
  color: #9be15d;
}
.playlist-mods-dialog__category--red {
  color: #ff7180;
}
.playlist-mods-dialog__category--blue {
  color: #61c4f5;
}
.playlist-mods-dialog__category--purple {
  color: #a78bfa;
}
.playlist-mods-dialog__category--pink {
  color: #f472b6;
}
@media (max-width: 58rem) {
  .playlist-mods-dialog__categories {
    overflow-x: auto;
  }
}
.playlist-dialog__empty {
  color: var(--app-muted);
  font-size: 0.82rem;
  text-align: center;
  padding: 1rem;
}
.playlist-mods-settings-dialog__rows {
  display: flex;
  flex-direction: column;
  gap: 0.7rem;
}
.playlist-mods-settings-dialog__row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  padding: 0.75rem;
  border: 1px solid var(--app-border);
  border-radius: 0.55rem;
  background: var(--app-control);
}
.playlist-mods-settings-dialog__row--disabled {
  opacity: 0.45;
}
.playlist-mods-settings-dialog__row strong {
  color: var(--app-text);
  font-size: 0.78rem;
}
.playlist-mods-settings-dialog__row p {
  margin: 0.25rem 0 0;
  color: var(--app-muted);
  font-size: 0.68rem;
}
.playlist-mods-settings-dialog__row :deep(.p-button) {
  min-width: 5.8rem;
  flex: 0 0 auto;
  border: 1px solid transparent !important;
  border-radius: 0.45rem !important;
  background: transparent !important;
  color: var(--app-muted) !important;
  font-size: 0.72rem;
  font-weight: 700;
}
.playlist-mods-settings-dialog__row :deep(.p-button:hover:not(:disabled)) {
  border-color: rgba(var(--app-primary-rgb), 0.3) !important;
  background: rgba(var(--app-primary-rgb), 0.12) !important;
  color: var(--app-primary-bright) !important;
}
.playlist-mods-settings-dialog__actions {
  display: flex;
  justify-content: flex-end;
  gap: 0.5rem;
  margin-top: 1rem;
}
.playlist-mods-settings-dialog__actions :deep(.p-button) {
  min-width: 5rem;
  min-height: 2.15rem;
  border-radius: 0.45rem !important;
  font-size: 0.74rem;
  font-weight: 800;
}
.playlist-mods-settings-dialog__actions :deep(.p-button:first-child) {
  border: 1px solid transparent !important;
  background: transparent !important;
  color: var(--app-muted) !important;
}
.playlist-mods-settings-dialog__actions :deep(.p-button:first-child:hover:not(:disabled)) {
  border-color: rgba(var(--app-primary-rgb), 0.3) !important;
  background: rgba(var(--app-primary-rgb), 0.12) !important;
  color: var(--app-primary-bright) !important;
}
.playlist-mods-settings-dialog__actions :deep(.p-button:last-child) {
  border: 1px solid var(--app-primary) !important;
  background: var(--app-primary) !important;
  color: var(--app-bg) !important;
}
.playlist-mods-settings-dialog__actions :deep(.p-button:last-child:hover:not(:disabled)) {
  border-color: var(--app-primary-bright) !important;
  background: var(--app-primary-bright) !important;
  color: var(--app-bg) !important;
}
.playlist-mods-settings-dialog__actions :deep(.p-button:focus-visible),
.playlist-mods-settings-dialog__row :deep(.p-button:focus-visible) {
  box-shadow: 0 0 0 0.15rem rgba(var(--app-primary-rgb), 0.18) !important;
}
.playlist-mods-settings-dialog__actions :deep(.p-button:disabled),
.playlist-mods-settings-dialog__row :deep(.p-button:disabled) {
  opacity: 0.55;
}
</style>
