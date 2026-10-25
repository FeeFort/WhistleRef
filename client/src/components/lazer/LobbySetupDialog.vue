<script setup>
import { computed, ref, watch } from "vue";
import Button from "primevue/button";
import Dialog from "primevue/dialog";
import SelectButton from "primevue/selectbutton";
import Slider from "primevue/slider";

const props = defineProps({
  visible: { type: Boolean, default: false },
  disabled: { type: Boolean, default: false },
  loading: { type: Boolean, default: false },
  initialQueueMode: { type: String, default: "host_only" },
  initialMatchType: { type: String, default: "team_versus" },
  initialMaxParticipants: { type: Number, default: null },
});
const emit = defineEmits(["update:visible", "send"]);
const queueMode = ref("host_only");
const matchType = ref("team_versus");
const maxParticipants = ref(16);
const maxParticipantsLabel = computed(() => (maxParticipants.value >= 17 ? "∞" : String(maxParticipants.value)));
const gameModeOptions = [
  { label: "HeadToHead", value: "head_to_head" },
  { label: "Team VS", value: "team_versus" },
];
const queueModeOptions = [
  { label: "Host only", value: "host_only" },
  { label: "All players", value: "all_players" },
  { label: "All players (round robin)", value: "all_players_round_robin" },
];
function reset() {
  queueMode.value = ["host_only", "all_players", "all_players_round_robin"].includes(props.initialQueueMode) ? props.initialQueueMode : "host_only";
  matchType.value = ["head_to_head", "team_versus"].includes(props.initialMatchType) ? props.initialMatchType : "team_versus";
  const initialMaxParticipants = Number(props.initialMaxParticipants);
  maxParticipants.value = !Number.isFinite(initialMaxParticipants) || initialMaxParticipants <= 0 ? 17 : Math.min(17, Math.max(2, initialMaxParticipants));
}
function close() {
  emit("update:visible", false);
}
function send() {
  if (props.disabled || props.loading) return;
  emit("send", {
    queue_mode: queueMode.value,
    match_type: matchType.value,
    max_participants: maxParticipants.value >= 17 ? 0 : maxParticipants.value,
  });
}
watch(
  () => props.visible,
  (visible) => {
    if (visible) reset();
  },
);
</script>

<template>
  <Dialog
    :visible="visible"
    modal
    :dismissable-mask="!loading"
    :closable="!disabled && !loading"
    class="lobby-setup-dialog"
    :pt="{ mask: { class: 'app-dialog-mask' } }"
    :style="{ width: '32rem' }"
    header="Configure lobby"
    @update:visible="(value) => (value ? null : close())"
  >
    <div class="lobby-setup-dialog__body">
      <label class="lobby-setup-dialog__field">
        <span>Queue mode</span>
        <SelectButton v-model="queueMode" :options="queueModeOptions" optionLabel="label" optionValue="value" :allowEmpty="false" :disabled="disabled || loading" />
      </label>
      <label class="lobby-setup-dialog__field">
        <span>Game mode</span>
        <SelectButton v-model="matchType" :options="gameModeOptions" optionLabel="label" optionValue="value" :allowEmpty="false" :disabled="disabled || loading" />
      </label>
      <div class="lobby-setup-dialog__field">
        <div class="lobby-setup-dialog__slider-label">
          <span>Max participants</span><strong>{{ maxParticipantsLabel }}</strong>
        </div>
        <div class="lobby-setup-dialog__slider-wrap">
          <Slider v-model="maxParticipants" :min="2" :max="17" :step="1" :disabled="disabled || loading" />
        </div>
        <div class="lobby-setup-dialog__slider-range"><span>2</span><span>∞</span></div>
      </div>
    </div>
    <template #footer>
      <Button label="Cancel" text severity="secondary" class="lobby-setup-dialog__cancel" :disabled="disabled || loading" @click="close" />
      <Button label="Apply" class="lobby-setup-dialog__send" :loading="loading" :disabled="disabled || loading" @click="send" />
    </template>
  </Dialog>
</template>

<style scoped>
.lobby-setup-dialog__body {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}
.lobby-setup-dialog__intro {
  display: flex;
  align-items: flex-start;
  gap: 0.7rem;
}
.lobby-setup-dialog__icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 2.25rem;
  height: 2.25rem;
  flex: 0 0 auto;
  border: 1px solid rgba(var(--app-primary-rgb), 0.25);
  border-radius: 0.65rem;
  background: rgba(var(--app-primary-rgb), 0.12);
  color: var(--app-primary-bright);
}
.lobby-setup-dialog__intro > div:last-child {
  display: flex;
  flex-direction: column;
  gap: 0.15rem;
}
.lobby-setup-dialog__intro strong {
  color: var(--app-text);
  font-size: 0.86rem;
}
.lobby-setup-dialog__intro span {
  color: var(--app-muted);
  font-size: 0.74rem;
}
.lobby-setup-dialog__field {
  display: flex;
  flex-direction: column;
  gap: 0.45rem;
}
.lobby-setup-dialog__field > span,
.lobby-setup-dialog__slider-label span {
  color: var(--app-muted);
  font-size: 0.72rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.03em;
}
.lobby-setup-dialog__field :deep(.p-selectbutton) {
  display: flex;
  width: 100%;
}
.lobby-setup-dialog__field :deep(.p-selectbutton .p-togglebutton) {
  flex: 1 1 0;
  min-width: 0;
  padding: 0.48rem 0.35rem;
  font-size: 0.7rem;
}
.lobby-setup-dialog__slider-label {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.lobby-setup-dialog__slider-label strong {
  min-width: 2rem;
  padding: 0.12rem 0.45rem;
  border-radius: 0.35rem;
  background: rgba(var(--app-primary-rgb), 0.14);
  color: var(--app-primary-bright);
  font-size: 0.78rem;
  text-align: center;
}
.lobby-setup-dialog__slider-wrap {
  position: relative;
  padding: 0.5rem 0;
}
.lobby-setup-dialog__slider-wrap :deep(.p-slider) {
  position: relative;
  z-index: 1;
  height: 0.35rem;
  border-radius: 999px;
  background: var(--app-surface-hover);
}
.lobby-setup-dialog__slider-wrap :deep(.p-slider-range) {
  background: var(--app-primary);
}
.lobby-setup-dialog__slider-wrap :deep(.p-slider-handle) {
  width: 1.05rem;
  height: 1.05rem;
  border: 3px solid var(--app-primary-bright);
  background: var(--app-surface-raised);
  box-shadow: 0 0 0.7rem rgba(var(--app-primary-rgb), 0.55);
}
.lobby-setup-dialog__ticks {
  position: absolute;
  z-index: 0;
  top: 0.53rem;
  right: 0;
  bottom: 0.53rem;
  left: 0;
  display: flex;
  justify-content: space-between;
  pointer-events: none;
}
.lobby-setup-dialog__ticks span {
  width: 1px;
  height: 0.8rem;
  background: rgba(3, 5, 10, 0.8);
}
.lobby-setup-dialog__slider-range {
  display: flex;
  justify-content: space-between;
  color: var(--app-muted);
  font-size: 0.68rem;
}
</style>
