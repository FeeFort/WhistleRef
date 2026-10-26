<script setup>
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from "vue";
import Button from "primevue/button";
import Dialog from "primevue/dialog";
import InputNumber from "primevue/inputnumber";
import Select from "primevue/select";
import ToggleSwitch from "primevue/toggleswitch";
import { ChevronDown } from "@lucide/vue";
import { useToast } from "primevue/usetoast";
import { useServerConnection } from "../../composables/useServerConnection";
import modsMetadata from "../../assets/mods/mods.json";
import settingsMetadata from "../../assets/mods/settings.json";
import modHexRaw from "../../assets/mods/mod-icon.svg?raw";
import modCustomizedRaw from "../../assets/mods/mod-customized.svg?raw";
import modExtenderRaw from "../../assets/mods/mod-extender.svg?raw";
import SliderInputNumber from "../SliderInputNumber.vue";
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
  beatmap: { type: Object, default: null },
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
const modSettings = reactive({ required: {}, allowed: {} });
const freestyle = ref(false);
const customizeVisible = ref(false);
const customizeSelectOpen = ref(false);
const customizeHovered = ref(false);
let customizeCloseTimer = null;
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
const customizedBody = svgBody(modCustomizedRaw);
const extenderBody = svgBody(modExtenderRaw);
const customizedBox = viewBoxOf(modCustomizedRaw);
const extenderBox = viewBoxOf(modExtenderRaw);
const SPEED_MODS = new Set(["DT", "NC", "HT", "DC"]);
const DIFFICULTY_ADJUST_PREFIXES = Object.freeze({ circle_size: "CS", drain_rate: "HP", overall_difficulty: "OD", approach_rate: "AR" });
const EXTENDER_FONT = "Torus, Nunito, sans-serif";
// Preview geometry in icon coordinates: the hex occupies x 10..110, y 7..77. `top` is headroom for the badge.
const PREVIEW = Object.freeze({
  top: -5,
  hex: { x: 10, y: 7, w: 100, h: 70 },
  badge: { cx: 70, cy: 15, r: 40 },
  extender: { x: 62, h: 70, textX: 118, padRight: 14, fontSize: 28, fontWeight: 700 },
});
const PREVIEW_HEIGHT = PREVIEW.hex.y + PREVIEW.hex.h - PREVIEW.top;
const MORE_MODS_RATIO = (PREVIEW.hex.w / PREVIEW_HEIGHT).toFixed(4);
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
const customizeMods = computed(() => pickerCategories.value.flatMap((category) => category.mods.filter((mod) => isModSelected(mod) && mod.Settings?.length).map((mod) => ({ mod, category }))));
const hasCustomizableMods = computed(() => customizeMods.value.length > 0);
const requiredPreviewMods = computed(() => previewMods(requiredMods, "required"));
const allowedPreviewMods = computed(() => previewMods(allowedMods, "allowed"));

function itemMods(field) {
  const camelCaseField = field === "required_mods" ? "requiredMods" : "allowedMods";
  const values = Array.isArray(modsItem.value?.[field]) ? modsItem.value[field] : modsItem.value?.[camelCaseField];
  return (Array.isArray(values) ? values : []).map((mod) => (typeof mod === "string" ? mod : mod?.acronym)).filter(Boolean);
}
function itemModEntries(field) {
  const camelCaseField = field === "required_mods" ? "requiredMods" : "allowedMods";
  const values = Array.isArray(modsItem.value?.[field]) ? modsItem.value[field] : modsItem.value?.[camelCaseField];
  return (Array.isArray(values) ? values : []).filter((mod) => mod && typeof mod === "object" && mod.acronym);
}
function settingsStore(kind = pickerKind.value) {
  return modSettings[kind];
}
function settingKey(mod) {
  return String(mod.Acronym).toUpperCase();
}
function settingDefinitions(mod) {
  return Array.isArray(mod.Settings) ? mod.Settings : [];
}
function settingConfig(mod, setting) {
  return settingsMetadata[settingKey(mod)]?.[setting.Name] || null;
}
function beatmapDifficultyValue(settingName) {
  const fields = {
    circle_size: ["circleSize", "circle_size", "cs"],
    approach_rate: ["approachRate", "approach_rate", "ar"],
    drain_rate: ["drainRate", "drain_rate", "drain", "hp"],
    overall_difficulty: ["overallDifficulty", "overall_difficulty", "od", "accuracy"],
  };
  const sources = [props.beatmap, props.beatmap?.attributes, props.beatmap?.difficulty, props.beatmap?.beatmap].filter(Boolean);
  const value = fields[settingName]?.flatMap((field) => sources.map((source) => source[field])).find((candidate) => candidate !== undefined && candidate !== null);
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}
function settingRange(mod, setting) {
  const config = settingConfig(mod, setting);
  if (setting.Type !== "number" || config?.min === undefined || config?.max === undefined || config?.step === undefined) return null;
  if (settingKey(mod) === "DA" && ["circle_size", "drain_rate", "overall_difficulty", "approach_rate"].includes(setting.Name)) {
    const extended = settingsStore()[settingKey(mod)]?.extended_limits === true;
    return { min: setting.Name === "approach_rate" && extended ? -10 : 0, max: extended ? 11 : 10, step: Number(config.step), default: beatmapDifficultyValue(setting.Name) ?? config.default };
  }
  return {
    min: Number(config.min),
    max: Number(config.max),
    step: Number(config.step),
    default: config.default,
  };
}
function settingOptions(mod, setting) {
  return settingConfig(mod, setting)?.options || [];
}
function settingMaxLength(mod, setting) {
  const maxLength = Number(settingConfig(mod, setting)?.max_length);
  return Number.isInteger(maxLength) && maxLength > 0 ? maxLength : null;
}
function defaultSettingValue(mod, setting) {
  const config = settingConfig(mod, setting);
  const range = settingRange(mod, setting);
  if (setting.Type === "boolean") return false;
  if (setting.Type === "number") return settingKey(mod) === "DA" ? (beatmapDifficultyValue(setting.Name) ?? config?.default ?? range?.min ?? 0) : (config?.default ?? range?.min ?? 0);
  return config?.default ?? config?.options?.[0]?.value ?? "";
}
function defaultSettings(mod) {
  return Object.fromEntries(
    settingDefinitions(mod).map((setting) => {
      return [setting.Name, defaultSettingValue(mod, setting)];
    }),
  );
}
function ensureSettings(mod, kind = pickerKind.value, values = null) {
  const key = settingKey(mod);
  const store = settingsStore(kind);
  if (!store[key]) store[key] = defaultSettings(mod);
  if (values && typeof values === "object" && !Array.isArray(values)) {
    settingDefinitions(mod).forEach((setting) => {
      if (values[setting.Name] === undefined) return;
      const range = settingRange(mod, setting);
      if (setting.Type === "number") {
        if (values[setting.Name] === null && settingKey(mod) === "DA") {
          store[key][setting.Name] = defaultSettingValue(mod, setting);
          return;
        }
        const value = Number(values[setting.Name]);
        if (Number.isFinite(value)) {
          const bounded = range ? Math.min(range.max, Math.max(range.min, value)) : value;
          store[key][setting.Name] = bounded;
        }
      } else if (setting.Type === "boolean") store[key][setting.Name] = Boolean(values[setting.Name]);
      else {
        const option = settingOptions(mod, setting).find((entry) => String(entry.value) === String(values[setting.Name]));
        if (option) store[key][setting.Name] = option.value;
      }
    });
  }
  return store[key];
}
function settingValue(mod, setting) {
  return ensureSettings(mod)[setting.Name];
}
function updateSetting(mod, setting, value) {
  const range = settingRange(mod, setting);
  let nextValue = value;
  const maxLength = settingMaxLength(mod, setting);
  if (setting.Type === "number") {
    const numericValue = Number(value);
    if (!Number.isFinite(numericValue)) return;
    nextValue = range ? Math.min(range.max, Math.max(range.min, numericValue)) : numericValue;
    if (maxLength && String(Math.trunc(Math.abs(nextValue))).length > maxLength) return;
  }
  const values = ensureSettings(mod);
  values[setting.Name] = nextValue;
  if (settingKey(mod) === "DA" && setting.Name === "extended_limits") {
    settingDefinitions(mod)
      .filter((definition) => definition.Type === "number")
      .forEach((definition) => {
        const definitionRange = settingRange(mod, definition);
        const current = Number(values[definition.Name]);
        if (definitionRange && Number.isFinite(current)) values[definition.Name] = Math.min(definitionRange.max, Math.max(definitionRange.min, current));
      });
  }
}
function preventSettingOverflow(event, mod, setting) {
  const maxLength = settingMaxLength(mod, setting);
  if (!maxLength || event.ctrlKey || event.metaKey || event.altKey || event.key.length !== 1) return;
  const input = event.target;
  const selectionLength = Math.max(0, (input.selectionEnd ?? input.value.length) - (input.selectionStart ?? input.value.length));
  if (String(input.value).length - selectionLength >= maxLength) event.preventDefault();
}
function trimPastedSetting(event, mod, setting) {
  const maxLength = settingMaxLength(mod, setting);
  if (!maxLength) return;
  const input = event.target;
  window.setTimeout(() => {
    if (String(input.value).length <= maxLength) return;
    input.value = String(input.value).slice(0, maxLength);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  }, 0);
}
function settingTooltip(setting) {
  return setting.Description ? { value: setting.Description, dynamic: true, showDelay: 0 } : "";
}
function settingIsDefault(mod, setting, values) {
  const value = values?.[setting.Name];
  const defaultValue = defaultSettingValue(mod, setting);
  if (setting.Type === "number") return Number(value) === Number(defaultValue);
  return value === defaultValue;
}
function viewBoxOf(raw) {
  const match = String(raw || "").match(/viewBox="\s*(-?[\d.]+)[\s,]+(-?[\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)\s*"/);
  return match ? { x: Number(match[1]), y: Number(match[2]), w: Number(match[3]), h: Number(match[4]) } : { x: 0, y: 0, w: 24, h: 24 };
}
function peekSettings(mod, kind) {
  return settingsStore(kind)[settingKey(mod)] || defaultSettings(mod);
}
function customizedSettings(mod, kind) {
  const values = peekSettings(mod, kind);
  return settingDefinitions(mod).filter((setting) => !settingIsDefault(mod, setting, values));
}
function modExtenderText(mod, kind) {
  const acronym = String(mod.Acronym).toUpperCase();
  const values = peekSettings(mod, kind);
  if (SPEED_MODS.has(acronym)) {
    const setting = settingDefinitions(mod).find((entry) => entry.Name === "speed_change");
    if (!setting || settingIsDefault(mod, setting, values)) return "";
    return `${Number(values.speed_change).toFixed(2)}x`;
  }
  if (acronym === "DA") {
    const changed = customizedSettings(mod, kind);
    const prefix = changed.length === 1 ? DIFFICULTY_ADJUST_PREFIXES[changed[0].Name] : "";
    if (!prefix) return "";
    const value = Math.round(Number(values[changed[0].Name]) * 10) / 10;
    if (!Number.isFinite(value)) return "";
    return `${prefix}${Number.isInteger(value) ? value : value.toFixed(1)}`;
  }
  return "";
}
let measureContext = null;
function textWidth(text, fontSize, fontWeight) {
  measureContext ||= document.createElement("canvas").getContext("2d");
  measureContext.font = `${fontWeight} ${fontSize}px ${EXTENDER_FONT}`;
  return measureContext.measureText(text).width;
}
function buildModPreview(entry) {
  const { mod, category, kind } = entry;
  const [light, dark] = categoryColors[category.tone];
  const { top, hex, badge, extender } = PREVIEW;
  const inner = modIconInner(category, mod);
  if (!inner) return { svg: "", ratio: MORE_MODS_RATIO };
  const centerY = hex.y + hex.h / 2;
  const text = modExtenderText(mod, kind);
  const customized = customizedSettings(mod, kind).length > 0;
  let right = customized ? Math.max(hex.x + hex.w, badge.cx + badge.r) : hex.x + hex.w;
  let behind = "";
  let front = "";

  if (text) {
    const scaleY = extender.h / extenderBox.h;
    const needed = extender.textX + textWidth(text, extender.fontSize, extender.fontWeight) + extender.padRight - extender.x;
    const scaleX = Math.max(scaleY, needed / extenderBox.w);
    const shape = extenderBody.replace(/fill="(?:white|#fff|#ffffff)"/gi, `fill="${dark}"`);
    behind = `<g transform="translate(${extender.x} ${centerY - extender.h / 2}) scale(${scaleX} ${scaleY}) translate(${-extenderBox.x} ${-extenderBox.y})">${shape}</g>`;
    front += `<text x="${extender.textX}" y="${centerY}" dy=".35em" fill="${light}" font-family="${EXTENDER_FONT}" font-size="${extender.fontSize}" font-weight="${extender.fontWeight}">${escapeHtml(text)}</text>`;
    right = Math.max(right, extender.x + extenderBox.w * scaleX);
  }
  if (customized) {
    const scale = (badge.r * 2) / Math.max(customizedBox.w, customizedBox.h);
    const x = badge.cx - (customizedBox.w * scale) / 2;
    const y = badge.cy - (customizedBox.h * scale) / 2;
    const indicator = customizedBody
      .replace(/<style>[\s\S]*?<\/style>/gi, "")
      .replace(/var\(\s*--type-fg-colour[^)]*\)/g, dark)
      .replace(/var\(\s*--type-bg-colour[^)]*\)/g, light)
      .replace(/class="indicator-background"/g, `fill="${dark}"`)
      .replace(/class="indicator-foreground"/g, `fill="${light}"`);
    front = `<g transform="translate(${x} ${y}) scale(${scale}) translate(${-customizedBox.x} ${-customizedBox.y})">${indicator}</g>${front}`;
  }

  const width = right - hex.x;
  return {
    svg: `<svg viewBox="${hex.x} ${top} ${width} ${PREVIEW_HEIGHT}" fill="none" aria-hidden="true">${behind}${inner}${front}</svg>`,
    ratio: (width / PREVIEW_HEIGHT).toFixed(4),
  };
}
function previewMods(mods, kind) {
  const selected = new Set([...mods].map((acronym) => String(acronym).toUpperCase()));
  return modCategories.value.flatMap((category) =>
    category.mods
      .filter((mod) => selected.has(String(mod.Acronym).toUpperCase()))
      .map((mod) => {
        const entry = { mod, category, kind };
        return { ...entry, view: buildModPreview(entry) };
      }),
  );
}
function moreModsIconSvg() {
  const { top, hex } = PREVIEW;
  const body = hexBody.replace(/fill="white"/g, 'fill="#ffcc22"');
  const glyph = `<g fill="#594605"><circle cx="12" cy="12" r="1.8"/><circle cx="19" cy="12" r="1.8"/><circle cx="5" cy="12" r="1.8"/></g>`;
  return `<svg viewBox="${hex.x} ${top} ${hex.w} ${PREVIEW_HEIGHT}" fill="none" aria-hidden="true"><g transform="translate(10 7)">${body}</g><g transform="translate(60 42) scale(3.7) translate(-12 -12)">${glyph}</g></svg>`;
}
function previewMoreTooltip(mods) {
  const rows = mods
    .map(
      ({ mod, category, view }) =>
        `<span class="app-tooltip__more-mod-row"><span class="app-tooltip__more-mod-icon">${view?.svg || modIconSvg(category, mod)}</span><span>${escapeHtml(mod.Name)}</span></span>`,
    )
    .join("");
  return { html: `<div class="app-tooltip__more-mods">${rows}</div>`, interactive: true };
}
function syncFromItem() {
  requiredMods.clear();
  allowedMods.clear();
  Object.keys(modSettings.required).forEach((key) => delete modSettings.required[key]);
  Object.keys(modSettings.allowed).forEach((key) => delete modSettings.allowed[key]);
  itemMods("required_mods").forEach((mod) => requiredMods.add(String(mod).toUpperCase()));
  itemMods("allowed_mods").forEach((mod) => allowedMods.add(String(mod).toUpperCase()));
  itemModEntries("required_mods").forEach((entry) => {
    const mod = modByAcronym.value.get(String(entry.acronym).toUpperCase());
    if (mod) ensureSettings(mod, "required", entry.settings);
  });
  itemModEntries("allowed_mods").forEach((entry) => {
    const mod = modByAcronym.value.get(String(entry.acronym).toUpperCase());
    if (mod) ensureSettings(mod, "allowed", entry.settings);
  });
  freestyle.value = Boolean(modsItem.value?.freestyle);
  removeRequiredConflictsFromAllowed();
}
function openPicker(kind) {
  clearTimeout(customizeCloseTimer);
  customizeVisible.value = false;
  pickerKind.value = kind;
  selectedMods.clear();
  (kind === "required" ? requiredMods : allowedMods).forEach((mod) => {
    const entry = modByAcronym.value.get(mod);
    if (kind === "required" || (entry && !conflictsWithRequired(entry))) selectedMods.add(mod);
  });
  pickerVisible.value = true;
}
function commitPicker() {
  clearTimeout(customizeCloseTimer);
  customizeVisible.value = false;
  const target = pickerKind.value === "required" ? requiredMods : allowedMods;
  target.clear();
  selectedMods.forEach((acronym) => {
    const mod = modByAcronym.value.get(acronym);
    if (pickerKind.value === "required" || (mod && !conflictsWithRequired(mod))) target.add(acronym);
  });
  if (pickerKind.value === "required") removeRequiredConflictsFromAllowed();
  pickerVisible.value = false;
}
function openCustomizeOnHover() {
  customizeHovered.value = true;
  clearTimeout(customizeCloseTimer);
  if (!pickerVisible.value || !hasCustomizableMods.value) return;
  customizeCloseTimer = setTimeout(() => {
    if (customizeHovered.value) customizeVisible.value = true;
    customizeCloseTimer = null;
  }, 130);
}
function closeCustomizeOnHover() {
  customizeHovered.value = false;
  clearTimeout(customizeCloseTimer);
  if (customizeSelectOpen.value) return;
  scheduleCustomizeClose();
}
function scheduleCustomizeClose(delay = 220) {
  clearTimeout(customizeCloseTimer);
  customizeCloseTimer = setTimeout(() => {
    if (!customizeHovered.value && !customizeSelectOpen.value) customizeVisible.value = false;
    customizeCloseTimer = null;
  }, delay);
}
function openCustomizeSelect() {
  clearTimeout(customizeCloseTimer);
  customizeSelectOpen.value = true;
}
function closeCustomizeSelect() {
  customizeSelectOpen.value = false;
  if (!customizeHovered.value) scheduleCustomizeClose(1200);
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
  ensureSettings(mod, pickerKind.value);
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
function modIconInner(category, mod, selected = false) {
  const raw = modIconRaw(category, mod);
  if (!raw) return "";
  const [light, dark] = categoryColors[category.tone];
  const hex = hexBody.replace(/fill="white"/g, `fill="${selected ? dark : light}"`);
  const glyph = svgBody(raw).replace(/(fill|stroke)="white"/g, `$1="${selected ? light : dark}"`);
  return `<g transform="translate(10 7)">${hex}</g><g transform="translate(60 42) scale(${GLYPH_SCALE}) translate(-60 -42)">${glyph}</g>`;
}
function modIconSvg(category, mod, selected = false) {
  const inner = modIconInner(category, mod, selected);
  return inner ? `<svg viewBox="10 7 100 70" fill="none" aria-hidden="true">${inner}</svg>` : "";
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
function tooltip(mod, showConflicts = true) {
  const description = mod.Description ? `<span>${escapeHtml(mod.Description)}</span>` : "";
  const conflicts = showConflicts ? conflictingMods(mod) : [];
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
function formatSettingTooltipValue(mod, setting, values) {
  const value = values?.[setting.Name];
  if (setting.Type === "boolean") return value ? "On" : "Off";
  if (setting.Type === "string") return settingOptions(mod, setting).find((option) => option.value === value)?.label || String(value ?? "");
  const number = Number(value);
  if (!Number.isFinite(number)) return String(value ?? "");
  if (SPEED_MODS.has(settingKey(mod)) && setting.Name === "speed_change") return `${number.toFixed(2)}x`;
  return String(number);
}
function settingsTooltip(mod, kind) {
  const values = peekSettings(mod, kind);
  const rows = settingDefinitions(mod)
    .filter((setting) => !settingIsDefault(mod, setting, values))
    .map(
      (setting) =>
        `<div class="app-tooltip__setting-row"><span>${escapeHtml(setting.Label || setting.Name)}</span><strong>${escapeHtml(formatSettingTooltipValue(mod, setting, values))}</strong></div>`,
    )
    .join("");
  const titleOnly = !rows;
  return {
    html: `<div class="app-tooltip__mod-settings${titleOnly ? " app-tooltip__mod-settings--title-only" : ""}"><strong class="app-tooltip__mod-title">${escapeHtml(mod.Name)}</strong>${rows}</div>`,
    showDelay: 300,
    dynamic: true,
  };
}
function modStyle(category) {
  const [selected, base] = categoryColors[category.tone];
  return { "--mod-selected": selected, "--mod-base": base, "--category-color": selected };
}
function payload(mods, kind) {
  return [...mods].map((acronym) => {
    const mod = modByAcronym.value.get(acronym);
    if (!mod) return { acronym, settings: {} };
    const values = ensureSettings(mod, kind);
    const settings = Object.fromEntries(
      settingDefinitions(mod)
        .filter((setting) => !settingIsDefault(mod, setting, values))
        .map((setting) => [setting.Name, values[setting.Name]]),
    );
    return { acronym, settings };
  });
}
function save() {
  if (saving.value || !modsItem.value) return;
  commitPicker();
  removeRequiredConflictsFromAllowed();
  const data = { required_mods: payload(requiredMods, "required"), allowed_mods: freestyle.value ? [] : payload(allowedMods, "allowed"), freestyle: freestyle.value };
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
    else {
      clearTimeout(customizeCloseTimer);
      customizeSelectOpen.value = false;
      customizeVisible.value = false;
    }
  },
);
watch(
  () => [
    props.beatmap?.beatmapId,
    props.beatmap?.circleSize ?? props.beatmap?.circle_size ?? props.beatmap?.cs,
    props.beatmap?.approachRate ?? props.beatmap?.approach_rate ?? props.beatmap?.ar,
    props.beatmap?.drainRate ?? props.beatmap?.drain_rate ?? props.beatmap?.drain ?? props.beatmap?.hp,
    props.beatmap?.overallDifficulty ?? props.beatmap?.overall_difficulty ?? props.beatmap?.od ?? props.beatmap?.accuracy,
  ],
  () => {
    if (props.visible) syncFromItem();
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
onBeforeUnmount(() => {
  clearTimeout(customizeCloseTimer);
  customizeSelectOpen.value = false;
  document.removeEventListener("keydown", onKeydown, true);
});
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
            <span
              v-for="entry in requiredPreviewMods.slice(0, 5)"
              :key="entry.mod.Acronym"
              v-tooltip.top="settingsTooltip(entry.mod, entry.kind)"
              class="playlist-mods-settings-dialog__preview-mod"
              :style="{ aspectRatio: entry.view.ratio }"
            >
              <SvgMarkup :svg="entry.view.svg" />
            </span>
            <span
              v-if="requiredPreviewMods.length > 5"
              v-tooltip.top="previewMoreTooltip(requiredPreviewMods.slice(5))"
              class="playlist-mods-settings-dialog__preview-mod"
              :style="{ aspectRatio: MORE_MODS_RATIO }"
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
            <span
              v-for="entry in allowedPreviewMods.slice(0, 5)"
              :key="entry.mod.Acronym"
              v-tooltip.top="settingsTooltip(entry.mod, entry.kind)"
              class="playlist-mods-settings-dialog__preview-mod"
              :style="{ aspectRatio: entry.view.ratio }"
            >
              <SvgMarkup :svg="entry.view.svg" />
            </span>
            <span
              v-if="allowedPreviewMods.length > 5"
              v-tooltip.top="previewMoreTooltip(allowedPreviewMods.slice(5))"
              class="playlist-mods-settings-dialog__preview-mod"
              :style="{ aspectRatio: MORE_MODS_RATIO }"
              aria-label="More allowed mods"
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
    <div v-if="pickerKind === 'required'" class="playlist-mods-dialog__customize-layer" :class="{ 'playlist-mods-dialog__customize-layer--open': customizeVisible }">
      <div class="playlist-mods-dialog__customize-bar">
        <Button
          text
          class="playlist-mods-dialog__customize-toggle"
          :class="{ 'playlist-mods-dialog__customize-toggle--open': customizeVisible }"
          :disabled="!hasCustomizableMods"
          :aria-expanded="customizeVisible"
          @mouseenter="openCustomizeOnHover"
          @mouseleave="closeCustomizeOnHover"
          ><span>Customize</span><ChevronDown :size="13"
        /></Button>
      </div>
      <Transition name="customize-panel">
        <div v-if="customizeVisible" class="playlist-mods-dialog__customize-zone" @mouseenter="openCustomizeOnHover" @mouseleave="closeCustomizeOnHover">
          <div class="playlist-mods-dialog__customize-panel">
            <div v-for="entry in customizeMods" :key="entry.mod.Acronym" class="playlist-mods-dialog__customize-mod">
              <div class="playlist-mods-dialog__customize-mod-header">
                <span class="playlist-mods-dialog__customize-icon"><SvgMarkup :svg="modIconSvg(entry.category, entry.mod)" /></span>
                <strong>{{ entry.mod.Name }}</strong>
              </div>
              <div
                v-for="setting in settingDefinitions(entry.mod)"
                :key="setting.Name"
                class="playlist-mods-dialog__customize-setting"
                :class="{
                  'playlist-mods-dialog__customize-setting--slider': setting.Type === 'number' && settingRange(entry.mod, setting),
                  'playlist-mods-dialog__customize-setting--number': setting.Type === 'number' && !settingRange(entry.mod, setting),
                  'playlist-mods-dialog__customize-setting--select': setting.Type === 'string',
                }"
              >
                <label v-if="!(setting.Type === 'number' && settingRange(entry.mod, setting))" v-tooltip.top="settingTooltip(setting)" class="playlist-mods-dialog__customize-label">
                  {{ setting.Label || setting.Name }}
                </label>
                <SliderInputNumber
                  v-if="setting.Type === 'number' && settingRange(entry.mod, setting)"
                  :model-value="settingValue(entry.mod, setting)"
                  :min="settingRange(entry.mod, setting).min"
                  :max="settingRange(entry.mod, setting).max"
                  :step="settingRange(entry.mod, setting).step"
                  :aria-label="setting.Label || setting.Name"
                  :stacked="true"
                  :setting-label="setting.Label || setting.Name"
                  :setting-label-tooltip="settingTooltip(setting)"
                  @update:model-value="updateSetting(entry.mod, setting, $event)"
                />
                <InputNumber
                  v-else-if="setting.Type === 'number'"
                  :model-value="settingValue(entry.mod, setting)"
                  :pt="settingMaxLength(entry.mod, setting) ? { pcInputText: { root: { maxlength: settingMaxLength(entry.mod, setting) } } } : undefined"
                  :use-grouping="false"
                  :aria-label="setting.Label || setting.Name"
                  @keydown="preventSettingOverflow($event, entry.mod, setting)"
                  @paste="trimPastedSetting($event, entry.mod, setting)"
                  @update:model-value="updateSetting(entry.mod, setting, $event)"
                />
                <ToggleSwitch
                  v-else-if="setting.Type === 'boolean'"
                  :model-value="settingValue(entry.mod, setting)"
                  class="app-solid-switch"
                  :aria-label="setting.Label || setting.Name"
                  @update:model-value="updateSetting(entry.mod, setting, $event)"
                />
                <Select
                  v-else
                  :model-value="settingValue(entry.mod, setting)"
                  :options="settingOptions(entry.mod, setting)"
                  option-label="label"
                  option-value="value"
                  :aria-label="setting.Label || setting.Name"
                  :pt="{ overlay: { class: 'playlist-mods-customize-select-overlay' } }"
                  @show="openCustomizeSelect"
                  @hide="closeCustomizeSelect"
                  @update:model-value="updateSetting(entry.mod, setting, $event)"
                />
              </div>
            </div>
            <div v-if="!customizeMods.length" class="playlist-mods-dialog__customize-empty">No customizable mods selected.</div>
          </div>
        </div>
      </Transition>
    </div>
    <div class="playlist-mods-dialog__categories" :class="{ 'playlist-mods-dialog__categories--dimmed': customizeVisible }" :style="categoriesStyle">
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
            v-tooltip.top="tooltip(mod, pickerKind === 'required')"
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
  gap: 0.3rem;
  margin-top: 0.45rem;
}
.playlist-mods-settings-dialog__preview-mod {
  display: inline-flex;
  height: var(--mod-preview-height, 1.35rem);
  flex: 0 0 auto;
}
.playlist-mods-settings-dialog__preview-mod :deep(svg) {
  display: block;
  width: 100%;
  height: 100%;
  overflow: visible;
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
  position: relative;
  z-index: 1;
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
.playlist-mods-dialog__customize-layer {
  position: relative;
  z-index: 5;
}
.playlist-mods-dialog__customize-bar {
  display: flex;
  min-height: 2.2rem;
  justify-content: flex-end;
  margin-bottom: 0.45rem;
}
.playlist-mods-dialog__customize-toggle {
  width: min(24rem, 100%);
  gap: 0.3rem;
  min-width: 0;
  justify-content: center;
  border: 1px solid var(--app-border) !important;
  border-radius: 0.4rem !important;
  background: var(--app-control) !important;
  color: var(--app-muted) !important;
  font-size: 0.68rem !important;
  font-weight: 800;
}
.playlist-mods-dialog__customize-toggle :deep(svg) {
  transition: transform 180ms ease;
}
.playlist-mods-dialog__customize-toggle--open :deep(svg) {
  transform: rotate(180deg);
}
.playlist-mods-dialog__customize-toggle--open {
  border-color: var(--app-primary) !important;
  background: var(--app-primary) !important;
  color: var(--app-bg) !important;
}
.playlist-mods-dialog__customize-toggle:disabled {
  cursor: not-allowed;
  opacity: 0.45;
}
.playlist-mods-dialog__customize-panel {
  position: relative;
  z-index: 1;
  display: flex;
  width: 100%;
  max-height: min(32rem, 65vh);
  flex-direction: column;
  gap: 0.8rem;
  padding: 0.75rem;
  overflow-y: auto;
  border: 1px solid var(--app-border);
  border-radius: 0.55rem;
  background: var(--app-surface-raised);
  box-shadow: 0 0.8rem 2rem rgba(0, 0, 0, 0.35);
  scrollbar-width: thin;
}
.playlist-mods-dialog__customize-zone {
  position: absolute;
  top: calc(100% + 0.15rem);
  right: 0;
  z-index: 6;
  width: min(24rem, calc(50% + 0.65rem));
  box-sizing: border-box;
  padding: 0;
  pointer-events: auto;
}
.customize-panel-enter-active,
.customize-panel-leave-active {
  transform-origin: top center;
  transition:
    opacity 180ms ease,
    transform 180ms ease;
}
.customize-panel-enter-from,
.customize-panel-leave-to {
  opacity: 0;
  transform: scaleY(0);
}
.playlist-mods-dialog :deep(.p-dialog-content) {
  position: relative;
}
.playlist-mods-dialog__customize-mod + .playlist-mods-dialog__customize-mod {
  padding-top: 0.8rem;
  border-top: 1px solid var(--app-border);
}
.playlist-mods-dialog__customize-mod-header {
  display: flex;
  align-items: center;
  gap: 0.45rem;
  color: var(--app-text);
  font-size: 0.78rem;
}
.playlist-mods-dialog__customize-icon {
  display: inline-flex;
  width: 2rem;
  height: 1.4rem;
  flex: 0 0 auto;
}
.playlist-mods-dialog__customize-icon :deep(svg) {
  display: block;
  width: 100%;
  height: 100%;
}
.playlist-mods-dialog__customize-setting {
  display: flex;
  align-items: center;
  gap: 0.6rem;
  margin-top: 0.55rem;
}
.playlist-mods-dialog__customize-setting--slider {
  align-items: stretch;
  flex-direction: column;
  gap: 0.35rem;
}
.playlist-mods-dialog__customize-setting--number {
  align-items: stretch;
  flex-direction: column;
  gap: 0.35rem;
}
.playlist-mods-dialog__customize-setting--select {
  align-items: stretch;
  flex-direction: column;
  gap: 0.35rem;
}
.playlist-mods-dialog__customize-label {
  min-width: 9rem;
  color: var(--app-muted);
  cursor: help;
  font-size: 0.66rem;
  font-weight: 700;
}
.playlist-mods-dialog__customize-setting :deep(.slider-input-number) {
  flex: 1;
}
.playlist-mods-dialog__customize-setting :deep(.p-inputnumber-input),
.playlist-mods-dialog__customize-setting :deep(.p-inputtext) {
  min-height: 1.8rem;
  width: 7rem;
  padding: 0.28rem 0.55rem;
  border: 1px solid var(--app-border) !important;
  border-radius: 0.6rem !important;
  background: var(--app-control) !important;
  color: var(--app-text) !important;
  box-shadow: none !important;
  font-size: 0.68rem;
}
.playlist-mods-dialog__customize-setting--number :deep(.p-inputnumber),
.playlist-mods-dialog__customize-setting--number :deep(.p-inputnumber-input) {
  width: 100%;
}
.playlist-mods-dialog__customize-setting :deep(.p-inputnumber-input:hover),
.playlist-mods-dialog__customize-setting :deep(.p-inputtext:hover) {
  border-color: var(--app-border-strong) !important;
}
.playlist-mods-dialog__customize-setting :deep(.p-inputnumber-input:focus),
.playlist-mods-dialog__customize-setting :deep(.p-inputtext:focus) {
  border-color: var(--app-primary-bright) !important;
  box-shadow: 0 0 0 0.15rem rgba(var(--app-primary-rgb), 0.16) !important;
}
.playlist-mods-dialog__customize-setting :deep(.p-select) {
  min-height: 1.8rem;
  min-width: 7rem;
  border: 1px solid var(--app-border) !important;
  border-radius: 0.4rem !important;
  background: var(--app-surface-hover) !important;
  color: var(--app-text) !important;
  box-shadow: none !important;
  font-size: 0.68rem;
}
.playlist-mods-dialog__customize-setting :deep(.p-select:hover),
.playlist-mods-dialog__customize-setting :deep(.p-select.p-focus) {
  border-color: var(--app-primary-bright) !important;
  box-shadow: 0 0 0 0.15rem rgba(var(--app-primary-rgb), 0.16) !important;
}
.playlist-mods-dialog__customize-setting :deep(.p-select-label) {
  padding: 0.28rem 0.55rem;
  color: var(--app-text) !important;
}
.playlist-mods-dialog__customize-setting :deep(.p-select-dropdown) {
  width: 1.8rem;
  color: var(--app-muted) !important;
}
.playlist-mods-dialog__customize-setting--select :deep(.p-select),
.playlist-mods-dialog__customize-setting--select :deep(.p-select-label) {
  width: 100%;
}
:global(.playlist-mods-customize-select-overlay) {
  border: 1px solid var(--app-border) !important;
  border-radius: 0.6rem !important;
  background: var(--app-surface-raised) !important;
  box-shadow: 0 0.8rem 2rem rgba(0, 0, 0, 0.35) !important;
  color: var(--app-text) !important;
}
:global(.playlist-mods-customize-select-overlay .p-select-list) {
  padding: 0.3rem !important;
}
:global(.playlist-mods-customize-select-overlay .p-select-option) {
  min-height: 1.8rem;
  border-radius: 0.4rem !important;
  color: var(--app-text) !important;
  font-size: 0.68rem;
}
:global(.playlist-mods-customize-select-overlay .p-select-option:hover),
:global(.playlist-mods-customize-select-overlay .p-select-option.p-focus),
:global(.playlist-mods-customize-select-overlay .p-select-option.p-select-option-selected) {
  background: rgba(var(--app-primary-rgb), 0.12) !important;
  color: var(--app-primary-bright) !important;
}
.playlist-mods-dialog__customize-setting :deep(.p-slider-range) {
  background: var(--app-primary) !important;
}
.playlist-mods-dialog__customize-setting :deep(.p-toggleswitch) {
  margin-left: auto;
}
.playlist-mods-dialog__customize-empty {
  padding: 1rem;
  color: var(--app-muted);
  font-size: 0.7rem;
  text-align: center;
}
.playlist-mods-dialog__categories--dimmed {
  opacity: 0.28;
  transition: opacity 180ms ease;
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
