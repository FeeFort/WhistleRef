<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { Archive, Bell, LayoutPanelLeft, Megaphone, MessageSquare, Music, Search, Settings2, SquareSlash, Users, X } from "@lucide/vue";
import serverPackage from "../../../server/package.json";
import githubIcon from "../assets/github.svg";

const props = defineProps({ visible: { type: Boolean, default: false } });
const emit = defineEmits(["update:visible"]);

const categories = [
  { id: "app", label: "App settings", icon: LayoutPanelLeft },
  { id: "notifications", label: "Notifications", icon: Bell },
  { id: "now-playing", label: "Now Playing", icon: Music },
  { id: "lobby", label: "Lobby settings", icon: Users },
  { id: "archive", label: "Archive", icon: Archive },
  { id: "chat", label: "Chat settings", icon: MessageSquare },
  { id: "shortcuts", label: "Shortcuts", icon: SquareSlash },
];
const activeCategory = ref("app");
const searchQuery = ref("");
const settingsContent = ref(null);
const settingsSearchIndex = ref(null);
const categoryMatches = ref(Object.fromEntries(categories.map((category) => [category.id, true])));
const activeSlot = computed(() => categories.find((category) => category.id === activeCategory.value) || categories[0]);

function close() {
  emit("update:visible", false);
}

function onKeydown(event) {
  if (props.visible && event.key === "Escape") close();
}

function applySearch() {
  nextTick(() => {
    const query = searchQuery.value.trim().toLowerCase();
    const getSearchableText = (row) => [row.querySelector("h3")?.textContent, row.querySelector("p")?.textContent].filter(Boolean).join(" ").toLowerCase();
    const nextCategoryMatches = {};

    categories.forEach((category) => {
      const categoryIndex = settingsSearchIndex.value?.querySelector(`[data-settings-category="${category.id}"]`);
      const rows = categoryIndex?.querySelectorAll(".settings-page__setting") || [];
      nextCategoryMatches[category.id] = !query || Array.from(rows).some((row) => getSearchableText(row).includes(query));
    });
    categoryMatches.value = nextCategoryMatches;

    const rows = settingsContent.value?.querySelectorAll(".settings-page__setting") || [];
    rows.forEach((row) => {
      const isMatch = !query || getSearchableText(row).includes(query);
      row.hidden = !isMatch;
    });

    if (query && !nextCategoryMatches[activeCategory.value]) {
      const firstMatchingCategory = categories.find((category) => nextCategoryMatches[category.id]);
      if (firstMatchingCategory) activeCategory.value = firstMatchingCategory.id;
    }
  });
}

watch(
  () => props.visible,
  (visible) => {
    document.body.classList.toggle("settings-modal-open", visible);
  },
  { immediate: true },
);

onMounted(() => document.addEventListener("keydown", onKeydown));
watch([searchQuery, activeCategory, () => props.visible], applySearch);
onBeforeUnmount(() => {
  document.removeEventListener("keydown", onKeydown);
  document.body.classList.remove("settings-modal-open");
});
</script>

<template>
  <Teleport to="body">
    <Transition name="settings-modal">
      <div v-if="visible" class="settings-modal" role="dialog" aria-modal="true" aria-label="Settings">
        <button class="settings-modal__backdrop" type="button" aria-label="Close settings" @click="close" />
        <div class="settings-modal__window">
          <aside class="settings-modal__sidebar">
            <div class="settings-modal__sidebar-heading">
              <Settings2 :size="18" />
              <span>Settings</span>
            </div>
            <label class="settings-modal__search">
              <Search :size="15" aria-hidden="true" />
              <input v-model="searchQuery" type="search" placeholder="Search settings" aria-label="Search settings" />
            </label>
            <nav class="settings-modal__nav" aria-label="Settings categories">
              <button
                v-for="category in categories"
                v-show="categoryMatches[category.id]"
                :key="category.id"
                type="button"
                class="settings-modal__nav-item"
                :class="{ 'settings-modal__nav-item--active': activeCategory === category.id }"
                @click="activeCategory = category.id"
              >
                <component :is="category.icon" :size="16" />
                <span>{{ category.label }}</span>
              </button>
            </nav>
            <p v-if="searchQuery.trim() && !Object.values(categoryMatches).some(Boolean)" class="settings-modal__no-results">No matching settings.</p>
            <div class="settings-modal__sidebar-footer">
              <div class="settings-modal__brand"><span class="settings-modal__brand-mark">Whistle</span><span>Ref</span></div>
              <span class="settings-modal__version">v{{ serverPackage.version }}</span>
              <div class="settings-modal__links">
                <a href="https://github.com/FeeFort/WhistleRef" target="_blank" rel="noreferrer">
                  <img :src="githubIcon" alt="" />
                  <span>GitHub</span>
                </a>
                <span class="settings-modal__links-separator" aria-hidden="true">•</span>
                <a href="https://github.com/FeeFort/WhistleRef/releases" target="_blank" rel="noreferrer">
                  <Megaphone :size="14" aria-hidden="true" />
                  <span>What's new</span>
                </a>
              </div>
            </div>
          </aside>
          <section class="settings-modal__content">
            <header class="settings-modal__header">
              <div class="settings-modal__title">
                <component :is="activeSlot.icon" :size="20" aria-hidden="true" />
                <h1>{{ activeSlot.label }}</h1>
              </div>
              <button type="button" class="settings-modal__close" aria-label="Close settings" @click="close"><X :size="19" /></button>
            </header>
            <div ref="settingsContent" class="settings-modal__scroll">
              <slot :name="activeCategory" />
            </div>
          </section>
        </div>
        <div ref="settingsSearchIndex" class="settings-modal__search-index" aria-hidden="true">
          <div v-for="category in categories" :key="category.id" :data-settings-category="category.id">
            <slot :name="category.id" />
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.settings-modal {
  position: fixed;
  inset: 0;
  z-index: 1000;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 1.25rem;
}
.settings-modal__backdrop {
  position: absolute;
  inset: 0;
  border: 0;
  background: rgba(4, 6, 12, 0.72);
  backdrop-filter: blur(0.35rem);
  cursor: default;
}
.settings-modal__window {
  position: relative;
  display: flex;
  width: min(1180px, 100%);
  height: min(820px, calc(100vh - 2.5rem));
  overflow: hidden;
  border: 1px solid var(--app-border);
  border-radius: 1rem;
  background: var(--app-panel-gradient);
  box-shadow: 0 2rem 6rem rgba(0, 0, 0, 0.45);
}
.settings-modal__sidebar {
  width: 240px;
  flex: 0 0 240px;
  padding: 1.2rem 0.75rem;
  border-right: 1px solid var(--app-border);
  background: rgba(var(--app-primary-rgb), 0.035);
}
.settings-modal__sidebar-heading {
  display: flex;
  align-items: center;
  gap: 0.6rem;
  padding: 0 0.75rem 1.1rem;
  color: var(--app-text);
  font-size: 0.9rem;
  font-weight: 800;
}
.settings-modal__sidebar-heading svg {
  color: var(--app-primary-bright);
}
.settings-modal__sidebar .settings-modal__search {
  margin: 0 0.1rem 1rem;
}
.settings-modal__sidebar {
  display: flex;
  flex-direction: column;
}
.settings-modal__nav {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}
.settings-modal__nav-item {
  display: flex;
  align-items: center;
  gap: 0.65rem;
  width: 100%;
  padding: 0.7rem 0.75rem;
  border: 0;
  border-radius: 0.55rem;
  background: transparent;
  color: var(--app-muted);
  font: inherit;
  font-size: 0.78rem;
  font-weight: 700;
  text-align: left;
  cursor: pointer;
  transition:
    background 0.16s ease,
    color 0.16s ease;
}
.settings-modal__nav-item:hover {
  background: rgba(var(--app-primary-rgb), 0.1);
  color: var(--app-text);
}
.settings-modal__nav-item--active {
  background: rgba(var(--app-primary-rgb), 0.17);
  color: var(--app-primary-bright);
}
.settings-modal__content {
  display: flex;
  flex: 1 1 auto;
  min-width: 0;
  flex-direction: column;
}
.settings-modal__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 1.3rem 1.5rem 1.1rem;
  border-bottom: 1px solid var(--app-border);
}
.settings-modal__title {
  display: flex;
  align-items: center;
  gap: 0.65rem;
}
.settings-modal__title svg {
  color: var(--app-primary-bright);
}
.settings-modal__header h1 {
  margin: 0;
  color: var(--app-text);
  font-size: 1.2rem;
  font-weight: 800;
}
.settings-modal__close {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 2.2rem;
  height: 2.2rem;
  border: 1px solid var(--app-border);
  border-radius: 0.55rem;
  background: var(--app-control);
  color: var(--app-muted);
  cursor: pointer;
}
.settings-modal__close:hover {
  border-color: rgba(var(--app-primary-rgb), 0.35);
  background: rgba(var(--app-primary-rgb), 0.13);
  color: var(--app-primary-bright);
}
.settings-modal__search {
  display: flex;
  align-items: center;
  gap: 0.55rem;
  margin: 1rem 1.5rem 0;
  padding: 0.6rem 0.75rem;
  border: 1px solid var(--app-border);
  border-radius: 0.55rem;
  background: var(--app-control);
  color: var(--app-muted);
  transition:
    border-color 0.18s ease,
    box-shadow 0.18s ease;
}
.settings-modal__search:focus-within {
  border-color: var(--app-primary-bright);
  box-shadow: 0 0 0 0.15rem rgba(var(--app-primary-rgb), 0.14);
}
.settings-modal__search input {
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
.settings-modal__search input::placeholder {
  color: var(--app-muted);
}
.settings-modal__scroll {
  flex: 1 1 auto;
  min-height: 0;
  overflow: auto;
  padding: 0 1.5rem 1.5rem;
}
.settings-modal__no-results {
  margin: 2rem 0;
  color: var(--app-muted);
  font-size: 0.8rem;
  text-align: center;
}
.settings-modal__sidebar-footer {
  margin-top: auto;
  padding: 1.5rem 0.75rem 0.1rem;
}
.settings-modal__brand {
  color: var(--app-text);
  font-family: "Nunito", "Manrope", sans-serif;
  font-size: 1.25rem;
  font-weight: 800;
  letter-spacing: -0.02em;
}
.settings-modal__brand-mark {
  color: var(--app-primary);
}
.settings-modal__version {
  display: block;
  margin-top: 0.2rem;
  color: var(--app-muted);
  font-size: 0.68rem;
}
.settings-modal__links {
  display: flex;
  align-items: center;
  gap: 0.45rem;
  margin-top: 0.7rem;
  color: var(--app-muted);
  font-size: 0.68rem;
}
.settings-modal__links a {
  display: inline-flex;
  align-items: center;
  gap: 0.3rem;
  color: var(--app-muted);
  text-decoration: none;
  transition: color 0.16s ease;
}
.settings-modal__links a:hover {
  color: var(--app-primary-bright);
}
.settings-modal__links img {
  width: 14px;
  height: 14px;
  opacity: 0.72;
}
.settings-modal__links-separator {
  color: var(--app-muted);
  opacity: 0.7;
}
.settings-modal__scroll :deep(.settings-page__section) {
  margin-top: 1.25rem;
}
.settings-modal__scroll :deep(.settings-page__section:not(.settings-page__section--chat)) {
  margin-top: 0.5rem;
}
.settings-modal__scroll :deep(.settings-page__section-heading h2) {
  display: none;
}
.settings-modal__scroll :deep(.settings-page__section > .settings-page__setting) {
  margin-top: 0;
  padding: 0.9rem 0;
  border-bottom: 1px solid var(--app-border);
}
.settings-modal__scroll :deep(.settings-page__section > .settings-page__setting:last-child) {
  border-bottom: 0;
}
.settings-modal__scroll :deep(.settings-page__settings-list .settings-page__setting:last-child) {
  border-bottom: 0;
}
.settings-modal__search-index {
  position: absolute;
  width: 0;
  height: 0;
  overflow: hidden;
  opacity: 0;
  pointer-events: none;
}
.settings-modal-enter-active,
.settings-modal-leave-active {
  transition: opacity 0.2s ease;
}
.settings-modal-enter-active .settings-modal__window,
.settings-modal-leave-active .settings-modal__window {
  transition:
    transform 0.22s ease-out,
    opacity 0.2s ease;
}
.settings-modal-enter-from,
.settings-modal-leave-to {
  opacity: 0;
}
.settings-modal-enter-from .settings-modal__window,
.settings-modal-leave-to .settings-modal__window {
  transform: scale(0.96);
  opacity: 0;
}
@media (max-width: 700px) {
  .settings-modal {
    padding: 0;
  }
  .settings-modal__window {
    height: 100%;
    border-radius: 0;
  }
  .settings-modal__sidebar {
    width: 190px;
    flex-basis: 190px;
  }
  .settings-modal__header,
  .settings-modal__scroll {
    padding-left: 1rem;
    padding-right: 1rem;
  }
}
@media (max-width: 520px) {
  .settings-modal__sidebar {
    width: 58px;
    flex-basis: 58px;
    padding-left: 0.35rem;
    padding-right: 0.35rem;
  }
  .settings-modal__sidebar-heading span,
  .settings-modal__nav-item span {
    display: none;
  }
  .settings-modal__sidebar-heading,
  .settings-modal__nav-item {
    justify-content: center;
  }
}
</style>
