<script setup>
import { computed, nextTick, ref } from "vue";
import InputNumber from "primevue/inputnumber";
import Slider from "primevue/slider";

const props = defineProps({
  modelValue: { type: Number, default: 0 },
  min: { type: Number, default: 0 },
  max: { type: Number, default: 100 },
  step: { type: Number, default: 1 },
  disabled: { type: Boolean, default: false },
  inputWidth: { type: String, default: "4.2rem" },
  ariaLabel: { type: String, default: "Value" },
  stacked: { type: Boolean, default: false },
  settingLabel: { type: String, default: "" },
  settingLabelTooltip: { type: [String, Object], default: "" },
});
const emit = defineEmits(["update:modelValue"]);

const isStacked = computed(() => props.stacked || !!props.settingLabel);
const editing = ref(false);
const draftValue = ref(props.modelValue);
const inputRef = ref(null);
const stepPrecision = computed(() => {
  const value = String(props.step);
  if (value.includes("e-")) return Number(value.split("e-")[1]);
  return value.split(".")[1]?.length || 0;
});

function roundToPrecision(value) {
  return Number(Number(value).toFixed(stepPrecision.value));
}

function clamp(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return props.modelValue;
  const stepped = Math.round((n - props.min) / props.step) * props.step + props.min;
  return roundToPrecision(Math.min(props.max, Math.max(props.min, stepped)));
}
function update(value) {
  const next = clamp(value);
  if (next !== props.modelValue) emit("update:modelValue", next);
}
const displayValue = computed(() => String(roundToPrecision(clamp(props.modelValue))));
function startEditing() {
  if (props.disabled || editing.value) return;
  draftValue.value = props.modelValue;
  editing.value = true;
  nextTick(() => {
    const input = inputRef.value?.$el?.querySelector("input");
    input?.focus();
    input?.select();
  });
}
function updateDraft(value) {
  if (value !== null && Number.isFinite(Number(value))) draftValue.value = Number(value);
}
function commitEditing() {
  if (!editing.value) return;
  update(draftValue.value);
  editing.value = false;
}
function cancelEditing() {
  editing.value = false;
  draftValue.value = props.modelValue;
}
</script>

<template>
  <div class="slider-input-number" :class="{ 'slider-input-number--stacked': isStacked }">
    <span v-if="isStacked" v-tooltip.top="settingLabelTooltip" class="slider-input-number__label">{{ settingLabel }}</span>
    <InputNumber
      v-if="editing"
      ref="inputRef"
      :model-value="draftValue"
      :min="min"
      :max="max"
      :step="step"
      :disabled="disabled"
      :use-grouping="false"
      :input-style="{ width: inputWidth }"
      :aria-label="ariaLabel"
      class="slider-input-number__input"
      @update:model-value="updateDraft"
      @blur="commitEditing"
      @keydown.enter="commitEditing"
      @keydown.escape="cancelEditing"
    />
    <button v-else type="button" class="slider-input-number__value" :disabled="disabled" :aria-label="`Edit ${ariaLabel}`" @click="startEditing" @dblclick="startEditing">
      {{ displayValue }}
    </button>
    <Slider :model-value="modelValue" :min="min" :max="max" :step="step" :disabled="disabled" :aria-label="ariaLabel" class="slider-input-number__slider" @update:model-value="update" />
  </div>
</template>

<style scoped>
/* inline: [slider] [input] */
.slider-input-number {
  display: flex;
  align-items: center;
  gap: 0.65rem;
  width: 100%;
}
.slider-input-number__slider {
  flex: 1 1 auto;
}
.slider-input-number__input {
  flex: 0 0 auto;
  order: 1;
}
.slider-input-number__value {
  flex: 0 0 auto;
  order: 1;
  padding: 0.2rem 0.35rem;
  border: 0;
  border-radius: 0.35rem;
  background: rgba(var(--app-primary-rgb), 0.14);
  color: var(--app-primary-bright);
  cursor: text;
  font: inherit;
  font-size: 0.72rem;
  font-weight: 700;
  line-height: 1.2;
  text-align: center;
}
.slider-input-number__value:hover:not(:disabled) {
  background: rgba(var(--app-primary-rgb), 0.22);
}

.slider-input-number :deep(.p-inputnumber) {
  display: inline-flex;
  width: auto;
}
.slider-input-number :deep(.p-inputnumber-input) {
  min-height: 1.8rem;
  padding: 0.28rem 0.55rem;
  border: 1px solid var(--app-border) !important;
  border-radius: 0.4rem !important;
  background: var(--app-control) !important;
  color: var(--app-text) !important;
  box-shadow: none !important;
  font-size: 0.68rem;
  text-align: left;
}
.slider-input-number :deep(.p-inputnumber-input:hover) {
  border-color: var(--app-border-strong) !important;
}
.slider-input-number :deep(.p-inputnumber-input:focus) {
  border-color: var(--app-primary-bright) !important;
  box-shadow: 0 0 0 0.15rem rgba(var(--app-primary-rgb), 0.16) !important;
}

.slider-input-number :deep(.p-slider) {
  position: relative;
  height: 0.35rem !important;
  border-radius: 999px !important;
  background: var(--app-surface-hover) !important;
}
.slider-input-number :deep(.p-slider-range) {
  border-radius: 999px !important;
  background: var(--app-primary) !important;
  transition: width 90ms ease-out;
}
.slider-input-number :deep(.p-slider-handle) {
  width: 1rem !important;
  height: 1rem !important;
  border: 2px solid var(--app-primary-bright) !important;
  background: var(--app-primary) !important;
  box-shadow: none !important;
  transition: left 90ms ease-out;
}
.slider-input-number :deep(.p-slider-handle::before) {
  width: 0 !important;
  height: 0 !important;
  background: transparent !important;
  box-shadow: none !important;
}
.slider-input-number :deep(.p-slider-handle:focus-visible) {
  outline: 2px solid rgba(var(--app-primary-rgb), 0.35);
  outline-offset: 2px;
}

/* stacked: label ........ [input]
            [------ slider ------] */
.slider-input-number--stacked {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  grid-template-areas:
    "label  input"
    "slider slider";
  align-items: center;
  gap: 0.4rem 0.65rem;
}
.slider-input-number--stacked .slider-input-number__label {
  grid-area: label;
}
.slider-input-number--stacked .slider-input-number__input {
  grid-area: input;
  order: 0;
}
.slider-input-number--stacked .slider-input-number__value {
  grid-area: input;
  order: 0;
}
.slider-input-number--stacked .slider-input-number__slider {
  grid-area: slider;
}
.slider-input-number--stacked :deep(.p-slider) {
  width: calc(100% - 0.8rem) !important;
  margin-inline: 0.4rem;
}
.slider-input-number--stacked :deep(.p-slider-handle) {
  width: 0.8rem !important;
  height: 0.8rem !important;
  border-width: 2px !important;
}

.slider-input-number__label {
  min-width: 0;
  color: var(--app-muted);
  cursor: help;
  font-size: 0.66rem;
  font-weight: 700;
}
</style>
