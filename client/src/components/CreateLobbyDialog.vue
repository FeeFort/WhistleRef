<script setup>
import { computed, ref, watch } from "vue";
import Button from "primevue/button";
import Dialog from "primevue/dialog";
import InputNumber from "primevue/inputnumber";
import InputText from "primevue/inputtext";
import Select from "primevue/select";
import SelectButton from "primevue/selectbutton";
import Slider from "primevue/slider";
import ToggleSwitch from "primevue/toggleswitch";
import { Info } from "@lucide/vue";

const props = defineProps({
  visible: { type: Boolean, default: false },
});
const emit = defineEmits(["update:visible", "create"]);

const lobbyModes = [
  { label: "Stable", value: "stable" },
  { label: "Lazer", value: "lazer" },
];
const rulesetOptions = [
  { label: "osu!", value: 0 },
  { label: "osu!taiko", value: 1 },
  { label: "osu!catch", value: 2 },
  { label: "osu!mania", value: 3 },
];
const mode = ref("stable");
const acronym = ref("");
const teamRed = ref("");
const teamBlue = ref("");
const qualifiersLobby = ref("");
const qualifiers = ref(false);
const bestOf = ref(13);
const includeParentheses = ref(true);
const rulesetId = ref(0);
const matchType = ref("team_versus");
const queueMode = ref("host_only");
const beatmapId = ref(null);
const maxParticipants = ref(16);

const isLazer = computed(() => mode.value === "lazer");
const maxParticipantsLabel = computed(() => (maxParticipants.value >= 17 ? "∞" : String(maxParticipants.value)));
const matchTypeOptions = [
  { label: "HeadToHead", value: "head_to_head" },
  { label: "Team VS", value: "team_versus" },
];
const queueModeOptions = [
  { label: "Host only", value: "host_only" },
  { label: "All players", value: "all_players" },
  { label: "All players (round robin)", value: "all_players_round_robin" },
];

function stripOuterParentheses(value) {
  const text = String(value || "").trim();
  return text.startsWith("(") && text.endsWith(")") ? text.slice(1, -1).trim() : text;
}

function parseLobbyName(value) {
  const text = String(value || "")
    .trim()
    .replace(/^!mp\s+make\s+/i, "");
  const separatorIndex = text.indexOf(":");
  if (separatorIndex <= 0) return null;

  const name = text.slice(0, separatorIndex).trim();
  const teams = text
    .slice(separatorIndex + 1)
    .trim()
    .match(/^(.+?)\s+vs\s+(.+)$/i);
  if (!name || !teams) return null;

  const red = stripOuterParentheses(teams[1]);
  const blue = stripOuterParentheses(teams[2]);
  return red && blue ? { name, red, blue } : null;
}

function handleLobbyPaste(event) {
  const parsed = parseLobbyName(event.clipboardData?.getData("text"));
  if (!parsed) return;

  event.preventDefault();
  acronym.value = parsed.name;
  teamRed.value = parsed.red;
  teamBlue.value = parsed.blue;
  qualifiers.value = false;
}

const command = computed(() => {
  const name = acronym.value.trim() || "ACRONYM";
  const wrap = (value) => (includeParentheses.value ? `(${value})` : value);

  if (qualifiers.value) {
    const lobby = qualifiersLobby.value.trim() || "Lobby ID";
    return `!mp make ${name}: ${wrap("Qualifiers")} vs ${wrap(`Lobby ${lobby}`)}`;
  }

  const red = teamRed.value.trim() || "Team Red";
  const blue = teamBlue.value.trim() || "Team Blue";
  return `!mp make ${name}: ${wrap(red)} vs ${wrap(blue)}`;
});

const lobbyName = computed(() => command.value.replace(/^!mp\s+make\s+/i, ""));
const commonLobbyIsValid = computed(() => {
  if (!acronym.value.trim()) return false;
  if (qualifiers.value) return Boolean(qualifiersLobby.value.trim());
  return Boolean(teamRed.value.trim() && teamBlue.value.trim());
});

const isValid = computed(() => {
  if (isLazer.value) {
    return (
      commonLobbyIsValid.value && Number.isInteger(Number(beatmapId.value)) && Number(beatmapId.value) > 0 && Number.isInteger(Number(maxParticipants.value)) && Number(maxParticipants.value) >= 2
    );
  }
  return commonLobbyIsValid.value;
});

function close() {
  emit("update:visible", false);
}

function create() {
  if (!isValid.value) return;

  if (isLazer.value) {
    emit("create", {
      mode: "lazer",
      lazer: {
        ruleset_id: Number(rulesetId.value),
        beatmap_id: Number(beatmapId.value),
        name: lobbyName.value,
        match_type: matchType.value,
        queue_mode: queueMode.value,
        max_participants: maxParticipants.value >= 17 ? 0 : Number(maxParticipants.value),
      },
      lobby: {
        name: lobbyName.value,
        qualificationMode: qualifiers.value,
        teamRed: qualifiers.value ? "Qualifiers" : teamRed.value.trim(),
        teamBlue: qualifiers.value ? `Lobby ${qualifiersLobby.value.trim()}` : teamBlue.value.trim(),
        bestOf: bestOf.value,
      },
    });
    close();
    return;
  }

  const teamRedValue = qualifiers.value ? "Qualifiers" : teamRed.value.trim();
  const teamBlueValue = qualifiers.value ? `Lobby ${qualifiersLobby.value.trim()}` : teamBlue.value.trim();
  emit("create", {
    mode: "stable",
    command: command.value,
    lobby: {
      name: lobbyName.value,
      qualifiers: qualifiers.value,
      qualificationMode: qualifiers.value,
      teamRed: teamRedValue,
      teamBlue: teamBlueValue,
      bestOf: bestOf.value,
    },
  });
  close();
}

function resetForm() {
  mode.value = "stable";
  acronym.value = "";
  teamRed.value = "";
  teamBlue.value = "";
  qualifiersLobby.value = "";
  qualifiers.value = false;
  bestOf.value = 13;
  includeParentheses.value = true;
  rulesetId.value = 0;
  matchType.value = "team_versus";
  queueMode.value = "host_only";
  beatmapId.value = null;
  maxParticipants.value = 16;
}

watch(
  () => props.visible,
  (value) => {
    if (value) resetForm();
  },
);
</script>

<template>
  <Dialog
    :visible="visible"
    modal
    dismissableMask
    class="create-lobby-dialog"
    :pt="{ mask: { class: 'app-dialog-mask' } }"
    header="Create lobby"
    :style="{ width: '32rem' }"
    @update:visible="emit('update:visible', $event)"
  >
    <div class="create-lobby-dialog__body">
      <div class="create-lobby-dialog__mode">
        <SelectButton v-model="mode" :options="lobbyModes" optionLabel="label" optionValue="value" :allowEmpty="false" aria-label="Lobby type" />
      </div>

      <div class="create-lobby-dialog__paste-note">
        <Info :size="15" class="create-lobby-dialog__paste-note-icon" />
        <div class="create-lobby-dialog__paste-note-content">
          <strong>Note</strong>
          <span>Paste a complete lobby name into any of the three fields and the acronym and team names will be filled automatically.</span>
        </div>
      </div>

      <label class="create-lobby-dialog__field">
        <span>Tournament acronym</span>
        <InputText v-model="acronym" placeholder="e.g. OPTC2" autofocus @paste="handleLobbyPaste" />
      </label>

      <label class="create-lobby-dialog__field">
        <span>Best of</span>
        <InputNumber v-model="bestOf" :min="1" :max="99" :use-grouping="false" inputId="create-lobby-best-of" />
      </label>

      <div class="create-lobby-dialog__toggle-row">
        <div>
          <strong>Qualifications</strong>
          <span>Use a qualifications lobby instead of two teams.</span>
        </div>
        <ToggleSwitch v-model="qualifiers" class="app-solid-switch" />
      </div>

      <template v-if="!qualifiers">
        <label class="create-lobby-dialog__field">
          <span>Red team name</span>
          <InputText v-model="teamRed" placeholder="e.g. Team Red" @paste="handleLobbyPaste" />
        </label>

        <label class="create-lobby-dialog__field">
          <span>Blue team name</span>
          <InputText v-model="teamBlue" placeholder="e.g. Team Blue" @paste="handleLobbyPaste" />
        </label>
      </template>

      <label v-else class="create-lobby-dialog__field">
        <span>Qualifiers lobby ID</span>
        <InputText v-model="qualifiersLobby" placeholder="e.g. 12345678" />
      </label>

      <template v-if="isLazer">
        <label class="create-lobby-dialog__field">
          <span>Ruleset</span>
          <Select
            v-model="rulesetId"
            :options="rulesetOptions"
            optionLabel="label"
            optionValue="value"
            inputId="create-lobby-ruleset"
            aria-label="Ruleset"
            :pt="{ overlay: { class: 'create-lobby-ruleset-overlay' } }"
          />
        </label>

        <label class="create-lobby-dialog__field">
          <span>Match type</span>
          <SelectButton v-model="matchType" :options="matchTypeOptions" optionLabel="label" optionValue="value" :allowEmpty="false" aria-label="Match type" />
        </label>

        <label class="create-lobby-dialog__field">
          <span>Queue mode</span>
          <SelectButton v-model="queueMode" :options="queueModeOptions" optionLabel="label" optionValue="value" :allowEmpty="false" aria-label="Queue mode" />
        </label>

        <label class="create-lobby-dialog__field">
          <span>Beatmap ID</span>
          <InputNumber v-model="beatmapId" :min="1" :use-grouping="false" inputId="create-lobby-beatmap" @input="({ value }) => (beatmapId = value)" />
        </label>

        <div class="create-lobby-dialog__field">
          <div class="create-lobby-dialog__slider-label">
            <span>Max participants</span><strong>{{ maxParticipantsLabel }}</strong>
          </div>
          <div class="create-lobby-dialog__slider-wrap">
            <Slider v-model="maxParticipants" :min="2" :max="17" :step="1" aria-label="Max participants" />
          </div>
          <div class="create-lobby-dialog__slider-range"><span>2</span><span>∞</span></div>
        </div>
      </template>

      <div class="create-lobby-dialog__toggle-row">
        <div>
          <strong>Include names in parentheses</strong>
          <span>Wrap teams and lobby labels in parentheses.</span>
        </div>
        <ToggleSwitch v-model="includeParentheses" class="app-solid-switch" />
      </div>

      <div class="create-lobby-dialog__preview">
        <span>Lobby preview</span>
        <code>{{ lobbyName }}</code>
      </div>
    </div>

    <template #footer>
      <Button label="Cancel" text severity="secondary" @click="close" />
      <Button label="Create" :disabled="!isValid" @click="create" />
    </template>
  </Dialog>
</template>

<style scoped>
.create-lobby-dialog__body {
  display: flex;
  flex-direction: column;
  gap: 0.9rem;
}

.create-lobby-dialog__toggle-row > div {
  display: flex;
  flex-direction: column;
  gap: 0.18rem;
}

.create-lobby-dialog__toggle-row strong {
  color: var(--app-text);
  font-size: 0.78rem;
}

.create-lobby-dialog__toggle-row span {
  color: var(--app-muted);
  font-size: 0.7rem;
  line-height: 1.4;
}

.create-lobby-dialog__mode {
  width: 100%;
}

.create-lobby-dialog__mode :deep(.p-selectbutton) {
  display: flex;
  width: 100%;
}

.create-lobby-dialog__mode :deep(.p-selectbutton .p-togglebutton) {
  flex: 1 1 0;
  border-color: var(--app-border) !important;
  background: var(--app-control) !important;
  color: var(--app-muted) !important;
  font-size: 0.74rem;
}

.create-lobby-dialog__mode :deep(.p-selectbutton .p-togglebutton .p-togglebutton-content) {
  background: transparent !important;
  box-shadow: none !important;
}

.create-lobby-dialog__mode :deep(.p-selectbutton .p-togglebutton.p-togglebutton-checked) {
  border-color: rgba(var(--app-primary-rgb), 0.5) !important;
  background: rgba(var(--app-primary-rgb), 0.16) !important;
  color: var(--app-primary-bright) !important;
}

.create-lobby-dialog__field {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
}

.create-lobby-dialog__field :deep(.p-selectbutton) {
  display: flex;
  width: 100%;
}

.create-lobby-dialog__field :deep(.p-selectbutton .p-togglebutton) {
  flex: 1 1 0;
  min-width: 0;
  border-color: var(--app-border) !important;
  background: var(--app-control) !important;
  color: var(--app-muted) !important;
  font-size: 0.74rem;
}

.create-lobby-dialog__field :deep(.p-selectbutton .p-togglebutton .p-togglebutton-content) {
  background: transparent !important;
  box-shadow: none !important;
}

.create-lobby-dialog__field :deep(.p-selectbutton .p-togglebutton.p-togglebutton-checked) {
  border-color: rgba(var(--app-primary-rgb), 0.5) !important;
  background: rgba(var(--app-primary-rgb), 0.16) !important;
  color: var(--app-primary-bright) !important;
}

.create-lobby-dialog__paste-note {
  display: flex;
  align-items: flex-start;
  gap: 0.65rem;
  padding: 0.7rem 0.8rem;
  border: 1px solid rgba(65, 180, 255, 0.24);
  border-radius: 0.65rem;
  background: rgba(65, 180, 255, 0.08);
  color: #9ddcff;
}

.create-lobby-dialog__paste-note-icon {
  flex: 0 0 auto;
  margin-top: 0.05rem;
  color: #55beff;
}

.create-lobby-dialog__paste-note-content {
  display: flex;
  flex-direction: column;
  gap: 0.15rem;
  font-size: 0.72rem;
  line-height: 1.4;
}

.create-lobby-dialog__paste-note-content strong {
  color: #c5ebff;
  font-size: 0.74rem;
}

.create-lobby-dialog__field > span {
  color: var(--app-muted);
  font-size: 0.72rem;
  font-weight: 700;
}

.create-lobby-dialog__slider-label > span {
  color: var(--app-muted);
  font-size: 0.72rem;
  font-weight: 700;
}

.create-lobby-dialog__field :deep(.p-inputtext) {
  width: 100%;
}

.create-lobby-dialog__field :deep(.p-select) {
  width: 100%;
  height: 2.625rem !important;
  min-height: 0 !important;
  border-color: var(--app-border) !important;
  border-radius: 0.6rem !important;
  background: var(--app-control) !important;
  color: var(--app-text) !important;
  box-shadow: none !important;
}

.create-lobby-dialog__field :deep(.p-select:hover),
.create-lobby-dialog__field :deep(.p-select.p-focus) {
  border-color: rgba(var(--app-primary-rgb), 0.6) !important;
  box-shadow: 0 0 0 1px rgba(var(--app-primary-rgb), 0.18) !important;
}

.create-lobby-dialog__field :deep(.p-select-label) {
  display: flex;
  align-items: center;
  height: 100%;
  min-height: 0;
  padding: 0 0.78rem !important;
  color: var(--app-text) !important;
  font-size: 0.82rem !important;
}

.create-lobby-dialog__field :deep(.p-select-dropdown) {
  width: 2.5rem;
  color: var(--app-muted);
}

.create-lobby-dialog__slider-label {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.create-lobby-dialog__slider-label strong {
  min-width: 2rem;
  padding: 0.12rem 0.45rem;
  border-radius: 0.35rem;
  background: rgba(var(--app-primary-rgb), 0.14);
  color: var(--app-primary-bright);
  font-size: 0.78rem;
  text-align: center;
}

.create-lobby-dialog__slider-wrap {
  padding: 0.5rem 0;
}

.create-lobby-dialog__slider-wrap :deep(.p-slider) {
  height: 0.3rem;
  border-radius: 999px;
  background: var(--app-surface-hover);
}

.create-lobby-dialog__slider-wrap :deep(.p-slider-range) {
  border-radius: 999px;
  background: var(--app-primary);
}

.create-lobby-dialog__slider-wrap :deep(.p-slider-handle) {
  width: 1rem;
  height: 1rem;
  border: 2px solid var(--app-primary-bright);
  background: var(--app-primary);
  box-shadow: none;
}

.create-lobby-dialog__slider-wrap :deep(.p-slider-handle::before) {
  width: 0;
  height: 0;
  box-shadow: none;
}

.create-lobby-dialog__slider-range {
  display: flex;
  justify-content: space-between;
  color: var(--app-muted);
  font-size: 0.68rem;
}

.create-lobby-dialog__toggle-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  padding: 0.15rem 0;
}

.create-lobby-dialog__preview {
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
  padding: 0.7rem 0.75rem;
  border: 1px solid var(--app-border);
  border-radius: 0.55rem;
  background: var(--app-control);
}

.create-lobby-dialog__preview > span {
  color: var(--app-muted);
  font-size: 0.68rem;
  font-weight: 700;
}

.create-lobby-dialog__preview code {
  overflow-wrap: anywhere;
  color: var(--app-primary-bright);
  font-family: ui-monospace, Consolas, monospace;
  font-size: 0.73rem;
}

:global(.p-select-overlay.create-lobby-ruleset-overlay) {
  border: 1px solid var(--app-border) !important;
  border-radius: 0.55rem !important;
  overflow: hidden;
  background: var(--app-surface-raised) !important;
  box-shadow: 0 0.75rem 1.6rem rgba(0, 0, 0, 0.28) !important;
}

:global(.p-select-overlay.create-lobby-ruleset-overlay .p-select-list) {
  padding: 0.25rem !important;
  background: var(--app-surface-raised) !important;
}

:global(.p-select-overlay.create-lobby-ruleset-overlay .p-select-list-container) {
  background: var(--app-surface-raised) !important;
}

:global(.p-select-overlay.create-lobby-ruleset-overlay .p-select-option) {
  margin: 0 !important;
  border-radius: 0.35rem !important;
  background: transparent !important;
  color: var(--app-text) !important;
  font-size: 0.78rem !important;
}

:global(.p-select-overlay.create-lobby-ruleset-overlay .p-select-option:hover),
:global(.p-select-overlay.create-lobby-ruleset-overlay .p-select-option.p-focus),
:global(.p-select-overlay.create-lobby-ruleset-overlay .p-select-option.p-select-option-selected) {
  background: rgba(var(--app-primary-rgb), 0.14) !important;
  color: var(--app-primary-bright) !important;
}
</style>
