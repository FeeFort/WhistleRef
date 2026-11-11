<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { Archive, ChevronDown, RotateCcw, Search, Trash2, X } from "@lucide/vue";

const props = defineProps({
  visible: { type: Boolean, default: false },
  chats: { type: Array, default: () => [] },
  loading: { type: Boolean, default: false },
  busyChatIds: { type: Object, default: () => ({}) },
  timestampFormat: { type: String, default: "relative" },
});
const emit = defineEmits(["update:visible", "restore-chat", "delete-chat"]);

const searchQuery = ref("");
const filterMenuOpen = ref(false);
const archiveFilter = ref("all");
const filterMenu = ref(null);

const filteredChats = computed(() => {
  const query = searchQuery.value.trim().toLowerCase();
  return [...props.chats]
    .filter((chat) => archiveFilter.value === "all" || chat.platform === archiveFilter.value)
    .filter((chat) => !query || `${chat.title} ${chat.platform} ${chat.externalId}`.toLowerCase().includes(query))
    .sort((left, right) => String(right.archivedAt || "").localeCompare(String(left.archivedAt || "")));
});

const resultsKey = computed(() => `${archiveFilter.value}:${searchQuery.value}`);

const filterLabel = computed(() => ({ all: "All", stable: "Stable", lazer: "Lazer" })[archiveFilter.value] || "All");

function close() {
  resetView();
  emit("update:visible", false);
}

function resetView() {
  searchQuery.value = "";
  archiveFilter.value = "all";
  filterMenuOpen.value = false;
}

function toggleFilterMenu() {
  filterMenuOpen.value = !filterMenuOpen.value;
}

function selectFilter(filter) {
  archiveFilter.value = filter;
  filterMenuOpen.value = false;
}

function restoreChat(chat) {
  emit("restore-chat", chat);
  close();
}

function formatArchivedAt(value) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "Archived date unavailable";

  const time = new Intl.DateTimeFormat(undefined, { hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(date);
  const pad = (number) => String(number).padStart(2, "0");
  const day = date.getDate();
  const month = date.getMonth() + 1;
  const year = date.getFullYear();
  let formattedDate;
  if (props.timestampFormat === "relative") {
    const today = new Date();
    const dateKey = (item) => Date.UTC(item.getFullYear(), item.getMonth(), item.getDate());
    const dayDifference = Math.floor((dateKey(today) - dateKey(date)) / 86400000);
    if (dayDifference === 0) return `Archived today at ${time}`;
    if (dayDifference === 1) return `Archived yesterday at ${time}`;
    if (dayDifference > 1) return `Archived ${dayDifference} days ago at ${time}`;
    formattedDate = `${pad(month)}/${pad(day)}/${year}`;
  } else if (props.timestampFormat === "DD.MM.YYYY") formattedDate = `${pad(day)}.${pad(month)}.${year}`;
  else if (props.timestampFormat === "DD/MM/YYYY") formattedDate = `${pad(day)}/${pad(month)}/${year}`;
  else if (props.timestampFormat === "DD-MM-YYYY") formattedDate = `${pad(day)}-${pad(month)}-${year}`;
  else if (props.timestampFormat === "MM/DD/YYYY") formattedDate = `${pad(month)}/${pad(day)}/${year}`;
  else if (props.timestampFormat === "MM-DD-YYYY") formattedDate = `${pad(month)}-${pad(day)}-${year}`;
  else if (props.timestampFormat === "YYYY-MM-DD") formattedDate = `${year}-${pad(month)}-${pad(day)}`;
  else if (props.timestampFormat === "YYYY/MM/DD") formattedDate = `${year}/${pad(month)}/${pad(day)}`;
  else if (props.timestampFormat === "YYYY.MM.DD") formattedDate = `${year}.${pad(month)}.${pad(day)}`;
  else if (props.timestampFormat === "DD.MM.YY") formattedDate = `${pad(day)}.${pad(month)}.${String(year).slice(-2)}`;
  else if (props.timestampFormat === "MM/DD/YY") formattedDate = `${pad(month)}/${pad(day)}/${String(year).slice(-2)}`;
  else {
    const monthStyle = props.timestampFormat.includes("MMMM") ? "long" : "short";
    const monthName = new Intl.DateTimeFormat(undefined, { month: monthStyle }).format(date);
    if (props.timestampFormat === "D MMM YYYY" || props.timestampFormat === "D MMMM YYYY") formattedDate = `${day} ${monthName} ${year}`;
    else if (props.timestampFormat === "MMM D, YYYY" || props.timestampFormat === "MMMM D, YYYY") formattedDate = `${monthName} ${day}, ${year}`;
    else if (props.timestampFormat === "ddd, D MMM YYYY") {
      const weekday = new Intl.DateTimeFormat(undefined, { weekday: "short" }).format(date);
      formattedDate = `${weekday}, ${day} ${monthName} ${year}`;
    } else formattedDate = `${pad(month)}/${pad(day)}/${year}`;
  }
  return `Archived ${formattedDate} at ${time}`;
}

function closeFilterMenuOnOutsideClick(event) {
  if (filterMenu.value && !filterMenu.value.contains(event.target)) filterMenuOpen.value = false;
}

function onKeydown(event) {
  if (props.visible && event.key === "Escape") close();
}

watch(
  () => props.visible,
  (visible) => {
    document.body.classList.toggle("archive-modal-open", visible);
    if (visible) resetView();
  },
  { immediate: true },
);

onMounted(() => {
  document.addEventListener("keydown", onKeydown);
  document.addEventListener("click", closeFilterMenuOnOutsideClick);
});
onBeforeUnmount(() => {
  document.removeEventListener("keydown", onKeydown);
  document.removeEventListener("click", closeFilterMenuOnOutsideClick);
  document.body.classList.remove("archive-modal-open");
});
</script>

<template>
  <Teleport to="body">
    <Transition name="archive-modal">
      <div v-if="visible" class="archive-modal" role="dialog" aria-modal="true" aria-label="Archived chats">
        <button class="archive-modal__backdrop" type="button" aria-label="Close archived chats" @click="close" />
        <section class="archive-modal__window">
          <header class="archive-modal__header">
            <div class="archive-modal__title">
              <Archive :size="16" aria-hidden="true" />
              <h1>Archived chats</h1>
            </div>
            <button type="button" class="archive-modal__close" aria-label="Close archived chats" @click="close"><X :size="19" /></button>
          </header>
          <div class="archive-modal__toolbar">
            <label class="archive-modal__search">
              <Search :size="15" aria-hidden="true" />
              <input v-model="searchQuery" type="search" placeholder="Search archived chats" aria-label="Search archived chats" />
            </label>
            <div ref="filterMenu" class="archive-modal__filter-wrap">
              <button type="button" class="archive-modal__filter" :aria-expanded="filterMenuOpen" aria-haspopup="listbox" aria-label="Filter archived chats" @click.stop="toggleFilterMenu">
                <span>{{ filterLabel }}</span>
                <ChevronDown :size="14" />
              </button>
              <Transition name="archive-filter-menu">
                <div v-if="filterMenuOpen" class="archive-modal__filter-overlay" role="listbox" aria-label="Archived chat filters" @click.stop>
                  <button
                    v-for="filter in [{ value: 'all', label: 'All' }, { value: 'stable', label: 'Stable' }, { value: 'lazer', label: 'Lazer' }]"
                    :key="filter.value"
                    type="button"
                    class="archive-modal__filter-option"
                    :class="{ 'archive-modal__filter-option--selected': archiveFilter === filter.value }"
                    role="option"
                    :aria-selected="archiveFilter === filter.value"
                    @click="selectFilter(filter.value)"
                  >
                    {{ filter.label }}
                  </button>
                </div>
              </Transition>
            </div>
          </div>
          <div class="archive-modal__content">
            <Transition name="archive-chat-list" mode="out-in">
              <div v-if="filteredChats.length" :key="resultsKey" class="archive-modal__list">
                <article v-for="chat in filteredChats" :key="chat.id" class="archive-chat-card">
                  <div class="archive-chat-card__info">
                    <h2>{{ chat.title }}</h2>
                    <p>
                      <span>{{ chat.platform === "stable" ? "Stable" : "Lazer" }}</span>
                      <span aria-hidden="true">·</span>
                      <span>{{ chat.messageCount }} {{ chat.messageCount === 1 ? "message" : "messages" }}</span>
                      <span aria-hidden="true">·</span>
                      <span>{{ formatArchivedAt(chat.archivedAt) }}</span>
                    </p>
                  </div>
                  <div class="archive-chat-card__actions">
                    <button type="button" class="archive-chat-card__action" :aria-label="`Restore ${chat.title} as read-only`" :disabled="Boolean(busyChatIds[chat.id])" @click="restoreChat(chat)">
                      <RotateCcw :size="14" />
                      <span>Restore</span>
                    </button>
                    <button type="button" class="archive-chat-card__action archive-chat-card__action--danger" :aria-label="`Delete ${chat.title}`" :disabled="Boolean(busyChatIds[chat.id])" @click="emit('delete-chat', chat)">
                      <Trash2 :size="14" />
                      <span>Delete</span>
                    </button>
                  </div>
                </article>
              </div>
              <div v-else-if="loading" key="loading" class="archive-modal__empty" role="status">Loading archived chats...</div>
              <div v-else key="empty" class="archive-modal__empty" role="status">
                {{ searchQuery.trim() ? "No chats found" : "No archived chats" }}
              </div>
            </Transition>
          </div>
        </section>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.archive-modal {
  position: fixed;
  inset: 0;
  z-index: 1000;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 1.25rem;
}
.archive-modal__backdrop {
  position: absolute;
  inset: 0;
  border: 0;
  background: rgba(4, 6, 12, 0.72);
  backdrop-filter: blur(0.35rem);
  cursor: default;
}
.archive-modal__window {
  position: relative;
  display: flex;
  width: min(720px, 100%);
  height: min(480px, calc(100vh - 2.5rem));
  flex-direction: column;
  overflow: hidden;
  border: 1px solid var(--app-border);
  border-radius: 1rem;
  background: var(--app-panel-gradient);
  box-shadow: 0 2rem 6rem rgba(0, 0, 0, 0.45);
}
.archive-modal__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 1.1rem 1.25rem 0.9rem;
  border-bottom: 1px solid var(--app-border);
}
.archive-modal__title {
  display: flex;
  align-items: center;
  gap: 0.55rem;
}
.archive-modal__title svg {
  color: var(--app-primary-bright);
}
.archive-modal__header h1 {
  margin: 0;
  color: var(--app-text);
  font-size: 1rem;
  font-weight: 800;
}
.archive-modal__close {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 2.2rem;
  height: 2.2rem;
  border: 0;
  border-radius: 0.55rem;
  background: transparent;
  color: var(--app-muted);
  cursor: pointer;
  transition:
    background 0.16s ease,
    color 0.16s ease;
}
.archive-modal__close:hover {
  border-color: rgba(var(--app-primary-rgb), 0.35);
  background: rgba(var(--app-primary-rgb), 0.13);
  color: var(--app-primary-bright);
}
.archive-modal__content {
  display: flex;
  flex: 1 1 auto;
  min-height: 0;
  overflow: auto;
  padding: 1.15rem 1.25rem;
}
.archive-modal__toolbar {
  display: flex;
  align-items: center;
  gap: 0.65rem;
  padding: 1rem 1.25rem 0;
}
.archive-modal__search {
  display: flex;
  flex: 1 1 auto;
  align-items: center;
  gap: 0.55rem;
  min-width: 0;
  padding: 0.6rem 0.75rem;
  border: 1px solid var(--app-border);
  border-radius: 0.55rem;
  background: var(--app-control);
  color: var(--app-muted);
  transition:
    border-color 0.18s ease,
    box-shadow 0.18s ease;
}
.archive-modal__search:focus-within {
  border-color: var(--app-primary-bright);
  box-shadow: 0 0 0 0.15rem rgba(var(--app-primary-rgb), 0.14);
}
.archive-modal__search input {
  width: 100%;
  min-width: 0;
  padding: 0;
  border: 0;
  outline: 0;
  background: transparent;
  color: var(--app-text);
  font: inherit;
  font-size: 0.78rem;
}
.archive-modal__search input::placeholder {
  color: var(--app-muted);
}
.archive-modal__filter {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
  width: 9rem;
  flex: 0 0 9rem;
  width: 100%;
  height: 2.625rem !important;
  min-height: 0 !important;
  padding: 0 0.7rem;
  border-color: var(--app-border) !important;
  border-radius: 0.6rem !important;
  background: var(--app-control) !important;
  color: var(--app-text) !important;
  font: inherit;
  font-size: 0.82rem;
  text-align: left;
  cursor: pointer;
  box-shadow: none !important;
  transition:
    border-color 0.18s ease,
    box-shadow 0.18s ease;
}
.archive-modal__filter:hover,
.archive-modal__filter.p-focus {
  border-color: rgba(var(--app-primary-rgb), 0.6) !important;
  box-shadow: 0 0 0 1px rgba(var(--app-primary-rgb), 0.18) !important;
}
.archive-modal__filter-wrap {
  position: relative;
  width: 9rem;
  flex: 0 0 9rem;
}
.archive-modal__filter-overlay {
  position: absolute;
  top: calc(100% + 0.35rem);
  right: 0;
  z-index: 3;
  width: 100%;
  padding: 0.35rem;
  border: 1px solid var(--app-border) !important;
  border-radius: 0.6rem !important;
  background: var(--app-surface-raised) !important;
  box-shadow: 0 1rem 2rem rgba(0, 0, 0, 0.28) !important;
  color: var(--app-text) !important;
}
.archive-modal__filter-option {
  display: flex;
  align-items: center;
  width: 100%;
  min-height: 2.1rem;
  padding: 0.45rem 0.55rem;
  border: 0;
  border-radius: 0.45rem;
  background: transparent;
  color: var(--app-muted);
  font: inherit;
  font-size: 0.78rem;
  text-align: left;
  cursor: pointer;
}
.archive-modal__filter-option:hover,
.archive-modal__filter-option--selected {
  color: var(--app-text);
  background: rgba(var(--app-primary-rgb), 0.12);
}
.archive-modal__filter-option--selected {
  font-weight: 650;
}
.archive-filter-menu-enter-active,
.archive-filter-menu-leave-active {
  transition:
    opacity 0.16s ease,
    transform 0.16s ease;
  transform-origin: top right;
}
.archive-filter-menu-enter-from,
.archive-filter-menu-leave-to {
  transform: translateY(-0.3rem) scale(0.98);
  opacity: 0;
}
.archive-chat-list-enter-active,
.archive-chat-list-leave-active {
  transition:
    opacity 0.2s ease,
    transform 0.2s ease;
}
.archive-chat-list-enter-from,
.archive-chat-list-leave-to {
  transform: translateY(0.35rem);
  opacity: 0;
}
.archive-modal__list {
  display: flex;
  flex-direction: column;
  gap: 0.65rem;
  width: 100%;
}
.archive-chat-card {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  padding: 0.85rem 0.95rem;
  border: 1px solid var(--app-border);
  border-radius: 0.65rem;
  background: rgba(var(--app-primary-rgb), 0.035);
  transition:
    border-color 0.16s ease,
    background 0.16s ease;
}
.archive-chat-card:hover {
  border-color: rgba(var(--app-primary-rgb), 0.3);
  background: rgba(var(--app-primary-rgb), 0.08);
}
.archive-chat-card__info {
  min-width: 0;
}
.archive-chat-card__info h2 {
  margin: 0;
  overflow: hidden;
  color: var(--app-text);
  font-size: 0.85rem;
  font-weight: 750;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.archive-chat-card__info p {
  display: flex;
  flex-wrap: wrap;
  gap: 0.35rem;
  margin: 0.28rem 0 0;
  color: var(--app-muted);
  font-size: 0.68rem;
}
.archive-chat-card__actions {
  display: flex;
  flex: 0 0 auto;
  align-items: center;
  gap: 0.3rem;
}
.archive-chat-card__action {
  display: inline-flex;
  align-items: center;
  gap: 0.3rem;
  padding: 0.4rem 0.5rem;
  border: 1px solid transparent;
  border-radius: 0.45rem;
  background: transparent;
  color: var(--app-muted);
  font: inherit;
  font-size: 0.7rem;
  font-weight: 700;
  cursor: pointer;
  transition:
    border-color 0.16s ease,
    background 0.16s ease,
    color 0.16s ease;
}
.archive-chat-card__action:hover {
  border-color: rgba(var(--app-primary-rgb), 0.22);
  background: rgba(var(--app-primary-rgb), 0.12);
  color: var(--app-primary-bright);
}
.archive-chat-card__action:disabled {
  cursor: wait;
  opacity: 0.55;
}
.archive-chat-card__action--danger:hover {
  border-color: rgba(255, 107, 126, 0.25);
  background: rgba(255, 107, 126, 0.1);
  color: var(--app-red);
}
.archive-modal__empty {
  align-self: center;
  margin: auto;
  color: var(--app-muted);
  font-size: 0.85rem;
  font-weight: 600;
  text-align: center;
}
.archive-modal-enter-active,
.archive-modal-leave-active {
  transition: opacity 0.2s ease;
}
.archive-modal-enter-active .archive-modal__window,
.archive-modal-leave-active .archive-modal__window {
  transition:
    transform 0.22s ease-out,
    opacity 0.2s ease;
}
.archive-modal-enter-from,
.archive-modal-leave-to {
  opacity: 0;
}
.archive-modal-enter-from .archive-modal__window,
.archive-modal-leave-to .archive-modal__window {
  transform: scale(0.96);
  opacity: 0;
}
@media (max-width: 700px) {
  .archive-modal {
    padding: 0;
  }
  .archive-modal__window {
    width: 100%;
    height: 100%;
    border-radius: 0;
  }
  .archive-modal__header,
  .archive-modal__toolbar,
  .archive-modal__content {
    padding-left: 1rem;
    padding-right: 1rem;
  }
  .archive-modal__toolbar {
    align-items: stretch;
    flex-direction: column;
  }
  .archive-modal__filter {
    width: 100%;
    flex-basis: auto;
  }
  .archive-modal__filter-wrap {
    width: 100%;
    flex-basis: auto;
  }
  .archive-chat-card {
    align-items: flex-start;
    flex-direction: column;
  }
  .archive-chat-card__actions {
    width: 100%;
  }
}
</style>
