<script setup>
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from "vue";
import Button from "primevue/button";
import Dialog from "primevue/dialog";
import ToggleSwitch from "primevue/toggleswitch";
import { useToast } from "primevue/usetoast";
import { useServerConnection } from "../../composables/useServerConnection";
import modsMetadata from "../../assets/mods/mods.json";
import modHexRaw from "../../assets/mods/mod-icon.svg?raw";
import SvgMarkup from "../SvgMarkup.vue";

const modIconSources = import.meta.glob("../../assets/mods/*/*.svg", { eager: true, query: "?raw", import: "default" });
const GLYPH_SCALE = 0.75;
const props = defineProps({
  visible: { type: Boolean, default: false },
  roomId: { type: Number, default: null },
  item: { type: Object, default: null },
  currentItemId: { type: Number, default: null },
  disabled: { type: Boolean, default: false },
  localOnly: { type: Boolean, default: false },
  rulesetId: { type: Number, default: 0 },
});
const emit = defineEmits(["update:visible", "save-mods"]);
const toast = useToast();
const { editLazerCurrentPlaylistItem, editLazerPlaylistItem, lastEvent } = useServerConnection();
const pickerVisible = ref(false);
const pickerKind = ref("required");
const saving = ref(false);
const selectedMods = reactive(new Set());
const requiredMods = reactive(new Set());
const allowedMods = reactive(new Set());
const freestyle = ref(false);
const categoryColors = Object.freeze({
  green: ["#b3ff66", "#3c591e"],
  red: ["#ff6666", "#591e1e"],
  blue: ["#66ccff", "#1e4659"],
  purple: ["#8c66ff", "#2d1e59"],
  pink: ["#ff66ab", "#591e39"],
  yellow: ["#ffcc22", "#594605"],
});
const categoryDefinitions = Object.freeze([
  { type: "DifficultyReduction", title: "Difficulty Reduction", tone: "green", folder: "difficulty-reduction" },
  { type: "DifficultyIncrease", title: "Difficulty Increase", tone: "red", folder: "difficulty-increase" },
  { type: "Automation", title: "Automation", tone: "blue", folder: "automation" },
  { type: "Conversion", title: "Conversion", tone: "purple", folder: "conversion" },
  { type: "Fun", title: "Fun", tone: "pink", folder: "fun" },
  { type: "System", title: "System", tone: "yellow", folder: "system" },
]);
const svgBody = (raw) =>
  String(raw || "")
    .replace(/<defs>[\s\S]*?<\/defs>/g, "")
    .replace(/\sclip-path="[^"]*"/g, "")
    .replace(/^[\s\S]*?<svg[^>]*>/, "")
    .replace(/<\/svg>\s*$/, "");
const hexBody = svgBody(modHexRaw);
const modsItem = computed(() => props.item);
const rulesetMods = computed(() => {
  const ruleset = props.localOnly ? Number(props.rulesetId) : Number(modsItem.value?.ruleset_id);
  return modsMetadata.find((entry) => Number(entry.RulesetID) === ruleset)?.Mods || [];
});
const modByAcronym = computed(() => new Map(rulesetMods.value.map((mod) => [String(mod.Acronym).toUpperCase(), mod])));
const modCategories = computed(() =>
  categoryDefinitions
    .map((category) => ({ ...category, mods: rulesetMods.value.filter((mod) => mod.ValidForMultiplayer === true && mod.Type === category.type) }))
    .filter((category) => category.mods.length),
);
const pickerCategories = computed(() =>
  modCategories.value
    .map((category) => ({
      ...category,
      mods: category.mods.filter((mod) =>
        pickerKind.value === "required"
          ? freestyle.value
            ? mod.ValidForFreestyleAsRequiredMod === true
            : mod.ValidForMultiplayer === true
          : mod.ValidForMultiplayerAsFreeMod === true && !conflictsWithRequired(mod),
      ),
    }))
    .filter((category) => category.mods.length),
);
const pickerStyle = computed(() => ({ width: `min(90vw, ${Math.max(28, pickerCategories.value.length * 16 + 5)}rem)` }));
const categoriesStyle = computed(() => ({ gridTemplateColumns: `repeat(${Math.max(1, pickerCategories.value.length)}, minmax(9rem, 1fr))` }));
const requiredPreviewMods = computed(() => previewMods(requiredMods));
const allowedPreviewMods = computed(() => previewMods(allowedMods));

function itemMods(field) {
  const camelCaseField = field === "required_mods" ? "requiredMods" : "allowedMods";
  const values = Array.isArray(modsItem.value?.[field]) ? modsItem.value[field] : modsItem.value?.[camelCaseField];
  return (Array.isArray(values) ? values : []).map((mod) => (typeof mod === "string" ? mod : mod?.acronym)).filter(Boolean);
}
function previewMods(mods) {
  const selected = new Set([...mods].map((acronym) => String(acronym).toUpperCase()));
  return modCategories.value.flatMap((category) => category.mods.filter((mod) => selected.has(String(mod.Acronym).toUpperCase())).map((mod) => ({ mod, category })));
}
function moreModsIconSvg() {
  const hex = hexBody.replace(/fill="white"/g, 'fill="#ffcc22"');
  const glyph = `<g fill="#594605"><circle cx="12" cy="12" r="1.8"/><circle cx="19" cy="12" r="1.8"/><circle cx="5" cy="12" r="1.8"/></g>`;
  return `<svg viewBox="10 7 100 70" fill="none" aria-hidden="true"><g transform="translate(10 7)">${hex}</g><g transform="translate(60 42) scale(3.7) translate(-12 -12)">${glyph}</g></svg>`;
}
function previewMoreTooltip(mods) {
  const rows = mods
    .map(({ mod, category }) => `<span class="app-tooltip__more-mod-row"><span class="app-tooltip__more-mod-icon">${modIconSvg(category, mod)}</span><span>${escapeHtml(mod.Name)}</span></span>`)
    .join("");
  return { html: `<div class="app-tooltip__more-mods">${rows}</div>`, interactive: true };
}
function syncFromItem() {
  requiredMods.clear();
  allowedMods.clear();
  itemMods("required_mods").forEach((mod) => requiredMods.add(String(mod).toUpperCase()));
  itemMods("allowed_mods").forEach((mod) => allowedMods.add(String(mod).toUpperCase()));
  freestyle.value = Boolean(modsItem.value?.freestyle);
  removeRequiredConflictsFromAllowed();
}
function openPicker(kind) {
  pickerKind.value = kind;
  selectedMods.clear();
  (kind === "required" ? requiredMods : allowedMods).forEach((mod) => {
    const entry = modByAcronym.value.get(mod);
    if (kind === "required" || (entry && !conflictsWithRequired(entry))) selectedMods.add(mod);
  });
  pickerVisible.value = true;
}
function commitPicker() {
  const target = pickerKind.value === "required" ? requiredMods : allowedMods;
  target.clear();
  selectedMods.forEach((acronym) => {
    const mod = modByAcronym.value.get(acronym);
    if (pickerKind.value === "required" || (mod && !conflictsWithRequired(mod))) target.add(acronym);
  });
  if (pickerKind.value === "required") removeRequiredConflictsFromAllowed();
  pickerVisible.value = false;
}
function closeSettings() {
  if (!saving.value) emit("update:visible", false);
}
function conflictsWithRequired(mod) {
  const acronym = String(mod.Acronym).toUpperCase();
  if (requiredMods.has(acronym)) return true;
  return [...requiredMods].some((requiredAcronym) => {
    const required = modByAcronym.value.get(requiredAcronym);
    return (
      required?.IncompatibleMods?.some((incompatible) => String(incompatible).toUpperCase() === acronym) ||
      mod.IncompatibleMods?.some((incompatible) => String(incompatible).toUpperCase() === requiredAcronym)
    );
  });
}
function removeRequiredConflictsFromAllowed() {
  [...allowedMods].forEach((acronym) => {
    const mod = modByAcronym.value.get(acronym);
    if (mod && conflictsWithRequired(mod)) allowedMods.delete(acronym);
  });
}
function toggleMod(mod) {
  const acronym = String(mod.Acronym).toUpperCase();
  if (selectedMods.has(acronym)) return selectedMods.delete(acronym);
  if (pickerKind.value === "required") {
    [...selectedMods].forEach((selectedAcronym) => {
      const selected = modByAcronym.value.get(selectedAcronym);
      if (selected?.IncompatibleMods?.some((value) => String(value).toUpperCase() === acronym) || mod.IncompatibleMods?.some((value) => String(value).toUpperCase() === selectedAcronym))
        selectedMods.delete(selectedAcronym);
    });
  }
  selectedMods.add(acronym);
}
function categoryAcronyms(category) {
  return category.mods.map((mod) => String(mod.Acronym).toUpperCase());
}
function categorySelected(category) {
  const acronyms = categoryAcronyms(category);
  return acronyms.length > 0 && acronyms.every((acronym) => selectedMods.has(acronym));
}
function isModSelected(mod) {
  return selectedMods.has(String(mod.Acronym).toUpperCase());
}
function toggleCategory(category) {
  const acronyms = categoryAcronyms(category);
  if (categorySelected(category)) acronyms.forEach((acronym) => selectedMods.delete(acronym));
  else acronyms.forEach((acronym) => selectedMods.add(acronym));
}
function selectAll() {
  pickerCategories.value.forEach((category) => categoryAcronyms(category).forEach((acronym) => selectedMods.add(acronym)));
}
function deselectAll() {
  selectedMods.clear();
}
function modBlocked(mod) {
  if (pickerKind.value === "allowed") return false;
  const acronym = String(mod.Acronym).toUpperCase();
  return (
    !selectedMods.has(acronym) &&
    [...selectedMods].some((selectedAcronym) => {
      const selected = modByAcronym.value.get(selectedAcronym);
      return selected?.IncompatibleMods?.some((value) => String(value).toUpperCase() === acronym) || mod.IncompatibleMods?.some((value) => String(value).toUpperCase() === selectedAcronym);
    })
  );
}
function modIconRaw(category, mod) {
  const slug = String(mod.Name || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  return modIconSources[`../../assets/mods/${category.folder}/${slug}.svg`] || "";
}
function modIconSvg(category, mod, selected = false) {
  const raw = modIconRaw(category, mod);
  if (!raw) return "";
  const [light, dark] = categoryColors[category.tone];
  const hex = hexBody.replace(/fill="white"/g, `fill="${selected ? dark : light}"`);
  const glyph = svgBody(raw).replace(/(fill|stroke)="white"/g, `$1="${selected ? light : dark}"`);
  return `<svg viewBox="10 7 100 70" fill="none" aria-hidden="true"><g transform="translate(10 7)">${hex}</g><g transform="translate(60 42) scale(${GLYPH_SCALE}) translate(-60 -42)">${glyph}</g></svg>`;
}
function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
function conflictingMods(mod) {
  const acronym = String(mod.Acronym).toUpperCase();
  const incompatible = new Set((mod.IncompatibleMods || []).map((value) => String(value).toUpperCase()));
  const visibleAcronyms = new Set(pickerCategories.value.flatMap((category) => category.mods.map((candidate) => String(candidate.Acronym).toUpperCase())));
  return rulesetMods.value.filter((candidate) => {
    const candidateAcronym = String(candidate.Acronym).toUpperCase();
    if (candidateAcronym === acronym || !visibleAcronyms.has(candidateAcronym)) return false;
    return incompatible.has(candidateAcronym) || (candidate.IncompatibleMods || []).some((value) => String(value).toUpperCase() === acronym);
  });
}
function tooltip(mod) {
  const description = mod.Description ? `<span>${escapeHtml(mod.Description)}</span>` : "";
  const conflicts = conflictingMods(mod);
  const conflictMarkup = conflicts.length
    ? `<small>Incompatible with</small><div class="app-tooltip__conflicts">${conflicts
        .map((conflict) => {
          const category = categoryDefinitions.find((entry) => entry.type === conflict.Type);
          const icon = category ? modIconSvg(category, conflict) : "";
          return `<span class="app-tooltip__conflict" title="${escapeHtml(conflict.Name)}" aria-label="${escapeHtml(conflict.Name)}"><span class="app-tooltip__conflict-icon">${icon}</span></span>`;
        })
        .join("")}</div>`
    : "";
  return { html: `${description}${conflictMarkup}`, showDelay: 300, dynamic: true };
}
function modStyle(category) {
  const [selected, base] = categoryColors[category.tone];
  return { "--mod-selected": selected, "--mod-base": base, "--category-color": selected };
}
function payload(mods) {
  return [...mods].map((acronym) => ({ acronym }));
}
function save() {
  if (saving.value || !modsItem.value) return;
  commitPicker();
  removeRequiredConflictsFromAllowed();
  const data = { required_mods: payload(requiredMods), allowed_mods: freestyle.value ? [] : payload(allowedMods), freestyle: freestyle.value };
  if (props.localOnly) {
    emit("save-mods", data);
    emit("update:visible", false);
    return;
  }
  if (!Number.isInteger(props.roomId) || props.roomId <= 0) return;
  const isCurrent = Number(modsItem.value.id) === Number(props.currentItemId);
  saving.value = isCurrent ? editLazerCurrentPlaylistItem(props.roomId, data) : editLazerPlaylistItem(props.roomId, Number(modsItem.value.id), data);
  if (!saving.value) toast.add({ severity: "error", summary: "Save failed", detail: "The server connection is not available.", life: 4000 });
}
function onKeydown(event) {
  if (event.key !== "Escape") return;
  if (pickerVisible.value) {
    event.preventDefault();
    event.stopImmediatePropagation();
    commitPicker();
    return;
  }
  if (props.visible && !saving.value) {
    event.preventDefault();
    event.stopImmediatePropagation();
    closeSettings();
  }
}
watch(
  () => props.visible,
  (value) => {
    if (value) syncFromItem();
  },
);
watch(lastEvent, (event) => {
  if (!saving.value || !["lazer_edit_current_playlist_item", "lazer_edit_playlist_item"].includes(event?.received || event?.request)) return;
  saving.value = false;
  if (event.type === "ack") {
    emit("update:visible", false);
    toast.add({ severity: "success", summary: "Mods updated", detail: "Playlist mods were updated successfully.", life: 3500 });
  }
});
onMounted(() => document.addEventListener("keydown", onKeydown, true));
onBeforeUnmount(() => document.removeEventListener("keydown", onKeydown, true));
</script>

<template>
  <Dialog
    :visible="visible"
    modal
    :close-on-escape="false"
    dismissableMask
    class="playlist-dialog playlist-mods-settings-dialog"
    header="Configure mods"
    :style="{ width: '34rem' }"
    :pt="{ mask: { class: 'app-dialog-mask' } }"
    :closable="!saving"
    :dismissable-mask="!saving"
    @update:visible="emit('update:visible', $event)"
  >
    <div class="playlist-mods-settings-dialog__rows">
      <div class="playlist-mods-settings-dialog__row">
        <div>
          <strong>Required mods</strong>
          <p>Mods that are required for everyone playing this map.</p>
          <div v-if="requiredPreviewMods.length" class="playlist-mods-settings-dialog__preview" aria-label="Selected required mods">
            <span v-for="entry in requiredPreviewMods.slice(0, 9)" :key="entry.mod.Acronym" v-tooltip.top="entry.mod.Name" class="playlist-mods-settings-dialog__preview-mod">
              <SvgMarkup :svg="modIconSvg(entry.category, entry.mod)" />
            </span>
            <span
              v-if="requiredPreviewMods.length > 9"
              v-tooltip.top="previewMoreTooltip(requiredPreviewMods.slice(9))"
              class="playlist-mods-settings-dialog__preview-mod"
              aria-label="More required mods"
              ><SvgMarkup :svg="moreModsIconSvg()"
            /></span>
          </div>
        </div>
        <Button label="Configure" text :disabled="saving" @click="openPicker('required')" />
      </div>
      <div class="playlist-mods-settings-dialog__row" :class="{ 'playlist-mods-settings-dialog__row--disabled': freestyle }">
        <div>
          <strong>Allowed mods</strong>
          <p>Free mods that players may add to this map.</p>
          <div v-if="allowedPreviewMods.length" class="playlist-mods-settings-dialog__preview" aria-label="Selected allowed mods">
            <span v-for="entry in allowedPreviewMods.slice(0, 9)" :key="entry.mod.Acronym" v-tooltip.top="entry.mod.Name" class="playlist-mods-settings-dialog__preview-mod">
              <SvgMarkup :svg="modIconSvg(entry.category, entry.mod)" />
            </span>
            <span v-if="allowedPreviewMods.length > 9" v-tooltip.top="previewMoreTooltip(allowedPreviewMods.slice(9))" class="playlist-mods-settings-dialog__preview-mod" aria-label="More allowed mods"
              ><SvgMarkup :svg="moreModsIconSvg()"
            /></span>
          </div>
        </div>
        <Button label="Configure" text :disabled="saving || freestyle" @click="openPicker('allowed')" />
      </div>
      <div class="playlist-mods-settings-dialog__row">
        <div>
          <strong>Freestyle</strong>
          <p>Allow players to choose their own mods for the map.</p>
        </div>
        <ToggleSwitch v-model="freestyle" class="app-solid-switch" :disabled="saving" />
      </div>
    </div>
    <div class="playlist-mods-settings-dialog__actions">
      <Button label="Cancel" text :disabled="saving" @click="closeSettings" /><Button label="Save" :loading="saving" :disabled="saving" @click="save" />
    </div>
  </Dialog>

  <Dialog
    v-model:visible="pickerVisible"
    modal
    :close-on-escape="false"
    dismissableMask
    class="playlist-dialog playlist-mods-dialog"
    :header="pickerKind === 'required' ? 'Required mods' : 'Allowed mods'"
    :style="pickerStyle"
    :pt="{ mask: { class: 'app-dialog-mask' } }"
    @hide="commitPicker"
  >
    <div class="playlist-mods-dialog__categories" :style="categoriesStyle">
      <section
        v-for="category in pickerCategories"
        :key="category.title"
        class="playlist-mods-dialog__category"
        :class="`playlist-mods-dialog__category--${category.tone}`"
        :style="modStyle(category)"
      >
        <h3 class="playlist-mods-dialog__category-title"><span class="playlist-mods-dialog__category-dot"></span>{{ category.title }}</h3>
        <Button
          v-if="pickerKind === 'allowed'"
          :label="categorySelected(category) ? 'Deselect all' : 'Select all'"
          text
          class="playlist-mods-dialog__category-select-all"
          :disabled="saving"
          @click="toggleCategory(category)"
        />
        <div class="playlist-mods-dialog__category-list">
          <button
            v-for="mod in category.mods"
            :key="mod.Acronym"
            v-tooltip.top="tooltip(mod)"
            type="button"
            class="playlist-mods-dialog__mod"
            :class="{ 'playlist-mods-dialog__mod--selected': isModSelected(mod), 'playlist-mods-dialog__mod--blocked': modBlocked(mod) }"
            @click="toggleMod(mod)"
          >
            <span class="playlist-mods-dialog__mod-icon"><SvgMarkup :svg="modIconSvg(category, mod, isModSelected(mod))" /></span
            ><span class="playlist-mods-dialog__mod-copy"
              ><span class="playlist-mods-dialog__mod-name">{{ mod.Name }}</span
              ><span v-if="mod.Description" class="playlist-mods-dialog__mod-description">{{ mod.Description }}</span></span
            >
          </button>
        </div>
      </section>
    </div>
    <div class="playlist-mods-dialog__bulk-actions">
      <Button v-if="pickerKind === 'required'" label="Deselect all" text @click="deselectAll" /><template v-else
        ><Button label="Select all" text @click="selectAll" /><Button label="Deselect all" text @click="deselectAll"
      /></template>
    </div>
  </Dialog>
</template>

<style scoped>
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
.playlist-mods-settings-dialog__preview {
  display: flex;
  flex-wrap: wrap;
  gap: 0.2rem;
  margin-top: 0.45rem;
}
.playlist-mods-settings-dialog__preview-mod {
  display: inline-flex;
  width: 1.55rem;
  height: 1.1rem;
  flex: 0 0 auto;
  align-items: center;
  justify-content: center;
  color: transparent;
}
.playlist-mods-settings-dialog__preview-mod :deep(svg) {
  display: block;
  width: 100%;
  height: 100%;
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
.playlist-mods-settings-dialog__actions :deep(.p-button:last-child) {
  border: 1px solid var(--app-primary) !important;
  background: var(--app-primary) !important;
  color: var(--app-bg) !important;
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
  color: var(--app-muted) !important;
  font-size: 0.58rem !important;
  text-align: left;
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
    background-color 180ms ease,
    color 180ms ease,
    transform 180ms ease;
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
  background: color-mix(in srgb, var(--mod-base) 86%, #000) !important;
}
.playlist-mods-dialog__mod--selected {
  border-color: var(--mod-selected) !important;
  background: var(--mod-selected) !important;
  color: #151923 !important;
}
.playlist-mods-dialog__mod--selected .playlist-mods-dialog__mod-description {
  color: rgba(21, 25, 35, 0.72);
}
.playlist-mods-dialog__mod--selected:hover {
  background: color-mix(in srgb, var(--mod-selected) 86%, #000) !important;
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
  color: var(--app-muted) !important;
  font-size: 0.68rem;
  font-weight: 700;
}
</style>
