<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue";
import Dialog from "primevue/dialog";
import InputText from "primevue/inputtext";
import Button from "primevue/button";
import SelectButton from "primevue/selectbutton";
import ToggleSwitch from "primevue/toggleswitch";
import { useToast } from "primevue/usetoast";
import { Plus, Pencil, Trash2, Download, Upload, ChevronDown, ChevronRight, Settings, Check, AlertTriangle, SlidersHorizontal } from "@lucide/vue";
import WinConditionEditor from "../WinConditionEditor.vue";
import PlaylistModsModal from "./PlaylistModsModal.vue";
import BulkBeatmapImportDialog from "../BulkBeatmapImportDialog.vue";
import { escapeRegExp } from "../../composables/useMessageHighlighting";
import { beatmapCoverBackground } from "../../composables/useBeatmapCover";
import { LAZER_DEFAULT_WIN_CONDITION, LAZER_WIN_CONDITION_TEMPLATES, defaultLazerModsForCategory, serializeLazerMappool, useMappool, lazerWinConditionSource } from "../../composables/useMappool";
import { useServerConnection } from "../../composables/useServerConnection";
import { formatBeatmapOwners } from "../../composables/useBeatmapAuthors";
const props = defineProps({ visible: Boolean });
const emit = defineEmits(["update:visible"]);
const toast = useToast();
const { mappools, addMappool, updateMappool, deleteMappool } = useMappool("lazer");
const { requestApi } = useServerConnection();
const editing = ref(null);
const poolEditVisible = ref(false);
const editingSlot = ref(null);
const slotEditVisible = ref(false);
const slotModsVisible = ref(false);
const slotModsTarget = ref(null);
const slotModsRuleset = ref(0);
const winVisible = ref(false);
const winTemplateMenuOpen = ref(false);
const expanded = ref(new Set());
const expandedCategories = ref(new Set());
const editingCategory = ref(null);
const importInput = ref(null);
const deleteConfirmation = ref(null);
const invalidMappoolsConfirmation = ref(null);
const bulkImportVisible = ref(false);
const bulkImportPool = ref(null);
const editor = ref(null);
let poolEditCloseTimer;
let slotEditCloseTimer;
const rulesets = [
  { label: "osu!", value: "osu" },
  { label: "osu!taiko", value: "taiko" },
  { label: "osu!catch", value: "fruits" },
  { label: "osu!mania", value: "mania" },
];
const winnerRuleOptions = [
  { label: "Classic (bigger score wins)", value: false },
  { label: "Reverse (lower score wins)", value: true },
];
const rulesetMenuOpen = ref(false);
const rulesetTrigger = ref(null);
const rulesetMenuStyle = ref({});
const winTemplateTrigger = ref(null);
const winTemplateMenuStyle = ref({});
const previewLoads = new Set();
const hiddenPreviewKeys = ref(new Set());
const previewTimers = new Map();
const previewRequestVersions = new Map();
const PREVIEW_CACHE_KEY = "whistleref-beatmap-preview-cache-v2";
const DELETE_CONFIRMATIONS_KEY = "whistleref-mappool-delete-confirmations";
function readDeleteConfirmations() {
  try {
    const value = JSON.parse(localStorage.getItem(DELETE_CONFIRMATIONS_KEY) || "{}");
    return value && typeof value === "object" ? value : {};
  } catch {
    return {};
  }
}
const deleteConfirmations = ref(readDeleteConfirmations());
function performDelete(pool, type, category, slotId) {
  if (type === "pool") {
    deleteMappool(pool.id);
  } else if (type === "category") {
    updateMappool(pool.id, { categories: (pool.categories || []).filter((name) => name !== category), slots: pool.slots.filter((slot) => slot.category !== category) });
    expandedCategories.value.delete(categoryKey(pool, category));
  } else {
    updateMappool(pool.id, { slots: pool.slots.filter((slot) => slot.slotId !== slotId) });
  }
}
function requestDelete(pool, details) {
  if (details.type === "category" && ((pool.categories || []).length <= 1 || pool.slots.filter((slot) => slot.category !== details.category).length === 0)) {
    details = { type: "pool" };
  }
  if (details.type === "slot" && pool.slots.length <= 1) {
    details = { type: "pool" };
  }
  if (details.type !== "pool" && deleteConfirmations.value[pool.id]) {
    performDelete(pool, details.type, details.category, details.slotId);
    return;
  }
  deleteConfirmation.value = { pool, ...details, neverAskAgain: false };
}
function cancelDelete() {
  deleteConfirmation.value = null;
}
function confirmDelete() {
  const pending = deleteConfirmation.value;
  if (!pending) return;
  if (pending.type !== "pool" && pending.neverAskAgain) {
    deleteConfirmations.value = { ...deleteConfirmations.value, [pending.pool.id]: true };
    localStorage.setItem(DELETE_CONFIRMATIONS_KEY, JSON.stringify(deleteConfirmations.value));
  }
  performDelete(pending.pool, pending.type, pending.category, pending.slotId);
  deleteConfirmation.value = null;
}
function readPreviewCache() {
  try {
    const value = JSON.parse(localStorage.getItem(PREVIEW_CACHE_KEY) || "{}");
    return value && typeof value === "object" ? value : {};
  } catch {
    return {};
  }
}
function writePreviewCache(id, preview) {
  const cache = readPreviewCache();
  cache[String(id)] = preview;
  localStorage.setItem(PREVIEW_CACHE_KEY, JSON.stringify(cache));
}
function toggle(pool) {
  const next = new Set(expanded.value);
  next.has(pool.id) ? next.delete(pool.id) : next.add(pool.id);
  expanded.value = next;
}
function categoryKey(pool, category) {
  return `${pool.id}:${category}`;
}
function toggleCategory(pool, category) {
  const key = categoryKey(pool, category);
  const next = new Set(expandedCategories.value);
  next.has(key) ? next.delete(key) : next.add(key);
  expandedCategories.value = next;
}
function categoryIsExpanded(pool, category) {
  return expandedCategories.value.has(categoryKey(pool, category));
}
function categoriesFor(pool) {
  return (pool.categories || []).map((name) => ({ name, slots: pool.slots.filter((slot) => slot.category === name) }));
}
function startCategoryRename(pool, category) {
  editingCategory.value = { poolId: pool.id, oldName: category, name: category };
}
function applyCategoryRename(pool, category) {
  const draft = editingCategory.value;
  if (!draft || draft.poolId !== pool.id || draft.oldName !== category) return;
  const name = draft.name.trim();
  if (!name || name === category) {
    editingCategory.value = null;
    return;
  }
  if ((pool.categories || []).some((item) => item !== category && item.toLowerCase() === name.toLowerCase())) return;
  updateMappool(pool.id, {
    categories: pool.categories.map((item) => (item === category ? name : item)),
    slots: pool.slots.map((slot, index, allSlots) => {
      if (slot.category !== category) return slot;
      const number = allSlots.slice(0, index + 1).filter((item) => item.category === category).length;
      return { ...slot, category: name, slotId: `${name}${number}` };
    }),
  });
  const next = new Set(expandedCategories.value);
  if (next.delete(categoryKey(pool, category))) next.add(categoryKey(pool, name));
  expandedCategories.value = next;
  editingCategory.value = null;
}
function slotsDuration(px) {
  return Math.min(520, Math.max(170, 150 + px * 0.22));
}
function clearSlotsTransition(el) {
  el.style.transition = "";
  el.style.height = "";
  el.style.overflow = "";
}
function onSlotsEnter(el, done) {
  el.style.overflow = "hidden";
  el.style.height = "0px";
  const targetHeight = el.scrollHeight;
  const duration = slotsDuration(targetHeight);
  el.offsetHeight;
  el.style.transition = `height ${duration}ms linear`;
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      el.style.height = `${targetHeight}px`;
    });
  });
  const onEnd = (event) => {
    if (event.target !== el) return;
    el.removeEventListener("transitionend", onEnd);
    done();
  };
  el.addEventListener("transitionend", onEnd);
}
function onSlotsAfterEnter(el) {
  clearSlotsTransition(el);
}
function onSlotsLeave(el, done) {
  const startHeight = el.scrollHeight;
  el.style.height = `${startHeight}px`;
  el.style.overflow = "hidden";
  const duration = slotsDuration(startHeight);
  el.offsetHeight;
  el.style.transition = `height ${duration}ms linear`;
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      el.style.height = "0px";
    });
  });
  const onEnd = (event) => {
    if (event.target !== el) return;
    el.removeEventListener("transitionend", onEnd);
    done();
  };
  el.addEventListener("transitionend", onEnd);
}
function onSlotsAfterLeave(el) {
  clearSlotsTransition(el);
}
function openPoolEditor(value) {
  clearTimeout(poolEditCloseTimer);
  editing.value = value;
  poolEditVisible.value = true;
}
function multiplierRows(value) {
  return Object.entries(value || {}).map(([mods, multiplier]) => ({ mods, multiplier }));
}
function multipliersFromRows(rows) {
  return Object.fromEntries((rows || []).map((row) => [String(row.mods || "").trim(), Number(row.multiplier)]).filter(([mods, multiplier]) => mods && Number.isFinite(multiplier) && multiplier > 0));
}
function newPool() {
  const category = "Untitled category";
  const defaultMods = defaultLazerModsForCategory(category);
  openPoolEditor({
    id: "",
    name: "",
    stage: "",
    ruleset: "osu",
    freeModMultipliers: [],
    categories: [category],
    slots: [{ slotId: `${category}1`, category, beatmapId: 0, ...defaultMods }],
  });
}
function closePoolEditor() {
  poolEditVisible.value = false;
  rulesetMenuOpen.value = false;
  clearTimeout(poolEditCloseTimer);
  poolEditCloseTimer = setTimeout(() => {
    editing.value = null;
  }, 220);
}
function isValidMappool(pool) {
  return (pool.categories || []).length > 0 && (pool.slots || []).some((slot) => Number.isInteger(Number(slot.beatmapId)) && Number(slot.beatmapId) > 0);
}
function removeInvalidMappools() {
  mappools.value.filter((pool) => !isValidMappool(pool)).forEach((pool) => deleteMappool(pool.id));
}
function handleMainDialogVisibility(value) {
  if (!value) {
    const invalidPools = mappools.value.filter((pool) => !isValidMappool(pool));
    if (invalidPools.length) {
      invalidMappoolsConfirmation.value = invalidPools;
      return;
    }
  }
  emit("update:visible", value);
}
function confirmRemoveInvalidMappools() {
  removeInvalidMappools();
  invalidMappoolsConfirmation.value = null;
  emit("update:visible", false);
}
function keepInvalidMappools() {
  invalidMappoolsConfirmation.value = null;
}
function savePool() {
  const freeModMultipliers = multipliersFromRows(editing.value.freeModMultipliers);
  const value = {
    ...editing.value,
    freeModMultipliers,
    slots: editing.value.slots.map((slot) =>
      slot.freeMod
        ? {
            ...slot,
            winCondition: {
              type: "script",
              template: "freemod",
              reverse: slot.winCondition?.reverse === true,
              source: lazerWinConditionSource("freemod", slot.winCondition?.reverse === true, freeModMultipliers),
            },
          }
        : slot,
    ),
  };
  value.id ? updateMappool(value.id, value) : addMappool(value);
  closePoolEditor();
}
function isFreemodSlot(slot) {
  const category = String(slot.category || "")
    .trim()
    .toLowerCase();
  return category === "fm" || category === "freemod";
}
function editSlot(pool, slot) {
  clearTimeout(slotEditCloseTimer);
  const condition = slot.winCondition;
  const inferredFreeMod = !slot.freemodResolved && isFreemodSlot(slot);
  editingSlot.value = {
    pool,
    winTemplate: slot.freeMod || inferredFreeMod ? "freemod" : condition?.template || (condition?.source ? "custom" : "score"),
    winReverse: condition?.reverse === true,
    freeMod: slot.freeMod === true || inferredFreeMod,
    slot: { ...slot },
  };
  slotEditVisible.value = true;
}
function openSlotMods(pool, slot) {
  slotModsTarget.value = slot;
  slotModsRuleset.value = { osu: 0, taiko: 1, fruits: 2, mania: 3 }[pool.ruleset] ?? 0;
  slotModsVisible.value = true;
}
function applySlotMods(value) {
  if (!slotModsTarget.value) return;
  slotModsTarget.value.requiredMods = Array.isArray(value.required_mods) ? value.required_mods.map((mod) => mod.acronym).filter(Boolean) : [];
  slotModsTarget.value.allowedMods = Array.isArray(value.allowed_mods) ? value.allowed_mods.map((mod) => mod.acronym).filter(Boolean) : [];
  slotModsTarget.value.freestyle = value.freestyle === true;
  // Keep the local mappool state in sync immediately; this modal is local-only.
  const pool = mappools.value.find((item) => item.slots.some((itemSlot) => itemSlot.slotId === slotModsTarget.value.slotId));
  if (pool) updateMappool(pool.id, { slots: [...pool.slots] });
}
function selectWinTemplate(template) {
  const draft = editingSlot.value;
  draft.winTemplate = template;
  draft.freeMod = template === "freemod";
  draft.slot.freeMod = draft.freeMod;
  winTemplateMenuOpen.value = false;
  if (template === "freemod")
    draft.slot.winCondition = { type: "script", template, reverse: draft.winReverse, source: lazerWinConditionSource(template, draft.winReverse, draft.pool.freeModMultipliers) };
  else if (template !== "custom") draft.slot.winCondition = { type: "script", template, reverse: draft.winReverse, source: lazerWinConditionSource(template, draft.winReverse) };
}
function setWinReverse(reverse) {
  const draft = editingSlot.value;
  draft.winReverse = reverse;
  if (draft.winTemplate !== "custom")
    draft.slot.winCondition = {
      type: "script",
      template: draft.winTemplate,
      reverse,
      source: lazerWinConditionSource(draft.winTemplate, reverse, draft.winTemplate === "freemod" ? draft.pool.freeModMultipliers : {}),
    };
}
function configureWinCondition() {
  winVisible.value = true;
}
function saveSlot() {
  const { pool, slot, winTemplate, winReverse } = editingSlot.value;
  slot.freeMod = editingSlot.value.freeMod === true;
  slot.freemodResolved = true;
  if (slot.freeMod) slot.winCondition = { type: "script", template: "freemod", reverse: winReverse, source: lazerWinConditionSource("freemod", winReverse, pool.freeModMultipliers) };
  else if (winTemplate === "custom") slot.winCondition = slot.winCondition?.source ? { type: "script", template: "custom", reverse: winReverse, source: slot.winCondition.source } : undefined;
  else slot.winCondition = { type: "script", template: winTemplate, reverse: winReverse, source: lazerWinConditionSource(winTemplate, winReverse) };
  const slots = pool.slots.map((item) => (item.slotId === slot.slotId ? slot : item));
  updateMappool(pool.id, { slots });
  closeSlotEditor();
}
function cancelPoolEdit() {
  closePoolEditor();
}
function cancelSlotEdit() {
  closeSlotEditor();
}
function closeSlotEditor() {
  slotEditVisible.value = false;
  winVisible.value = false;
  winTemplateMenuOpen.value = false;
  window.removeEventListener("resize", positionWinTemplateMenu);
  window.removeEventListener("scroll", positionWinTemplateMenu, true);
  clearTimeout(slotEditCloseTimer);
  slotEditCloseTimer = setTimeout(() => {
    editingSlot.value = null;
  }, 220);
}
function positionRulesetMenu() {
  const rect = rulesetTrigger.value?.getBoundingClientRect();
  if (rect) rulesetMenuStyle.value = { top: `${rect.bottom + 6}px`, left: `${rect.left}px`, width: `${rect.width}px` };
}
async function toggleRulesetMenu() {
  rulesetMenuOpen.value = !rulesetMenuOpen.value;
  if (rulesetMenuOpen.value) {
    await nextTick();
    positionRulesetMenu();
    window.addEventListener("resize", positionRulesetMenu);
    window.addEventListener("scroll", positionRulesetMenu, true);
  } else {
    window.removeEventListener("resize", positionRulesetMenu);
    window.removeEventListener("scroll", positionRulesetMenu, true);
  }
}
function selectRuleset(value) {
  editing.value.ruleset = value;
  rulesetMenuOpen.value = false;
  window.removeEventListener("resize", positionRulesetMenu);
  window.removeEventListener("scroll", positionRulesetMenu, true);
}
function positionWinTemplateMenu() {
  const rect = winTemplateTrigger.value?.getBoundingClientRect();
  if (rect) {
    winTemplateMenuStyle.value = { top: `${rect.bottom + 6}px`, left: `${rect.left}px`, width: `${rect.width}px`, maxWidth: `${rect.width}px` };
  }
}
async function toggleWinTemplateMenu() {
  winTemplateMenuOpen.value = !winTemplateMenuOpen.value;
  if (winTemplateMenuOpen.value) {
    await nextTick();
    positionWinTemplateMenu();
    window.addEventListener("resize", positionWinTemplateMenu);
    window.addEventListener("scroll", positionWinTemplateMenu, true);
  } else {
    window.removeEventListener("resize", positionWinTemplateMenu);
    window.removeEventListener("scroll", positionWinTemplateMenu, true);
  }
}
function handleEscape(event) {
  if (event.key !== "Escape" || !props.visible) return;
  if (slotModsVisible.value) return;
  if (rulesetMenuOpen.value) {
    event.preventDefault();
    event.stopImmediatePropagation();
    rulesetMenuOpen.value = false;
    window.removeEventListener("resize", positionRulesetMenu);
    window.removeEventListener("scroll", positionRulesetMenu, true);
    return;
  }
  if (winTemplateMenuOpen.value) {
    event.preventDefault();
    event.stopImmediatePropagation();
    winTemplateMenuOpen.value = false;
    window.removeEventListener("resize", positionWinTemplateMenu);
    window.removeEventListener("scroll", positionWinTemplateMenu, true);
    return;
  }
  if (winVisible.value) {
    event.preventDefault();
    event.stopImmediatePropagation();
    winVisible.value = false;
    return;
  }
  if (editingSlot.value) {
    event.preventDefault();
    event.stopImmediatePropagation();
    cancelSlotEdit();
    return;
  }
  if (poolEditVisible.value) {
    event.preventDefault();
    event.stopImmediatePropagation();
    cancelPoolEdit();
  }
}
onMounted(() => document.addEventListener("keydown", handleEscape, true));
onBeforeUnmount(() => {
  clearTimeout(poolEditCloseTimer);
  clearTimeout(slotEditCloseTimer);
  previewTimers.forEach((timer) => clearTimeout(timer));
  previewTimers.clear();
  document.removeEventListener("keydown", handleEscape, true);
  window.removeEventListener("resize", positionRulesetMenu);
  window.removeEventListener("scroll", positionRulesetMenu, true);
  window.removeEventListener("resize", positionWinTemplateMenu);
  window.removeEventListener("scroll", positionWinTemplateMenu, true);
});
function addCategory(pool) {
  const existing = new Set(pool.categories || []);
  let name = "Untitled category";
  let suffix = 2;
  while (existing.has(name)) name = `Untitled category ${suffix++}`;
  const defaultMods = defaultLazerModsForCategory(name);
  updateMappool(pool.id, {
    categories: [...(pool.categories || []), name],
    slots: [...pool.slots, { slotId: `${name}1`, category: name, beatmapId: 0, ...defaultMods }],
  });
  const next = new Set(expandedCategories.value);
  next.add(categoryKey(pool, name));
  expandedCategories.value = next;
}
function deleteCategory(pool, category) {
  requestDelete(pool, { type: "category", category });
}
function addSlot(pool, category) {
  const used = new Set(pool.slots.map((slot) => slot.slotId));
  let number = 1;
  while (used.has(`${category}${number}`)) number += 1;
  const defaultMods = defaultLazerModsForCategory(category);
  updateMappool(pool.id, { slots: [...pool.slots, { slotId: `${category}${number}`, category, beatmapId: 0, ...defaultMods }] });
}
function previewKey(pool, slot) {
  return `${pool.id}:${slot.slotId}`;
}
function setPreviewHidden(key, hidden) {
  const next = new Set(hiddenPreviewKeys.value);
  hidden ? next.add(key) : next.delete(key);
  hiddenPreviewKeys.value = next;
}
function previewIsVisible(pool, slot) {
  const beatmapId = Number(slot.beatmapId);
  return Number.isInteger(beatmapId) && beatmapId > 0 && Number(slot.preview?.beatmapId) === beatmapId && !hiddenPreviewKeys.value.has(previewKey(pool, slot));
}
function isCurrentPreviewRequest(pool, slot, beatmapId, version) {
  const currentPool = mappools.value.find((item) => item.id === pool.id);
  const currentSlot = currentPool?.slots.find((item) => item.slotId === slot.slotId);
  return previewRequestVersions.get(previewKey(pool, slot)) === version && Number(currentSlot?.beatmapId) === beatmapId;
}
function handleBeatmapInput(pool, slot) {
  const key = previewKey(pool, slot);
  const previousTimer = previewTimers.get(key);
  if (previousTimer) clearTimeout(previousTimer);
  const version = (previewRequestVersions.get(key) || 0) + 1;
  previewRequestVersions.set(key, version);
  setPreviewHidden(key, true);
  slot.preview = null;

  const beatmapId = Number(slot.beatmapId);
  if (!Number.isInteger(beatmapId) || beatmapId <= 0) return;
  previewTimers.set(
    key,
    setTimeout(() => {
      previewTimers.delete(key);
      loadSlotPreview(pool, slot, beatmapId, version);
    }, 1000),
  );
}
async function loadSlotPreview(pool, slot, beatmapId, version) {
  if (!isCurrentPreviewRequest(pool, slot, beatmapId, version)) return;
  const loadKey = `${pool.id}:${slot.slotId}:${beatmapId}:${version}`;
  const cached = readPreviewCache()[String(beatmapId)];
  if (cached) {
    const currentPool = mappools.value.find((item) => item.id === pool.id);
    if (!currentPool || !isCurrentPreviewRequest(pool, slot, beatmapId, version)) return;
    updateMappool(pool.id, { slots: currentPool.slots.map((item) => (item.slotId === slot.slotId ? { ...item, preview: cached } : item)) });
    setPreviewHidden(previewKey(pool, slot), false);
    return;
  }
  previewLoads.add(loadKey);
  try {
    const info = await requestApi(`/beatmaps/${beatmapId}`);
    const preview = {
      beatmapId,
      artist: info.artist || info.beatmapset?.artist || "",
      title: info.title || info.beatmapset?.title || info.name || "",
      diff: info.version || "",
      author: formatBeatmapOwners(info),
      beatmapsetId: info.beatmapset_id || info.beatmapset?.id || null,
      starRating: info.difficulty_rating ?? null,
      totalSeconds: info.total_length ?? null,
    };
    if (!isCurrentPreviewRequest(pool, slot, beatmapId, version)) return;
    writePreviewCache(beatmapId, preview);
    const currentPool = mappools.value.find((item) => item.id === pool.id);
    if (!currentPool) return;
    updateMappool(pool.id, { slots: currentPool.slots.map((item) => (item.slotId === slot.slotId ? { ...item, preview } : item)) });
    setPreviewHidden(previewKey(pool, slot), false);
  } catch {
    /* leave the local fields visible when the API is unavailable */
  } finally {
    previewLoads.delete(loadKey);
  }
}
function exportPool(pool) {
  const exportedPool = serializeLazerMappool(pool);
  const blob = new Blob([JSON.stringify(exportedPool, null, 2)], { type: "application/json" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = `${exportedPool.name || "Untitled mappool"}-${exportedPool.stage || "Unspecified stage"}.json`;
  link.click();
  URL.revokeObjectURL(link.href);
}

function openBulkImport(pool) {
  bulkImportPool.value = pool;
  bulkImportVisible.value = true;
}

function importBulkMaps({ maps }) {
  const pool = mappools.value.find((item) => item.id === bulkImportPool.value?.id);
  if (!pool || !maps?.length) return;

  const categories = [...(pool.categories || [])];
  const slots = pool.slots.map((slot) => ({ ...slot, requiredMods: [...(slot.requiredMods || [])], allowedMods: [...(slot.allowedMods || [])] }));
  const renamedCategories = new Map();
  maps.forEach((map) => {
    const from = String(map.sourceCategory || "").trim();
    const to = String(map.category || "").trim();
    if (from && to && from.toLowerCase() !== to.toLowerCase()) renamedCategories.set(from.toLowerCase(), { from, to });
  });
  renamedCategories.forEach(({ from, to }) => {
    const categoryIndex = categories.findIndex((category) => category.toLowerCase() === from.toLowerCase());
    const hasTarget = categories.some((category) => category.toLowerCase() === to.toLowerCase());
    if (categoryIndex === -1 || hasTarget) return;
    categories[categoryIndex] = to;
    slots.forEach((slot) => {
      if (slot.category !== from) return;
      slot.category = to;
      const suffix = String(slot.slotId || "").match(new RegExp(`^${escapeRegExp(from)}(\\d+)$`, "i"))?.[1];
      if (suffix) slot.slotId = `${to}${suffix}`;
    });
  });
  const nextNumbers = new Map();
  const ensureCategory = (name) => {
    if (categories.some((category) => category.toLowerCase() === name.toLowerCase())) return categories.find((category) => category.toLowerCase() === name.toLowerCase());
    categories.push(name);
    return name;
  };
  const nextSlotId = (category) => {
    let number = nextNumbers.get(category);
    if (!number) {
      number =
        slots.reduce((max, slot) => {
          if (slot.category !== category) return max;
          const match = String(slot.slotId || "").match(new RegExp(`^${escapeRegExp(category)}(\\d+)$`, "i"));
          return Math.max(max, Number(match?.[1] || 0));
        }, 0) + 1;
    }
    nextNumbers.set(category, number + 1);
    return `${category}${number}`;
  };

  maps.forEach((map) => {
    const category = ensureCategory(map.category);
    const emptySlot = slots.find((slot) => slot.category === category && Number(slot.beatmapId) <= 0);
    const value = {
      beatmapId: Number(map.id),
      ...defaultLazerModsForCategory(category),
      preview: map.preview,
    };
    if (emptySlot) Object.assign(emptySlot, value);
    else slots.push({ slotId: nextSlotId(category), category, ...value });
  });
  updateMappool(pool.id, { categories, slots });
  toast.add({
    severity: "success",
    summary: "Beatmaps imported",
    detail: `${maps.length} beatmap${maps.length === 1 ? "" : "s"} added to the mappool.`,
    life: 4000,
  });
}
function importPool(event) {
  const file = event.target.files?.[0];
  event.target.value = "";
  if (!file) return;
  file
    .text()
    .then((text) => {
      const value = JSON.parse(text);
      if (value?.client !== "lazer") {
        toast.add({ severity: "error", summary: "Import failed", detail: "This file is not a Lazer mappool.", life: 4000 });
        return;
      }
      addMappool({ ...value, id: crypto.randomUUID() });
    })
    .catch(() => toast.add({ severity: "error", summary: "Import failed", detail: "The selected file is not valid mappool JSON.", life: 4000 }));
}
watch(editing, (value) => {
  if (value) poolEditVisible.value = true;
});
</script>
<template>
  <Dialog
    :visible="visible"
    modal
    :dismissable-mask="!bulkImportVisible"
    :close-on-escape="!bulkImportVisible"
    header="Mappools"
    class="mappools-dialog"
    :style="{ width: '46rem' }"
    :pt="{ mask: { class: 'app-dialog-mask' } }"
    @update:visible="handleMainDialogVisibility"
  >
    <div class="mappools__toolbar">
      <Button v-tooltip.top="'Add mappool'" text rounded aria-label="Add mappool" @click="newPool"><Plus :size="17" /></Button
      ><input ref="importInput" hidden type="file" accept=".json,application/json" @change="importPool" /><Button
        v-tooltip.top="'Import mappool'"
        text
        rounded
        aria-label="Import mappool"
        @click="importInput.click()"
        ><Upload :size="17"
      /></Button>
    </div>
    <article v-for="pool in mappools" :key="pool.id" class="mappool">
      <header role="button" tabindex="0" :aria-expanded="expanded.has(pool.id)" @click="toggle(pool)" @keydown.enter.prevent="toggle(pool)" @keydown.space.prevent="toggle(pool)">
        <Button v-tooltip.top="expanded.has(pool.id) ? 'Collapse mappool' : 'Expand mappool'" text rounded :aria-label="expanded.has(pool.id) ? 'Collapse mappool' : 'Expand mappool'"
          ><ChevronDown v-if="expanded.has(pool.id)" :size="15" /><ChevronRight v-else :size="15"
        /></Button>
        <div>
          <strong>{{ pool.name }}</strong
          ><small>{{ pool.stage }}</small>
        </div>
        <span class="mappool__actions" @click.stop
          ><Button v-tooltip.top="'Add category'" text rounded aria-label="Add category" @click="addCategory(pool)"><Plus :size="16" /></Button
          ><Button v-tooltip.top="'Edit mappool'" text rounded aria-label="Edit mappool" @click="editing = { ...pool, freeModMultipliers: multiplierRows(pool.freeModMultipliers) }"
            ><Pencil :size="15" /></Button
          ><Button v-tooltip.top="'Export mappool'" text rounded aria-label="Export mappool" @click="exportPool(pool)"><Download :size="15" /></Button
          ><Button v-tooltip.top="'Add bulk of beatmaps'" text rounded aria-label="Add bulk of beatmaps" @click="openBulkImport(pool)"><Upload :size="15" /></Button
          ><Button v-tooltip.top="'Delete mappool'" text rounded severity="danger" aria-label="Delete mappool" @click="requestDelete(pool, { type: 'pool' })"><Trash2 :size="15" /></Button
        ></span>
      </header>
      <Transition :css="false" @enter="onSlotsEnter" @after-enter="onSlotsAfterEnter" @leave="onSlotsLeave" @after-leave="onSlotsAfterLeave"
        ><div v-show="expanded.has(pool.id)" class="mappool__slots">
          <div class="mappool__slots-inner">
            <section v-for="category in categoriesFor(pool)" :key="category.name" class="mappool__category">
              <header
                class="mappool__category-header"
                role="button"
                tabindex="0"
                :aria-expanded="categoryIsExpanded(pool, category.name)"
                @click.stop="toggleCategory(pool, category.name)"
                @keydown.enter.prevent.stop="toggleCategory(pool, category.name)"
                @keydown.space.prevent.stop="toggleCategory(pool, category.name)"
              >
                <Button
                  v-tooltip.top="categoryIsExpanded(pool, category.name) ? 'Collapse category' : 'Expand category'"
                  text
                  rounded
                  :aria-label="categoryIsExpanded(pool, category.name) ? 'Collapse category' : 'Expand category'"
                  ><ChevronDown v-if="categoryIsExpanded(pool, category.name)" :size="14" /><ChevronRight v-else :size="14" /></Button
                ><InputText
                  v-if="editingCategory?.poolId === pool.id && editingCategory.oldName === category.name"
                  v-model="editingCategory.name"
                  autofocus
                  class="mappool__category-name-input"
                  aria-label="Category name"
                  @click.stop
                  @keydown.enter.prevent.stop="applyCategoryRename(pool, category.name)"
                  @keydown.esc.prevent.stop="editingCategory = null"
                /><strong v-else>{{ category.name }}</strong
                ><Button
                  v-if="editingCategory?.poolId === pool.id && editingCategory.oldName === category.name"
                  v-tooltip.top="'Save category name'"
                  text
                  rounded
                  aria-label="Save category name"
                  @click.stop="applyCategoryRename(pool, category.name)"
                  ><Check :size="12" /></Button
                ><Button v-else v-tooltip.top="'Rename category'" text rounded aria-label="Rename category" @click.stop="startCategoryRename(pool, category.name)"><Pencil :size="13" /></Button
                ><small>{{ category.slots.length }}</small
                ><Button v-tooltip.top="'Add beatmap'" text rounded aria-label="Add beatmap" @click.stop="addSlot(pool, category.name)"><Plus :size="15" /></Button
                ><Button v-tooltip.top="'Delete category'" text rounded severity="danger" aria-label="Delete category" @click.stop="deleteCategory(pool, category.name)"><Trash2 :size="15" /></Button>
              </header>
              <Transition :css="false" @enter="onSlotsEnter" @after-enter="onSlotsAfterEnter" @leave="onSlotsLeave" @after-leave="onSlotsAfterLeave"
                ><div v-show="categoryIsExpanded(pool, category.name)" class="mappool__category-slots">
                  <div v-for="slot in category.slots" :key="slot.slotId" class="slot">
                    <div class="slot__fields" @click.stop>
                      <label class="slot__field"><span>Beatmap ID</span><InputText v-model="slot.beatmapId" inputmode="numeric" @input="handleBeatmapInput(pool, slot)" /></label>
                      <div class="slot__field slot__mods-field">
                        <span>Mods</span
                        ><button type="button" class="slot__mods-configure" aria-label="Configure mods" @click.stop="openSlotMods(pool, slot)">
                          <SlidersHorizontal :size="13" /><span>Configure</span>
                        </button>
                      </div>
                    </div>
                    <Transition name="slot-preview">
                      <div
                        v-if="previewIsVisible(pool, slot)"
                        class="slot__preview"
                        :style="
                          slot.preview?.beatmapsetId
                            ? {
                                backgroundImage: `linear-gradient(90deg, rgba(10, 12, 22, .94), rgba(10, 12, 22, .68)), ${beatmapCoverBackground(slot.preview.beatmapsetId)}`,
                              }
                            : undefined
                        "
                      >
                        <div class="slot__preview-main">
                          <strong>{{ slot.preview.artist }} — {{ slot.preview.title }}</strong
                          ><span>{{ slot.preview.diff }}</span>
                        </div>
                        <div class="slot__preview-meta">
                          <span v-if="slot.preview.starRating != null">★ {{ Number(slot.preview.starRating).toFixed(2) }}</span
                          ><span v-if="slot.preview.starRating != null && slot.preview.author">·</span><span v-if="slot.preview.author">mapped by {{ slot.preview.author }}</span>
                        </div>
                      </div>
                    </Transition>
                    <span class="slot__actions" @click.stop
                      ><Button v-tooltip.top="'Edit beatmap win condition'" text rounded aria-label="Edit beatmap win condition" @click="editSlot(pool, slot)"><Pencil :size="15" /></Button
                      ><Button v-tooltip.top="'Delete beatmap'" text rounded severity="danger" aria-label="Delete beatmap" @click="requestDelete(pool, { type: 'slot', slotId: slot.slotId })"
                        ><Trash2 :size="15" /></Button
                    ></span>
                  </div></div
              ></Transition>
            </section>
          </div></div
      ></Transition>
    </article>
    <p v-if="!mappools.length" class="mappools__empty">No mappools yet.</p>
  </Dialog>
  <BulkBeatmapImportDialog v-model:visible="bulkImportVisible" :pool="bulkImportPool" @import="importBulkMaps" />
  <Dialog
    v-if="editing"
    :visible="poolEditVisible"
    modal
    :dismissable-mask="true"
    header="Edit mappool"
    class="mappools-dialog mappools-dialog--form"
    :style="{ width: '30rem' }"
    :pt="{ mask: { class: 'app-dialog-mask' } }"
    @update:visible="(value) => !value && cancelPoolEdit()"
    ><div class="mappools-dialog__field"><span>Name</span><InputText v-model="editing.name" /></div>
    <div class="mappools-dialog__field"><span>Stage</span><InputText v-model="editing.stage" /></div>
    <div class="mappools-dialog__field">
      <span>Ruleset</span>
      <div class="mappools-ruleset-dropdown">
        <button ref="rulesetTrigger" type="button" class="mappools-ruleset-dropdown__trigger" :aria-expanded="rulesetMenuOpen" aria-haspopup="listbox" @click="toggleRulesetMenu">
          <span>{{ editing.ruleset }}</span
          ><ChevronDown :size="14" /></button
        ><Teleport to="body"
          ><Transition name="mappools-dropdown"
            ><div v-if="rulesetMenuOpen" class="mappools-ruleset-dropdown__menu" :style="rulesetMenuStyle" role="listbox" aria-label="Ruleset">
              <button
                v-for="option in rulesets"
                :key="option.value"
                type="button"
                class="mappools-ruleset-dropdown__option"
                :class="{ 'mappools-ruleset-dropdown__option--selected': option.value === editing.ruleset }"
                role="option"
                :aria-selected="option.value === editing.ruleset"
                @click="selectRuleset(option.value)"
              >
                {{ option.label }}
              </button>
            </div></Transition
          ></Teleport
        >
      </div>
    </div>
    <div class="mappools-dialog__field">
      <span>FreeMod multipliers</span>
      <div class="mappools-multipliers">
        <div v-for="(row, index) in editing.freeModMultipliers" :key="index" class="mappools-multiplier-row">
          <InputText v-model="row.mods" placeholder="EZ+RX" aria-label="Mod combination" />
          <InputText v-model="row.multiplier" type="number" min="0" step="0.01" placeholder="1.5" aria-label="Multiplier" />
          <Button v-tooltip.top="'Delete multiplier'" text rounded severity="danger" aria-label="Delete multiplier" @click="editing.freeModMultipliers.splice(index, 1)"><Trash2 :size="14" /></Button>
        </div>
        <Button v-tooltip.top="'Add FreeMod multiplier'" text label="Add multiplier" class="mappools-dialog__configure" @click="editing.freeModMultipliers.push({ mods: '', multiplier: 1 })" />
      </div>
    </div>
    <template #footer
      ><Button v-tooltip.top="'Cancel mappool editing'" text label="Cancel" class="mappools-dialog__cancel" @click="cancelPoolEdit" /><Button
        v-tooltip.top="'Save mappool'"
        label="Save"
        class="mappools-dialog__save"
        @click="savePool" /></template
  ></Dialog>
  <Dialog
    v-if="editingSlot"
    :visible="slotEditVisible"
    modal
    :dismissable-mask="true"
    header="Edit beatmap"
    class="mappools-dialog mappools-dialog--form"
    :style="{ width: '34rem' }"
    :pt="{ mask: { class: 'app-dialog-mask' } }"
    @update:visible="(value) => !value && cancelSlotEdit()"
  >
    <div class="mappools-dialog__win-section">
      <span class="mappools-dialog__win-label">Win condition</span>
      <div class="mappools-dialog__win-row">
        <div class="mappools-win-dropdown">
          <button ref="winTemplateTrigger" type="button" class="mappools-win-dropdown__trigger" :aria-expanded="winTemplateMenuOpen" aria-haspopup="listbox" @click="toggleWinTemplateMenu">
            <span>{{ LAZER_WIN_CONDITION_TEMPLATES.find((item) => item.value === editingSlot.winTemplate)?.label }}</span
            ><ChevronDown :size="14" /></button
          ><Teleport to="body"
            ><Transition name="mappools-dropdown"
              ><div v-if="winTemplateMenuOpen" class="mappools-win-dropdown__menu" :style="winTemplateMenuStyle" role="listbox">
                <button
                  v-for="option in LAZER_WIN_CONDITION_TEMPLATES"
                  :key="option.value"
                  type="button"
                  class="mappools-win-dropdown__option"
                  :class="{ 'mappools-win-dropdown__option--selected': option.value === editingSlot.winTemplate }"
                  role="option"
                  :aria-selected="option.value === editingSlot.winTemplate"
                  @click="selectWinTemplate(option.value)"
                >
                  {{ option.label }}
                </button>
              </div></Transition
            ></Teleport
          >
        </div>
        <Button
          v-if="editingSlot.winTemplate === 'custom'"
          v-tooltip.top="'Configure custom win condition'"
          text
          rounded
          class="mappools-dialog__configure"
          aria-label="Configure custom win condition"
          @click="configureWinCondition"
          >Configure</Button
        >
      </div>
      <div class="mappools-dialog__reverse">
        <span>Winner rule</span>
        <SelectButton
          :model-value="editingSlot.winReverse"
          :options="winnerRuleOptions"
          option-label="label"
          option-value="value"
          :allow-empty="false"
          aria-label="Winner rule"
          @update:model-value="setWinReverse"
        />
      </div>
    </div>
    <template #footer
      ><Button v-tooltip.top="'Cancel beatmap editing'" text label="Cancel" class="mappools-dialog__cancel" @click="cancelSlotEdit" /><Button
        v-tooltip.top="'Save beatmap'"
        label="Save"
        class="mappools-dialog__save"
        @click="saveSlot" /></template
  ></Dialog>
  <Dialog
    v-if="editingSlot"
    v-model:visible="winVisible"
    modal
    :dismissable-mask="true"
    header="Win condition"
    class="mappools-dialog mappools-dialog--win"
    :style="{ width: '70vw', maxWidth: '70vw' }"
    :pt="{ mask: { class: 'app-dialog-mask' } }"
    ><WinConditionEditor
      ref="editor"
      lazer-mode
      :model-value="editingSlot.slot.winCondition?.source || LAZER_DEFAULT_WIN_CONDITION"
      :slot-id="editingSlot.slot.slotId"
      @update:model-value="(source) => (editingSlot.slot.winCondition = { ...(editingSlot.slot.winCondition || {}), type: 'script', template: 'custom', reverse: editingSlot.winReverse, source })"
  /></Dialog>
  <Dialog
    v-if="deleteConfirmation"
    :visible="Boolean(deleteConfirmation)"
    modal
    :dismissable-mask="true"
    :show-header="false"
    class="mappools-dialog mappools-delete-confirm-dialog"
    :class="{ 'mappools-delete-confirm-dialog--pool': deleteConfirmation.type === 'pool' }"
    :pt="{ mask: { class: 'app-dialog-mask' } }"
    @update:visible="(value) => !value && cancelDelete()"
  >
    <div class="mappools-delete-confirm-dialog__body">
      <div class="mappools-delete-confirm-dialog__heading">
        <AlertTriangle :size="21" class="mappools-delete-confirm-dialog__icon" />
        <h2>Delete {{ deleteConfirmation.type === "pool" ? "mappool" : deleteConfirmation.type === "category" ? "category" : "beatmap" }}?</h2>
      </div>
      <p>This action cannot be undone.</p>
    </div>
    <label v-if="deleteConfirmation.type !== 'pool'" class="mappools-delete-confirmation__option">
      <ToggleSwitch v-model="deleteConfirmation.neverAskAgain" class="app-solid-switch" />
      <span>Never ask me again for this mappool</span>
    </label>
    <template #footer>
      <Button v-tooltip.top="'Cancel deletion'" text label="Cancel" class="mappools-dialog__cancel" @click="cancelDelete" />
      <Button v-tooltip.top="'Confirm deletion'" label="Delete" severity="danger" @click="confirmDelete" />
    </template>
  </Dialog>
  <PlaylistModsModal v-if="slotModsTarget" v-model:visible="slotModsVisible" :item="slotModsTarget" :ruleset-id="slotModsRuleset" local-only @save-mods="applySlotMods" />
  <Dialog
    v-if="invalidMappoolsConfirmation"
    :visible="Boolean(invalidMappoolsConfirmation)"
    modal
    :dismissable-mask="false"
    :close-on-escape="false"
    :show-header="false"
    class="mappools-dialog mappools-delete-confirm-dialog mappools-invalid-confirm-dialog"
    :pt="{ mask: { class: 'app-dialog-mask' } }"
  >
    <div class="mappools-delete-confirm-dialog__body">
      <div class="mappools-delete-confirm-dialog__heading">
        <AlertTriangle :size="21" class="mappools-delete-confirm-dialog__icon" />
        <h2>Invalid mappool{{ invalidMappoolsConfirmation.length > 1 ? "s" : "" }}</h2>
      </div>
      <p>
        The following mappool{{ invalidMappoolsConfirmation.length > 1 ? "s are" : " is" }} invalid and will be deleted:
        <strong>{{ invalidMappoolsConfirmation.map((pool) => pool.name).join(", ") }}</strong>
      </p>
    </div>
    <template #footer>
      <Button v-tooltip.top="'Delete invalid mappools'" text label="Delete" class="mappools-invalid-confirm-dialog__delete" @click="confirmRemoveInvalidMappools" />
      <Button v-tooltip.top="'Keep editing mappools'" label="Stay" class="mappools-invalid-confirm-dialog__stay" @click="keepInvalidMappools" />
    </template>
  </Dialog>
</template>
<style>
.mappools-dialog {
  overflow: hidden;
  border: 1px solid var(--app-border) !important;
  border-radius: 0.85rem !important;
  background: var(--app-panel-gradient) !important;
  box-shadow: 0 1.25rem 3rem rgba(0, 0, 0, 0.35) !important;
  color: var(--app-text) !important;
}
.mappools-dialog .p-dialog-header,
.mappools-dialog .p-dialog-content,
.mappools-dialog .p-dialog-footer {
  background: transparent !important;
  color: var(--app-text) !important;
}
.mappools-dialog .p-dialog-header {
  padding: 1.1rem 1.25rem 0.9rem !important;
  border-bottom: 1px solid var(--app-border) !important;
}
.mappools-dialog .p-dialog-title {
  color: var(--app-text) !important;
  font-size: 1rem;
  font-weight: 800;
}
.mappools-dialog .p-dialog-content {
  padding: 1.15rem 1.25rem !important;
}
.mappools-dialog .p-dialog-footer {
  display: flex;
  justify-content: flex-end;
  gap: 0.55rem;
  padding: 0.9rem 1.25rem 1.1rem !important;
  border-top: 1px solid var(--app-border) !important;
}
.mappools-dialog .p-dialog-close-button {
  width: 1.9rem !important;
  height: 1.9rem !important;
  color: var(--app-muted) !important;
  border-radius: 0.5rem !important;
}
.mappools-dialog .p-dialog-close-button:hover {
  background: rgba(var(--app-primary-rgb), 0.12) !important;
  color: var(--app-primary-bright) !important;
}
.mappools__toolbar {
  display: flex;
  justify-content: flex-end;
  gap: 0.3rem;
  margin: -0.35rem 0 0.75rem;
}
.mappool {
  border: 1px solid var(--app-border);
  border-radius: 0.7rem;
  margin: 0.5rem 0;
  background: rgba(var(--app-primary-rgb), 0.025);
  transition:
    border-color 0.16s ease,
    background 0.16s ease;
}
.mappool:hover {
  border-color: var(--app-border-strong);
  background: rgba(var(--app-primary-rgb), 0.05);
}
.mappool header {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  min-height: 3.5rem;
  padding: 0.45rem;
}
.mappool header > div {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-width: 0;
}
.mappool strong {
  font-size: 0.78rem;
}
.mappool small {
  color: var(--app-muted);
  font-size: 0.68rem;
}
.mappool__actions {
  display: flex;
  align-items: center;
  gap: 0.15rem;
  flex-shrink: 0;
}
.mappool__slots {
  overflow: hidden;
}
.mappool__slots-inner {
  border-top: 1px solid var(--app-border);
  padding: 0.3rem 0.6rem;
}
.slot {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 0.55rem;
  min-height: 2.5rem;
  padding: 0.3rem;
  color: var(--app-muted);
  font-size: 0.72rem;
}
.slot__fields {
  display: flex;
  flex: 1 1 auto;
  gap: 0.45rem;
  min-width: 0;
}
.slot__field {
  display: flex;
  flex: 1 1 0;
  flex-direction: column;
  gap: 0.2rem;
  min-width: 0;
  color: var(--app-muted);
  font-size: 0.6rem;
  font-weight: 700;
}
.slot__field > .p-inputtext {
  width: 100%;
  min-width: 0;
  height: 1.85rem;
  padding: 0.25rem 0.4rem !important;
  border: 1px solid var(--app-border) !important;
  border-radius: 0.45rem !important;
  background: var(--app-control) !important;
  color: var(--app-text) !important;
  box-shadow: none !important;
  font: inherit;
  font-size: 0.68rem;
}
.slot__mods-field .slot__mods-configure {
  display: inline-flex;
  width: fit-content;
  min-height: 2.1rem;
  align-items: center;
  gap: 0.3rem;
  justify-content: flex-start;
  padding: 0 0.4rem;
  overflow: visible;
  border: 1px solid transparent;
  border-radius: 0.35rem;
  background: transparent;
  color: var(--app-muted) !important;
  font: inherit;
  font-size: 0.62rem;
  font-weight: 700;
  white-space: nowrap;
  cursor: pointer;
  transition:
    border-color 160ms ease,
    background-color 160ms ease,
    color 160ms ease;
}
.slot__mods-field .slot__mods-configure {
  margin-top: 0.225rem;
}
.slot__mods-field .slot__mods-configure :deep(svg) {
  flex: 0 0 auto;
}
.slot__mods-field .slot__mods-configure:hover:not(:disabled) {
  border-color: rgba(var(--app-primary-rgb), 0.24);
  background: rgba(var(--app-primary-rgb), 0.1);
  color: var(--app-primary-bright) !important;
}
.slot__field > .p-inputtext:focus {
  border-color: var(--app-primary-bright) !important;
  box-shadow: 0 0 0 0.1rem rgba(var(--app-primary-rgb), 0.14) !important;
}
.slot__actions {
  display: flex;
  flex: 0 0 auto;
  gap: 0.15rem;
}
.mappools__empty {
  padding: 1.5rem;
  color: var(--app-muted);
  text-align: center;
  font-size: 0.78rem;
}
.mappools-dialog .p-button {
  font-family: inherit;
}
.mappools-dialog .mappool .p-button {
  width: 1.8rem;
  height: 1.8rem;
  padding: 0 !important;
  border: 1px solid transparent !important;
  background: transparent !important;
  color: var(--app-primary) !important;
}
.mappools-dialog .mappool .p-button:hover {
  background: rgba(var(--app-primary-rgb), 0.12) !important;
  color: var(--app-primary-bright) !important;
}
.mappools-dialog .mappool .p-button.p-button-danger {
  color: var(--app-red) !important;
}
.mappools-dialog .mappool .p-button.p-button-danger:hover {
  background: rgba(255, 109, 120, 0.12) !important;
}
.mappools-dialog svg {
  width: 15px;
  height: 15px;
}
.mappools-dialog .mappools__toolbar svg {
  width: 16px;
  height: 16px;
}
.mappools-dialog .p-button:not(.p-button-danger):not(.p-button-text):not(.mappools-dialog__save) {
  color: var(--app-primary) !important;
}
.mappools-dialog .p-button:not(.p-button-danger):not(.p-button-text):not(.mappools-dialog__save):hover {
  color: var(--app-primary-bright) !important;
}
.mappools-dialog .p-button svg {
  stroke: currentColor !important;
}
.mappools-dialog .mappools__toolbar .p-button {
  width: 1.8rem !important;
  height: 1.8rem !important;
  padding: 0 !important;
  background: transparent !important;
  color: var(--app-primary) !important;
}
.mappools-dialog .mappools__toolbar .p-button:hover {
  color: var(--app-primary-bright) !important;
  background: rgba(var(--app-primary-rgb), 0.12) !important;
}
.mappools-dialog .mappools-dialog__win-button {
  color: var(--app-primary) !important;
}
.mappools-dialog .mappools-dialog__win-button:hover {
  background: rgba(var(--app-primary-rgb), 0.12) !important;
  color: var(--app-primary-bright) !important;
}
.mappools-dialog .danger-action {
  color: var(--app-red) !important;
}
.mappools-dialog--form .mappools-dialog__field {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
  margin: 0.75rem 0;
  color: var(--app-muted);
  font-size: 0.72rem;
  font-weight: 700;
}
.mappools-dialog--form .p-inputtext,
.mappools-dialog--form .p-select,
.mappools-dialog--form .tag-input,
.mappools-dialog--form .mappools-ruleset-dropdown__trigger {
  width: 100%;
  border: 1px solid var(--app-border) !important;
  border-radius: 0.6rem !important;
  background: var(--app-control) !important;
  color: var(--app-text) !important;
  box-shadow: none !important;
}
.mappools-dialog--form .p-inputtext:hover,
.mappools-dialog--form .tag-input:hover,
.mappools-dialog--form .mappools-ruleset-dropdown__trigger:hover {
  border-color: var(--app-border-strong) !important;
}
.mappools-dialog--form .p-inputtext:focus,
.mappools-dialog--form .tag-input:focus-within,
.mappools-dialog--form .mappools-ruleset-dropdown__trigger[aria-expanded="true"] {
  border-color: var(--app-primary-bright) !important;
  box-shadow: 0 0 0 0.15rem rgba(var(--app-primary-rgb), 0.16) !important;
}
.mappools-dialog--form .p-select-label {
  color: var(--app-text) !important;
}
.mappools-dialog--form .p-select-overlay {
  border: 1px solid var(--app-border) !important;
  border-radius: 0.6rem !important;
  background: var(--app-surface-raised) !important;
}
.mappools-dialog--form .p-select-option {
  color: var(--app-text) !important;
}
.mappools-dialog--form .p-select-option:hover,
.mappools-dialog--form .p-select-option.p-focus {
  background: rgba(var(--app-primary-rgb), 0.12) !important;
  color: var(--app-primary-bright) !important;
}
.mappools-multipliers {
  display: flex;
  flex-direction: column;
  gap: 0.45rem;
}
.mappools-multiplier-row {
  display: flex;
  align-items: center;
  gap: 0.4rem;
}
.mappools-multiplier-row .p-inputtext:first-child {
  flex: 1;
}
.mappools-multiplier-row .p-inputtext:nth-child(2) {
  width: 6rem;
}
.mappools-multiplier-row .p-button {
  flex: 0 0 auto;
}
.mappools-delete-confirm-dialog {
  width: min(28rem, calc(100vw - 2rem));
}
.mappools-delete-confirm-dialog .p-dialog-content {
  padding: 1.25rem 1.25rem 1rem !important;
}
.mappools-delete-confirm-dialog--pool .p-dialog-content {
  padding-bottom: 1.25rem !important;
}
.mappools-delete-confirm-dialog .p-dialog-footer {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 0.55rem;
  padding: 0.8rem 1.25rem 0.95rem !important;
  border-top: 1px solid var(--app-border) !important;
}
.mappools-delete-confirm-dialog__body {
  min-width: 0;
}
.mappools-delete-confirm-dialog__heading {
  display: flex;
  align-items: center;
  gap: 0.7rem;
}
.mappools-delete-confirm-dialog__heading h2 {
  margin: 0;
  color: var(--app-text);
  font-size: 0.95rem;
  font-weight: 800;
  letter-spacing: -0.01em;
}
.mappools-delete-confirm-dialog__icon {
  flex: 0 0 auto;
  width: 1.2rem;
  height: 1.2rem;
  color: var(--app-amber);
}
.mappools-delete-confirm-dialog__body p {
  margin: 0.55rem 0 0 1.6rem;
  color: var(--app-muted);
  font-size: 0.78rem;
}
.mappools-delete-confirmation__option {
  display: flex;
  align-items: center;
  justify-content: flex-start;
  gap: 0.65rem;
  margin: 0.9rem 0 0 1.6rem;
  color: var(--app-muted);
  font-size: 0.72rem;
  font-weight: 700;
}
.mappools-delete-confirmation__option .p-toggleswitch {
  flex: 0 0 auto;
  order: -1;
}
.mappools-delete-confirm-dialog .mappools-dialog__cancel {
  color: var(--app-muted) !important;
}
.mappools-delete-confirm-dialog .p-button-danger {
  min-width: 4.2rem;
  padding-inline: 0.9rem !important;
  border-color: var(--app-primary) !important;
  background: var(--app-primary) !important;
  color: #fff !important;
}
.mappools-delete-confirm-dialog .p-button-danger:hover:not(:disabled) {
  border-color: var(--app-primary-bright) !important;
  background: var(--app-primary-bright) !important;
}
.mappools-invalid-confirm-dialog .p-dialog-content {
  padding-bottom: 1.25rem !important;
}
.mappools-invalid-confirm-dialog__delete {
  color: var(--app-red) !important;
}
.mappools-invalid-confirm-dialog__delete:hover:not(:disabled) {
  background: rgba(255, 109, 120, 0.12) !important;
  color: var(--app-red) !important;
}
.mappools-dialog.mappools-invalid-confirm-dialog .p-button.mappools-invalid-confirm-dialog__stay,
.mappools-dialog.mappools-invalid-confirm-dialog .p-button.mappools-invalid-confirm-dialog__stay .p-button-label {
  color: #ffffff !important;
}
.mappools-invalid-confirm-dialog .mappools-delete-confirm-dialog__body p {
  line-height: 1.45;
}
.mappools-invalid-confirm-dialog .mappools-delete-confirm-dialog__body strong {
  color: var(--app-text);
  font-weight: 700;
}
.mappools-dialog__win-button {
  width: auto !important;
  align-self: flex-start;
  margin-top: 0.35rem;
}
.mappools-dialog__win-button span {
  font-size: 0.72rem;
}
.win-active {
  color: var(--app-primary-bright) !important;
  background: rgba(var(--app-primary-rgb), 0.12) !important;
}
.mappools-dialog__confirm-actions {
  display: flex;
  justify-content: flex-end;
  gap: 0.45rem;
}
.danger-action {
  color: var(--app-red) !important;
}
.mappools-dialog__win-row {
  display: flex;
  align-items: center;
  gap: 0.55rem;
  margin-top: 0.85rem;
}
.mappools-win-dropdown {
  position: relative;
  flex: 1;
  min-width: 0;
}
.mappools-win-dropdown__trigger {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  min-height: 2.2rem;
  padding: 0.55rem 0.7rem;
  border: 1px solid var(--app-border);
  border-radius: 0.6rem;
  background: var(--app-control);
  color: var(--app-text);
  font: inherit;
  font-size: 0.72rem;
  text-align: left;
  cursor: pointer;
}
.mappools-win-dropdown__trigger:hover,
.mappools-win-dropdown__trigger[aria-expanded="true"] {
  border-color: var(--app-primary-bright);
}
.mappools-win-dropdown__trigger[aria-expanded="true"] {
  box-shadow: 0 0 0 0.15rem rgba(var(--app-primary-rgb), 0.16);
}
.mappools-win-dropdown__menu {
  position: fixed;
  z-index: 2000;
  padding: 0.3rem;
  border: 1px solid var(--app-border);
  border-radius: 0.55rem;
  background: var(--app-surface-raised);
  box-shadow: 0 1rem 2.5rem rgba(0, 0, 0, 0.35);
}
.mappools-win-dropdown__option {
  display: block;
  width: 100%;
  padding: 0.45rem 0.7rem;
  border: 0;
  border-radius: 0.4rem;
  background: transparent;
  color: var(--app-text);
  font: inherit;
  font-size: 0.72rem;
  text-align: left;
  cursor: pointer;
}
.mappools-win-dropdown__option:hover,
.mappools-win-dropdown__option:focus-visible,
.mappools-win-dropdown__option--selected {
  background: rgba(var(--app-primary-rgb), 0.12);
  color: var(--app-primary-bright);
  outline: none;
}
.mappools-dialog__configure {
  flex: 0 0 auto !important;
  padding: 0.45rem 0.7rem !important;
  border: 1px solid var(--app-border) !important;
  border-radius: 0.55rem !important;
  color: var(--app-primary) !important;
  font-size: 0.7rem !important;
}
.mappools-dialog__configure:hover {
  background: rgba(var(--app-primary-rgb), 0.12) !important;
  color: var(--app-primary-bright) !important;
}
.mappools-dialog__reverse {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  width: 100%;
  gap: 0.4rem;
  color: var(--app-muted);
  font-size: 0.72rem;
  font-weight: 700;
}
.mappools-dialog__reverse .p-selectbutton {
  display: flex;
  width: 100%;
}
.mappools-dialog__reverse .p-selectbutton .p-togglebutton {
  flex: 1 1 0;
  border-color: var(--app-border) !important;
  background: var(--app-control) !important;
  color: var(--app-muted) !important;
  font-size: 0.74rem;
}
.mappools-dialog__reverse .p-selectbutton .p-togglebutton .p-togglebutton-content {
  background: transparent !important;
  box-shadow: none !important;
}
.mappools-dialog__reverse .p-selectbutton .p-togglebutton.p-togglebutton-checked {
  border-color: rgba(var(--app-primary-rgb), 0.5) !important;
  background: rgba(var(--app-primary-rgb), 0.16) !important;
  color: var(--app-primary-bright) !important;
}
.mappools-ruleset-dropdown {
  position: relative;
  width: 100%;
}
.mappools-ruleset-dropdown__trigger {
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
.mappools-ruleset-dropdown__trigger:hover,
.mappools-ruleset-dropdown__trigger[aria-expanded="true"] {
  border-color: var(--app-primary-bright);
}
.mappools-ruleset-dropdown__trigger[aria-expanded="true"] {
  box-shadow: 0 0 0 0.15rem rgba(var(--app-primary-rgb), 0.16);
}
.mappools-ruleset-dropdown__trigger svg {
  color: var(--app-muted);
}
.mappools-ruleset-dropdown__menu {
  position: fixed;
  z-index: 2000;
  top: auto;
  right: auto;
  bottom: auto;
  left: auto;
  padding: 0.3rem;
  border: 1px solid var(--app-border);
  border-radius: 0.55rem;
  background: var(--app-surface-raised);
  box-shadow: 0 1rem 2.5rem rgba(0, 0, 0, 0.35);
}
.mappools-ruleset-dropdown__option {
  display: block;
  width: 100%;
  padding: 0.45rem 0.7rem;
  border: 0;
  border-radius: 0.4rem;
  background: transparent;
  color: var(--app-text);
  font: inherit;
  font-size: 0.76rem;
  text-align: left;
  cursor: pointer;
}
.mappools-ruleset-dropdown__option:hover,
.mappools-ruleset-dropdown__option:focus-visible {
  background: rgba(var(--app-primary-rgb), 0.12);
  color: var(--app-primary-bright);
  outline: none;
}
.mappools-ruleset-dropdown__option--selected {
  background: rgba(var(--app-primary-rgb), 0.18);
  color: var(--app-primary-bright);
}
.mappool > header {
  cursor: pointer;
  outline: none;
}
.mappool > header:focus-visible {
  box-shadow: inset 0 0 0 0.15rem rgba(var(--app-primary-rgb), 0.22);
}
.mappool__slots {
  overflow: hidden;
}
.mappool__slots-inner {
  min-height: 0;
  overflow: hidden;
}
.slot {
  justify-content: flex-start;
}
.slot__fields {
  flex: 0 0 45%;
  max-width: 45%;
}
.slot__field:first-child {
  flex: 0 0 42%;
}
.slot__field:nth-child(2) {
  flex: 1 1 auto;
  min-width: 0;
}
.slot__mods-field {
  flex: 1 1 auto !important;
  min-width: 7.5rem;
}
.slot__field > .p-inputtext {
  height: 2.55rem;
}
.slot__field:first-child > .p-inputtext {
  font-size: 0.78rem;
  font-weight: 700;
}
.slot__preview {
  flex: 1 0 18rem;
  max-width: 23rem;
  margin-left: 0.35rem;
}
.slot__actions {
  align-self: center;
  margin-left: auto;
}
.mappool__category {
  border-top: 1px solid var(--app-border);
}
.mappool__category:first-child {
  border-top: 0;
}
.mappool__category-header {
  display: flex;
  align-items: center;
  gap: 0.35rem;
  min-height: 2.5rem;
  padding: 0.2rem 0.3rem;
  cursor: pointer;
}
.mappool__category-header strong {
  flex: 1;
  color: var(--app-text);
  font-size: 0.7rem;
}
.mappool__category-header small {
  min-width: 1.2rem;
  padding: 0.05rem 0.25rem;
  border-radius: 999px;
  background: rgba(var(--app-primary-rgb), 0.12);
  color: var(--app-muted);
  font-size: 0.58rem;
  text-align: center;
}
.mappool__category-header .p-button {
  width: 1.6rem !important;
  height: 1.6rem !important;
}
.mappool__category-slots {
  overflow: hidden;
  padding: 0 0.3rem 0.3rem;
}
.mappool__category-name-input {
  flex: 1 1 auto;
  min-width: 0;
  height: 1.8rem;
  padding: 0.25rem 0.4rem !important;
  border: 1px solid var(--app-primary-bright) !important;
  border-radius: 0.45rem !important;
  background: var(--app-control) !important;
  color: var(--app-text) !important;
  box-shadow: 0 0 0 0.1rem rgba(var(--app-primary-rgb), 0.14) !important;
  font: inherit;
  font-size: 0.7rem;
}
.mappool__category-header strong {
  flex: 0 1 auto;
}
.mappool__category-header .p-button[aria-label="Rename category"] {
  width: 1.35rem !important;
  height: 1.35rem !important;
  color: var(--app-text) !important;
}
.mappool__category-header .p-button[aria-label="Rename category"] svg {
  width: 11px;
  height: 11px;
}
.mappool__category-header .p-button[aria-label="Rename category"]:hover {
  color: var(--app-text) !important;
}
.mappool__category-header small {
  margin-left: auto;
}
.mappool__category-header .p-button[aria-label="Rename category"] {
  opacity: 0;
  pointer-events: none;
  transition: opacity 0.16s linear;
}
.mappool__category:hover .p-button[aria-label="Rename category"] {
  opacity: 1;
  pointer-events: auto;
}
.mappool__category-header .p-button[aria-label="Save category name"] {
  width: 1.35rem !important;
  height: 1.35rem !important;
  color: var(--app-text) !important;
}
.mappool__category-header .p-button[aria-label="Save category name"] svg {
  width: 12px;
  height: 12px;
}
.mappool__category-name-input {
  flex: 0 0 25%;
  max-width: 25%;
  height: 2.15rem;
  font-size: 0.75rem;
  font-weight: 700;
}
.slot__preview {
  display: flex;
  flex: 1 1 auto;
  flex-direction: column;
  justify-content: center;
  min-width: 0;
  min-height: 2.15rem;
  padding: 0.25rem 0.55rem;
  border: 1px solid var(--app-border);
  border-radius: 0.45rem;
  background-color: var(--app-control);
  background-position: center;
  background-size: cover;
  background-clip: padding-box;
  color: var(--app-text);
  overflow: hidden;
}
.slot__preview-main {
  display: flex;
  align-items: baseline;
  gap: 0.35rem;
  min-width: 0;
}
.slot__preview-main strong,
.slot__preview-main span {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.slot__preview-main strong {
  font-size: 0.68rem;
}
.slot__preview-main span {
  color: var(--app-muted);
  font-size: 0.62rem;
}
.slot__preview-meta {
  display: flex;
  align-items: center;
  gap: 0.3rem;
  color: var(--app-muted);
  font-size: 0.58rem;
  white-space: nowrap;
}
.slot__preview-meta span:first-child {
  color: var(--app-primary-bright);
}
.slot-preview-enter-active,
.slot-preview-leave-active {
  transition: opacity 0.16s linear;
}
.slot-preview-enter-from,
.slot-preview-leave-to {
  opacity: 0;
}
.slot__actions {
  align-self: flex-start !important;
  margin-top: 1.45rem;
  margin-left: auto;
}
.slot__field > .p-inputtext {
  padding: 0 0.4rem !important;
  line-height: calc(2.55rem - 2px);
}
.mappools-dialog__win-row .mappools-win-dropdown {
  flex: 0 0 40%;
  max-width: 40%;
}
.mappools-dialog__win-section {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 0.35rem;
  margin-top: 0.85rem;
}
.mappools-dialog__win-section .mappools-dialog__win-row {
  width: 100%;
  margin-top: 0;
}
.mappools-dialog__win-label {
  color: var(--app-muted);
  font-size: 0.72rem;
  font-weight: 700;
}
.mappools-dropdown-enter-active,
.mappools-dropdown-leave-active {
  transition:
    opacity 0.14s linear,
    transform 0.14s linear;
  transform-origin: top center;
}
.mappools-dropdown-enter-from,
.mappools-dropdown-leave-to {
  opacity: 0;
  transform: translateY(-4px) scale(0.98);
}
</style>
