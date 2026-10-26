<script setup>
import { computed } from "vue";
import SvgMarkup from "./SvgMarkup.vue";
import modsMetadata from "../assets/mods/mods.json";
import settingsMetadata from "../assets/mods/settings.json";
import modHexRaw from "../assets/mods/mod-icon.svg?raw";
import moreModsRaw from "../assets/mods/more-mods.svg?raw";
import modCustomizedRaw from "../assets/mods/mod-customized.svg?raw";
import modExtenderRaw from "../assets/mods/mod-extender.svg?raw";

const props = defineProps({
  mods: { type: Array, default: () => [] },
  rulesetId: { type: [Number, String], default: 0 },
  max: { type: Number, default: 0 },
  beatmap: { type: Object, default: null },
  showSettings: { type: Boolean, default: false },
});

const modIconSources = import.meta.glob("../assets/mods/*/*.svg", { eager: true, query: "?raw", import: "default" });
const categoryColors = Object.freeze({
  DifficultyReduction: ["#b3ff66", "#3c591e"],
  DifficultyIncrease: ["#ff6666", "#591e1e"],
  Automation: ["#66ccff", "#1e4659"],
  Conversion: ["#8c66ff", "#2d1e59"],
  Fun: ["#ff66ab", "#591e39"],
  System: ["#ffcc22", "#594605"],
});

function svgBody(raw) {
  return String(raw || "")
    .replace(/<defs>[\s\S]*?<\/defs>/g, "")
    .replace(/\sclip-path="[^"]*"/g, "")
    .replace(/^[\s\S]*?<svg[^>]*>/, "")
    .replace(/<\/svg>\s*$/, "");
}

const hexBody = svgBody(modHexRaw);
const customizedBody = svgBody(modCustomizedRaw);
const extenderBody = svgBody(modExtenderRaw);
const customizedBox = viewBoxOf(modCustomizedRaw);
const extenderBox = viewBoxOf(modExtenderRaw);
const SPEED_MODS = new Set(["DT", "NC", "HT", "DC"]);
const normalizedMods = computed(() =>
  props.mods
    .map((mod) => ({
      acronym: String(typeof mod === "string" ? mod : mod?.acronym || "")
        .trim()
        .toUpperCase(),
      settings: typeof mod === "object" && mod?.settings && typeof mod.settings === "object" ? mod.settings : {},
    }))
    .filter((mod) => mod.acronym)
    .filter((mod, index, values) => values.findIndex((candidate) => candidate.acronym === mod.acronym) === index)
    .sort((left, right) => {
      const leftIndex = rulesetMods.value.findIndex((candidate) => String(candidate.Acronym).toUpperCase() === left.acronym);
      const rightIndex = rulesetMods.value.findIndex((candidate) => String(candidate.Acronym).toUpperCase() === right.acronym);
      return (leftIndex < 0 ? Number.MAX_SAFE_INTEGER : leftIndex) - (rightIndex < 0 ? Number.MAX_SAFE_INTEGER : rightIndex);
    }),
);
const visibleMods = computed(() => (props.max > 0 ? normalizedMods.value.slice(0, props.max) : normalizedMods.value));
const hiddenMods = computed(() => (props.max > 0 ? normalizedMods.value.slice(props.max) : []));
const rulesetMods = computed(() => modsMetadata.find((entry) => Number(entry.RulesetID) === Number(props.rulesetId))?.Mods || []);

function viewBoxOf(raw) {
  const match = String(raw || "").match(/viewBox="\s*(-?[\d.]+)[\s,]+(-?[\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)\s*"/);
  return match ? { x: Number(match[1]), y: Number(match[2]), w: Number(match[3]), h: Number(match[4]) } : { x: 0, y: 0, w: 24, h: 24 };
}

function modInfo(acronym) {
  return rulesetMods.value.find((mod) => String(mod.Acronym).toUpperCase() === acronym) || null;
}

function settingConfig(mod, setting) {
  return settingsMetadata[String(mod.Acronym).toUpperCase()]?.[setting.Name] || null;
}
function defaultSettingValue(mod, setting) {
  if (String(mod.Acronym).toUpperCase() === "DA" && setting.Type === "number") {
    const fields = {
      circle_size: ["circleSize", "circle_size", "cs"],
      approach_rate: ["approachRate", "approach_rate", "ar"],
      drain_rate: ["drainRate", "drain_rate", "drain", "hp"],
      overall_difficulty: ["overallDifficulty", "overall_difficulty", "od", "accuracy"],
    };
    const value = fields[setting.Name]?.map((field) => props.beatmap?.[field]).find((candidate) => candidate !== undefined && candidate !== null);
    if (Number.isFinite(Number(value))) return Number(value);
  }
  const config = settingConfig(mod, setting);
  return config?.default ?? config?.options?.[0]?.value ?? (setting.Type === "boolean" ? false : 0);
}
function customizedSettings(mod, settings) {
  return (Array.isArray(mod.Settings) ? mod.Settings : []).filter((setting) => {
    const defaultValue = defaultSettingValue(mod, setting);
    const value = settings?.[setting.Name] === undefined ? defaultValue : settings[setting.Name];
    return setting.Type === "number" ? Number(value) !== Number(defaultValue) : value !== defaultValue;
  });
}
function formatSettingValue(mod, setting, settings) {
  const value = settings?.[setting.Name] === undefined ? defaultSettingValue(mod, setting) : settings[setting.Name];
  if (setting.Type === "boolean") return value ? "On" : "Off";
  if (setting.Type === "string") return settingConfig(mod, setting)?.options?.find((option) => option.value === value)?.label || String(value ?? "");
  const number = Number(value);
  if (!Number.isFinite(number)) return String(value ?? "");
  if (SPEED_MODS.has(String(mod.Acronym).toUpperCase()) && setting.Name === "speed_change") return `${number.toFixed(2)}x`;
  return String(number);
}
function modSettingsTooltip(mod, settings) {
  const rows = customizedSettings(mod, settings)
    .map((setting) => `<div class="app-tooltip__setting-row"><span>${escapeHtml(setting.Label || setting.Name)}</span><strong>${escapeHtml(formatSettingValue(mod, setting, settings))}</strong></div>`)
    .join("");
  return {
    html: `<div class="app-tooltip__mod-settings${rows ? "" : " app-tooltip__mod-settings--title-only"}"><strong class="app-tooltip__mod-title">${escapeHtml(mod.Name)}</strong>${rows}</div>`,
    showDelay: 300,
    dynamic: true,
  };
}

function extenderText(entry, mod) {
  if (!props.showSettings || !SPEED_MODS.has(entry.acronym) || !mod) return "";
  const setting = (Array.isArray(mod.Settings) ? mod.Settings : []).find((candidate) => candidate.Name === "speed_change");
  if (!setting || !customizedSettings(mod, entry.settings).some((candidate) => candidate.Name === setting.Name)) return "";
  const value = Number(entry.settings.speed_change);
  return Number.isFinite(value) ? `${value.toFixed(2)}x` : "";
}

function modIconSvg(entry) {
  const acronym = entry.acronym;
  const mod = modInfo(acronym);
  if (!mod) return "";
  const folder = String(mod.Type || "")
    .replace(/([a-z])([A-Z])/g, "$1-$2")
    .toLowerCase();
  const slug = String(mod.Name || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  const raw = modIconSources[`../assets/mods/${folder}/${slug}.svg`];
  const colors = categoryColors[mod.Type];
  if (!raw || !colors) return "";
  const hex = hexBody.replace(/fill="white"/g, `fill="${colors[0]}"`);
  const glyph = svgBody(raw).replace(/(fill|stroke)="white"/g, `$1="${colors[1]}"`);
  let front = "";
  let behind = "";
  let viewWidth = 100;
  const speedText = extenderText(entry, mod);
  if (props.showSettings && customizedSettings(mod, entry.settings).length) {
    const scale = 80 / Math.max(customizedBox.w, customizedBox.h);
    const indicator = customizedBody
      .replace(/var\(\s*--type-fg-colour[^)]*\)/g, colors[1])
      .replace(/var\(\s*--type-bg-colour[^)]*\)/g, colors[0])
      .replace(/class="indicator-background"/g, `fill="${colors[1]}"`)
      .replace(/class="indicator-foreground"/g, `fill="${colors[0]}"`);
    front += `<g transform="translate(25 0) scale(${scale}) translate(${-customizedBox.x} ${-customizedBox.y})">${indicator}</g>`;
  }
  if (speedText) {
    const scaleY = 70 / extenderBox.h;
    const scaleX = Math.max(scaleY, 1);
    const shape = extenderBody.replace(/(fill|stroke)="(?:white|#fff|#ffffff)"/gi, `$1="${colors[1]}"`);
    behind = `<g transform="translate(62 7) scale(${scaleX} ${scaleY}) translate(${-extenderBox.x} ${-extenderBox.y})">${shape}</g>`;
    front += `<text x="153" y="42" dy=".35em" fill="${colors[0]}" font-family="Torus, Nunito, sans-serif" font-size="28" font-weight="700" text-anchor="middle">${speedText}</text>`;
    viewWidth = 207;
  }
  return `<svg viewBox="10 7 ${viewWidth} 70" fill="none" aria-hidden="true">${behind}<g transform="translate(10 7)">${hex}</g><g transform="translate(60 42) scale(.85) translate(-60 -42)">${glyph}</g>${front}</svg>`;
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

function moreModsTooltip() {
  const rows = hiddenMods.value
    .map((entry) => {
      const info = modInfo(entry.acronym);
      const icon = modIconSvg(entry);
      return `<span class="app-tooltip__more-mod-row"><span class="app-tooltip__more-mod-icon">${icon || escapeHtml(entry.acronym)}</span><span>${escapeHtml(info?.Name || entry.acronym)}</span></span>`;
    })
    .join("");
  return { html: `<div class="app-tooltip__more-mods">${rows}</div>`, interactive: true };
}
</script>

<template>
  <span v-if="normalizedMods.length" class="mod-icon-list">
    <span
      v-for="mod in visibleMods"
      :key="mod.acronym"
      v-tooltip.top="showSettings ? modSettingsTooltip(modInfo(mod.acronym), mod.settings) : modInfo(mod.acronym)?.Name || mod.acronym"
      class="mod-icon-list__mod"
      :class="{ 'mod-icon-list__mod--extended': Boolean(extenderText(mod, modInfo(mod.acronym))) }"
      :aria-label="modInfo(mod.acronym)?.Name || mod.acronym"
    >
      <SvgMarkup v-if="modIconSvg(mod)" :svg="modIconSvg(mod)" />
      <span v-else class="mod-icon-list__fallback">{{ mod.acronym }}</span>
    </span>
    <span v-if="hiddenMods.length" v-tooltip.top="moreModsTooltip()" class="mod-icon-list__mod mod-icon-list__mod--more" aria-label="More mods">
      <SvgMarkup :svg="moreModsIconSvg()" />
    </span>
  </span>
</template>

<style scoped>
.mod-icon-list {
  display: inline-flex;
  align-items: center;
  gap: 0.2rem;
}
.mod-icon-list__mod {
  display: inline-flex;
  width: 1.35rem;
  height: 0.95rem;
  align-items: center;
  justify-content: center;
  flex: 0 0 auto;
}
.mod-icon-list__mod--extended {
  width: 2.8rem;
}
.mod-icon-list__mod :deep(svg) {
  display: block;
  width: 100%;
  height: 100%;
}
.mod-icon-list__fallback {
  color: var(--app-text);
  font-size: 0.58rem;
  font-weight: 800;
}
</style>
