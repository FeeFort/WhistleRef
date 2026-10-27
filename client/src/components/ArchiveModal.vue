<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { Archive, Check, ChevronDown, ChevronRight, RotateCcw, Search, Trash2, X } from "@lucide/vue";

const props = defineProps({ visible: { type: Boolean, default: false } });
const emit = defineEmits(["update:visible"]);

const searchQuery = ref("");
const filterMenuOpen = ref(false);
const multiplayerExpanded = ref(false);
const selectedMultiplayerModes = ref(new Set(["stable", "lazer"]));
const archiveFilter = ref("multiplayer");
const filterMenu = ref(null);
const archivedChats = [
  {
    id: "stable-owc-qualifiers",
    title: "OWC Qualifiers",
    type: "multiplayer",
    platform: "Stable",
    messageCount: 326,
    archivedAt: "12 Oct 2026",
  },
  {
    id: "lazer-weekend-practice",
    title: "Weekend practice",
    type: "multiplayer",
    platform: "Lazer",
    messageCount: 91,
    archivedAt: "3 days ago",
  },
  {
    id: "dm-miyu",
    title: "Miyu",
    type: "dm",
    platform: null,
    messageCount: 84,
    archivedAt: "Yesterday",
  },
];

const filteredChats = computed(() => {
  const query = searchQuery.value.trim().toLowerCase();
  return archivedChats.filter((chat) => {
    const matchesFilter = archiveFilter.value === "dm" ? chat.type === "dm" : chat.type === "multiplayer" && selectedMultiplayerModes.value.has(chat.platform?.toLowerCase());
    const matchesSearch = !query || `${chat.title} ${chat.platform || "DM"}`.toLowerCase().includes(query);
    return matchesFilter && matchesSearch;
  });
});

const resultsKey = computed(() => `${archiveFilter.value}:${searchQuery.value}:${[...selectedMultiplayerModes.value].sort().join(",")}`);

const filterLabel = computed(() => {
  if (archiveFilter.value === "dm") return "DM";
  if (selectedMultiplayerModes.value.size === 1) return [...selectedMultiplayerModes.value][0] === "stable" ? "Stable" : "Lazer";
  return "Multiplayer";
});

function close() {
  resetView();
  emit("update:visible", false);
}

function resetView() {
  searchQuery.value = "";
  archiveFilter.value = "multiplayer";
  selectedMultiplayerModes.value = new Set(["stable", "lazer"]);
  multiplayerExpanded.value = false;
  filterMenuOpen.value = false;
}

function toggleFilterMenu() {
  filterMenuOpen.value = !filterMenuOpen.value;
}

function selectDm() {
  archiveFilter.value = "dm";
  filterMenuOpen.value = false;
}

function selectMultiplayer() {
  archiveFilter.value = "multiplayer";
  filterMenuOpen.value = false;
}

function toggleMultiplayerMode(mode) {
  const next = new Set(selectedMultiplayerModes.value);
  if (next.has(mode)) {
    if (next.size === 1) return;
    next.delete(mode);
  } else {
    next.add(mode);
  }
  selectedMultiplayerModes.value = next;
  archiveFilter.value = "multiplayer";
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
                  <div class="archive-modal__filter-group" :class="{ 'archive-modal__filter-group--selected': archiveFilter === 'multiplayer' }">
                    <button
                      type="button"
                      class="archive-modal__filter-expand"
                      :aria-expanded="multiplayerExpanded"
                      aria-label="Expand multiplayer filters"
                      @click="multiplayerExpanded = !multiplayerExpanded"
                    >
                      <ChevronDown v-if="multiplayerExpanded" :size="14" />
                      <ChevronRight v-else :size="14" />
                    </button>
                    <button type="button" class="archive-modal__filter-select" @click="selectMultiplayer">Multiplayer</button>
                  </div>
                  <Transition name="archive-filter-children">
                    <div v-if="multiplayerExpanded" class="archive-modal__filter-children">
                      <button
                        v-for="mode in ['stable', 'lazer']"
                        :key="mode"
                        type="button"
                        class="archive-modal__filter-check"
                        :class="{ 'archive-modal__filter-check--selected': selectedMultiplayerModes.has(mode) }"
                        @click="toggleMultiplayerMode(mode)"
                      >
                        <span>{{ mode === "stable" ? "Stable" : "Lazer" }}</span>
                        <span class="archive-modal__checkbox"><Check v-if="selectedMultiplayerModes.has(mode)" :size="12" /></span>
                      </button>
                    </div>
                  </Transition>
                  <button
                    type="button"
                    class="archive-modal__filter-group archive-modal__filter-group--dm"
                    :class="{ 'archive-modal__filter-group--selected': archiveFilter === 'dm' }"
                    @click="selectDm"
                  >
                    <span>DM</span>
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
                      <span>{{ chat.type === "dm" ? "DM" : `${chat.platform} multiplayer` }}</span>
                      <span aria-hidden="true">·</span>
                      <span>{{ chat.messageCount }} messages</span>
                      <span aria-hidden="true">·</span>
                      <span>Archived {{ chat.archivedAt }}</span>
                    </p>
                  </div>
                  <div class="archive-chat-card__actions">
                    <button type="button" class="archive-chat-card__action" aria-label="Restore chat">
                      <RotateCcw :size="14" />
                      <span>Restore</span>
                    </button>
                    <button type="button" class="archive-chat-card__action archive-chat-card__action--danger" aria-label="Delete chat">
                      <Trash2 :size="14" />
                      <span>Delete</span>
                    </button>
                  </div>
                </article>
              </div>
            </Transition>
            <Transition name="archive-content" mode="out-in">
              <div v-if="!filteredChats.length" :key="searchQuery.trim() ? 'no-results' : 'no-archive'" class="archive-modal__empty" role="status">
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
.archive-modal__filter-option--nested {
  display: inline-block;
  padding-left: 0.7rem;
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
.archive-modal__filter-group,
.archive-modal__filter-check {
  display: flex;
  align-items: center;
  width: 100%;
  min-height: 2.1rem;
  gap: 0.45rem;
  padding: 0.45rem 0.55rem;
  border: 0;
  border-radius: 0.45rem;
  background: transparent;
  color: var(--app-text);
  font: inherit;
  font-size: 0.78rem;
  text-align: left;
  cursor: pointer;
}
.archive-modal__filter-group {
  padding: 0 0.35rem;
  overflow: hidden;
}
.archive-modal__filter-expand,
.archive-modal__filter-select {
  border: 0;
  background: transparent;
  color: inherit;
  font: inherit;
  cursor: pointer;
}
.archive-modal__filter-expand {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 1.45rem;
  min-height: 2.1rem;
  flex: 0 0 1.45rem;
}
.archive-modal__filter-select {
  width: calc(100% - 1.45rem);
  padding: 0.45rem 0.05rem;
  text-align: left;
}
.archive-modal__filter-group:hover,
.archive-modal__filter-check:hover {
  background: rgba(var(--app-primary-rgb), 0.14) !important;
}
.archive-modal__filter-group--selected {
  color: var(--app-primary-bright);
}
.archive-modal__filter-children {
  display: flex;
  flex-direction: column;
  gap: 0.15rem;
  padding: 0.15rem 0 0.2rem 0.75rem;
}
.archive-modal__filter-group--dm {
  margin-top: 0.1rem;
  padding: 0.45rem 0.55rem;
}
.archive-modal__filter-check {
  position: relative;
  border: 1px solid transparent;
  color: var(--app-muted);
}
.archive-modal__filter-check:hover,
.archive-modal__filter-check--selected {
  border-color: rgba(var(--app-primary-rgb), 0.18);
  color: var(--app-text);
}
.archive-modal__filter-check:hover {
  background: rgba(var(--app-primary-rgb), 0.09);
}
.archive-modal__checkbox {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 1rem;
  height: 1rem;
  flex: 0 0 1rem;
  margin-left: auto;
  border: 1px solid var(--app-border-strong);
  border-radius: 50%;
  color: var(--app-primary-bright);
}
.archive-modal__filter-check--selected .archive-modal__checkbox {
  border-color: var(--app-primary-bright);
  background: rgba(var(--app-primary-rgb), 0.2);
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
.archive-filter-children-enter-active,
.archive-filter-children-leave-active {
  max-height: 6rem;
  overflow: hidden;
  transition:
    max-height 0.2s ease,
    opacity 0.16s ease;
}
.archive-filter-children-enter-from,
.archive-filter-children-leave-to {
  max-height: 0;
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
.archive-content-enter-active,
.archive-content-leave-active {
  transition: opacity 0.18s ease;
}
.archive-content-enter-from,
.archive-content-leave-to {
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
