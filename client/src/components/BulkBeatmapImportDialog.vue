<script setup>
import { computed, ref, watch } from "vue";
import Button from "primevue/button";
import Dialog from "primevue/dialog";
import InputText from "primevue/inputtext";
import ProgressBar from "primevue/progressbar";
import { Plus, RefreshCw, Trash2, Upload } from "@lucide/vue";
import { useToast } from "primevue/usetoast";
import { useServerConnection } from "../composables/useServerConnection";

const props = defineProps({ visible: Boolean, pool: { type: Object, default: null } });
const emit = defineEmits(["update:visible", "import"]);
const { requestApi } = useServerConnection();
const toast = useToast();
const source = ref("");
const rows = ref([]);
const processing = ref(false);
const processed = ref(0);
const total = ref(0);
const currentId = ref("");

const ids = computed(() => {
  const seen = new Set();
  return source.value
    .replaceAll(",", " ")
    .split(/\s+/)
    .map((value) => value.trim())
    .filter((value) => /^\d+$/.test(value) && Number(value) > 0)
    .filter((value) => {
      if (seen.has(value)) return false;
      seen.add(value);
      return true;
    });
});
const allocated = computed(() => rows.value.reduce((sum, row) => sum + (Number.parseInt(row.count, 10) || 0), 0));
const allocationValid = computed(() => {
  const names = rows.value.map((row) => row.name.trim().toLowerCase()).filter(Boolean);
  return (
    ids.value.length > 0 &&
    allocated.value === ids.value.length &&
    rows.value.every((row) => row.name.trim() && Number.isInteger(Number(row.count)) && Number(row.count) >= 0) &&
    new Set(names).size === names.length
  );
});
const progress = computed(() => (total.value ? Math.round((processed.value / total.value) * 100) : 0));

function reset(pool) {
  source.value = "";
  processed.value = 0;
  total.value = 0;
  currentId.value = "";
  rows.value = (pool?.categories || []).map((name) => ({ name, count: 0 }));
  if (!rows.value.length) rows.value.push({ name: "", count: 0 });
}

watch(
  () => [props.visible, props.pool?.id],
  ([visible]) => {
    if (visible && !processing.value) reset(props.pool);
  },
);

function addRow() {
  rows.value.push({ name: "", count: 0 });
}

function removeRow(index) {
  if (rows.value.length > 1) rows.value.splice(index, 1);
}

function close() {
  if (!processing.value) emit("update:visible", false);
}

function assignments() {
  const result = [];
  let offset = 0;
  rows.value.forEach((row) => {
    const count = Number.parseInt(row.count, 10) || 0;
    for (let index = 0; index < count; index += 1) result.push({ id: ids.value[offset++], category: row.name.trim() });
  });
  return result;
}

function makePreview(id, info) {
  return {
    beatmapId: id,
    artist: info.artist || info.beatmapset?.artist || "",
    title: info.title || info.beatmapset?.title || info.name || "",
    diff: info.version || "",
    author: typeof info.creator === "string" ? info.creator : info.creator?.username || "",
    beatmapsetId: info.beatmapset_id || info.beatmapset?.id || null,
    starRating: info.difficulty_rating ?? null,
    totalSeconds: info.total_length ?? null,
  };
}

async function parseBeatmap(id) {
  const info = await requestApi(`/beatmaps/${id}`);
  const preview = makePreview(id, info);
  if (!preview.author && info.user_id != null) {
    try {
      const mapper = await requestApi(`/users/${info.user_id}`);
      preview.author = mapper.username || mapper.name || "";
    } catch {
      return preview;
    }
  }
  return preview;
}

function finishImport(items, results) {
  const successful = [];
  const failed = [];
  const failedCounts = new Map();
  results.forEach((result, index) => {
    const item = items[index];
    if (result) successful.push({ ...item, preview: result });
    else {
      failed.push(item.id);
      failedCounts.set(item.category, (failedCounts.get(item.category) || 0) + 1);
    }
  });
  if (successful.length) emit("import", { maps: successful });
  if (!failed.length) {
    emit("update:visible", false);
    return;
  }
  source.value = failed.join(" ");
  rows.value = rows.value.map((row) => ({ ...row, count: failedCounts.get(row.name.trim()) || 0 }));
  toast.add({
    severity: "warn",
    summary: "Some beatmaps were not imported",
    detail: `${failed.length} beatmap ID${failed.length === 1 ? "" : "s"} could not be parsed. Try again or add them manually.`,
    life: 7000,
  });
}

async function startImport() {
  if (processing.value || !allocationValid.value) return;
  const items = assignments();
  processing.value = true;
  processed.value = 0;
  total.value = items.length;
  currentId.value = "";
  const results = await Promise.all(
    items.map(async (item) => {
      currentId.value = item.id;
      try {
        return await parseBeatmap(Number(item.id));
      } catch {
        return null;
      } finally {
        processed.value += 1;
      }
    }),
  );
  processing.value = false;
  currentId.value = "";
  finishImport(items, results);
}
</script>

<template>
  <Dialog
    :visible="visible"
    modal
    :closable="!processing"
    :dismissable-mask="!processing"
    class="bulk-import-dialog"
    :style="{ width: '34rem' }"
    :pt="{ mask: { class: 'app-dialog-mask' } }"
    @update:visible="(value) => value || close()"
  >
    <template #header>
      <div class="bulk-import-dialog__heading">
        <RefreshCw v-if="processing" :size="20" class="bulk-import-dialog__spin" /><Upload v-else :size="20" />
        <h2>{{ processing ? "Parsing beatmaps" : "Add bulk of beatmaps" }}</h2>
      </div>
    </template>
    <div v-if="processing" class="bulk-import-dialog__content">
      <p class="bulk-import-dialog__subtitle">Please wait until the maps data is fetched from osu! API</p>
      <div class="bulk-import-dialog__progress-meta">
        <span>{{ processed }} of {{ total }} beatmaps</span><strong>{{ progress }}%</strong>
      </div>
      <ProgressBar :value="progress" :show-value="false" class="bulk-import-dialog__progress" />
      <p class="bulk-import-dialog__download-meta">Current beatmap: {{ currentId }}</p>
    </div>
    <div v-else class="bulk-import-dialog__content">
      <p class="bulk-import-dialog__subtitle">Paste beatmap IDs separated by commas, spaces, or new lines.</p>
      <textarea v-model="source" class="bulk-import-dialog__textarea" rows="6" placeholder="123123123, 456456456&#10;789789789" />
      <div class="bulk-import-dialog__count">
        <span>Unique IDs: {{ ids.length }}</span
        ><span :class="{ 'bulk-import-dialog__count--invalid': allocated > ids.length }">Allocated: {{ allocated }} / {{ ids.length }}</span>
      </div>
      <div class="bulk-import-dialog__rows">
        <div v-for="(row, index) in rows" :key="index" class="bulk-import-dialog__row">
          <InputText v-model="row.name" placeholder="Category" aria-label="Category" /><InputText
            v-model="row.count"
            type="number"
            min="0"
            :max="ids.length"
            placeholder="Amount"
            aria-label="Amount"
          /><Button text rounded severity="danger" aria-label="Remove category" :disabled="rows.length <= 1" @click="removeRow(index)"><Trash2 :size="15" /></Button>
        </div>
      </div>
      <Button text class="bulk-import-dialog__add-row" @click="addRow"><Plus :size="15" /> Add category</Button>
      <p v-if="ids.length && !allocationValid" class="bulk-import-dialog__hint">Distribute all {{ ids.length }} beatmaps before importing.</p>
    </div>
    <template v-if="!processing" #footer
      ><Button label="Cancel" text severity="secondary" @click="close" /><Button label="Import beatmaps" :disabled="!allocationValid" @click="startImport"
    /></template>
  </Dialog>
</template>

<style>
.bulk-import-dialog {
  overflow: hidden;
  border: 1px solid var(--app-border) !important;
  border-radius: 0.85rem !important;
  background: var(--app-panel-gradient) !important;
  box-shadow: 0 1.25rem 3rem rgba(0, 0, 0, 0.35) !important;
  color: var(--app-text) !important;
}
.bulk-import-dialog .p-dialog-header,
.bulk-import-dialog .p-dialog-content,
.bulk-import-dialog .p-dialog-footer {
  background: transparent !important;
  color: var(--app-text) !important;
}
.bulk-import-dialog .p-dialog-header {
  padding: 1.1rem 1.25rem 0.9rem !important;
  border-bottom: 1px solid var(--app-border) !important;
}
.bulk-import-dialog .p-dialog-content {
  padding: 1.15rem 1.25rem !important;
}
.bulk-import-dialog .p-dialog-footer {
  display: flex;
  justify-content: flex-end;
  gap: 0.55rem;
  padding: 0.9rem 1.25rem 1.1rem !important;
  border-top: 1px solid var(--app-border) !important;
}
.bulk-import-dialog .p-dialog-close-button {
  width: 1.9rem !important;
  height: 1.9rem !important;
  color: var(--app-muted) !important;
  border-radius: 0.5rem !important;
}
.bulk-import-dialog .p-dialog-close-button:hover {
  background: rgba(var(--app-primary-rgb), 0.12) !important;
  color: var(--app-primary-bright) !important;
}
.bulk-import-dialog__content {
  display: flex;
  flex-direction: column;
  gap: 0.65rem;
}
.bulk-import-dialog__heading {
  display: flex;
  align-items: center;
  gap: 0.6rem;
}
.bulk-import-dialog__heading svg {
  color: var(--app-primary-bright);
}
.bulk-import-dialog__heading h2 {
  margin: 0;
  color: var(--app-text);
  font-size: 1rem;
  font-weight: 800;
}
.bulk-import-dialog__subtitle {
  margin: 0.1rem 0 0;
  color: var(--app-muted);
  font-size: 0.8rem;
}
.bulk-import-dialog__textarea {
  width: 100%;
  min-height: 8rem;
  resize: vertical;
  padding: 0.7rem;
  border: 1px solid var(--app-border) !important;
  border-radius: 0.55rem;
  outline: 0;
  background: var(--app-control) !important;
  color: var(--app-text) !important;
  font: inherit;
  font-size: 0.8rem;
  line-height: 1.45;
}
.bulk-import-dialog__textarea:focus {
  border-color: var(--app-primary-bright);
  box-shadow: 0 0 0 2px rgba(var(--app-primary-rgb), 0.14);
}
.bulk-import-dialog__count,
.bulk-import-dialog__progress-meta {
  display: flex;
  justify-content: space-between;
  color: var(--app-muted);
  font-size: 0.76rem;
}
.bulk-import-dialog__count--invalid {
  color: var(--app-danger, #f87171);
}
.bulk-import-dialog__rows {
  display: flex;
  flex-direction: column;
  gap: 0.45rem;
  max-height: 11rem;
  overflow: auto;
}
.bulk-import-dialog__row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 6.5rem 2.2rem;
  gap: 0.45rem;
  align-items: center;
}
.bulk-import-dialog__row .p-inputtext {
  width: 100%;
  border: 1px solid var(--app-border) !important;
  border-radius: 0.6rem !important;
  background: var(--app-control) !important;
  color: var(--app-text) !important;
  box-shadow: none !important;
}
.bulk-import-dialog__row .p-inputtext:hover {
  border-color: var(--app-border-strong) !important;
}
.bulk-import-dialog__row .p-inputtext:focus {
  border-color: var(--app-primary-bright) !important;
  box-shadow: 0 0 0 0.15rem rgba(var(--app-primary-rgb), 0.16) !important;
}
.bulk-import-dialog .p-button {
  font-family: inherit;
}
.bulk-import-dialog .p-button:not(.p-button-secondary):not(.p-button-danger) {
  background: var(--app-primary) !important;
  color: var(--app-on-primary, #08121a) !important;
  border-color: var(--app-primary) !important;
}
.bulk-import-dialog .p-button:not(.p-button-secondary):not(.p-button-danger):hover {
  background: var(--app-primary-bright) !important;
  border-color: var(--app-primary-bright) !important;
}
.bulk-import-dialog .p-button.p-button-text {
  background: transparent !important;
  color: var(--app-primary) !important;
  border-color: transparent !important;
}
.bulk-import-dialog .p-button.p-button-text:hover {
  background: rgba(var(--app-primary-rgb), 0.12) !important;
  color: var(--app-primary-bright) !important;
}
.bulk-import-dialog .p-button.p-button-danger {
  color: var(--app-red) !important;
}
.bulk-import-dialog .p-button.p-button-danger:hover {
  background: rgba(255, 109, 120, 0.12) !important;
}
.bulk-import-dialog__add-row {
  align-self: flex-start;
  gap: 0.35rem;
  padding-left: 0;
}
.bulk-import-dialog__hint {
  margin: 0;
  color: var(--app-muted);
  font-size: 0.74rem;
}
.bulk-import-dialog__progress-meta {
  margin-top: 1rem;
}
.bulk-import-dialog__progress-meta strong {
  color: var(--app-text);
}
.bulk-import-dialog__progress {
  height: 0.5rem;
  margin-top: 0.05rem;
  overflow: hidden;
  border-radius: 999px;
}
.bulk-import-dialog .p-progressbar {
  width: 100% !important;
  align-self: stretch;
  height: 0.5rem !important;
  overflow: hidden;
  border: 1px solid var(--app-border) !important;
  border-radius: 999px !important;
  background: var(--app-control) !important;
}
.bulk-import-dialog .p-progressbar-value {
  border-radius: 999px !important;
  background: var(--app-primary) !important;
}
.bulk-import-dialog__download-meta {
  margin: 0.05rem 0 0.75rem;
  color: var(--app-muted);
  opacity: 0.72;
  font-size: 0.72rem;
}
.bulk-import-dialog__spin {
  animation: bulk-import-dialog-spin 1.2s linear infinite;
}
@keyframes bulk-import-dialog-spin {
  to {
    transform: rotate(360deg);
  }
}
</style>
