<script setup>
import { computed, ref } from "vue";
import SidebarLayout from "primevue/sidebarlayout";
import Sidebar from "primevue/sidebar";
import SidebarAside from "primevue/sidebaraside";
import SidebarPanel from "primevue/sidebarpanel";
import SidebarHeader from "primevue/sidebarheader";
import SidebarContent from "primevue/sidebarcontent";
import SidebarFooter from "primevue/sidebarfooter";
import SidebarGroup from "primevue/sidebargroup";
import SidebarGroupLabel from "primevue/sidebargrouplabel";
import SidebarGroupContent from "primevue/sidebargroupcontent";
import SidebarMenu from "primevue/sidebarmenu";
import SidebarMenuItem from "primevue/sidebarmenuitem";
import SidebarMenuButton from "primevue/sidebarmenubutton";
import SidebarSpacer from "primevue/sidebarspacer";
import SidebarMain from "primevue/sidebarmain";
import Menu from "primevue/menu";
import Avatar from "primevue/avatar";
import Button from "primevue/button";
import Dialog from "primevue/dialog";
import Message from "primevue/message";
import { AlertTriangle, ChevronDown, LogIn, LogOut, MessageSquare, Moon, Plus, Settings2, Sun, X } from "@lucide/vue";
import { useDarkMode } from "../composables/useDarkMode";

const props = defineProps({
  open: { type: Boolean, default: true },
  userName: { type: String, default: "" },
  userAvatar: { type: String, default: "" },
  activeChat: { type: String, default: "referee" },
  unreadChats: { type: Object, default: () => ({}) },
  directChats: { type: Array, default: () => [] },
  joinedChannels: { type: Array, default: () => [] },
  lazerRooms: { type: Array, default: () => [] },
});

const emit = defineEmits(["update:open", "logout", "open-settings", "select-chat", "open-create-lobby", "open-add-channel", "close-chat"]);

const { isDark, toggleDark } = useDarkMode();

const showRoomTypes = computed(() => props.joinedChannels.length > 0 && props.lazerRooms.length > 0);

const profileMenu = ref(null);
const closeConfirmationVisible = ref(false);
const pendingCloseChat = ref(null);

function toggleProfileMenu(event) {
  profileMenu.value.toggle(event);
}

function initials(name) {
  return name.slice(0, 2).toUpperCase();
}

function requestCloseChat(chat) {
  pendingCloseChat.value = chat;
  closeConfirmationVisible.value = true;
}

function confirmCloseChat() {
  if (!pendingCloseChat.value) return;
  emit("close-chat", pendingCloseChat.value.id);
  closeConfirmationVisible.value = false;
  pendingCloseChat.value = null;
}

function cancelCloseChat() {
  closeConfirmationVisible.value = false;
  pendingCloseChat.value = null;
}

const profileMenuItems = computed(() => [
  {
    label: "Settings",
    icon: Settings2,
    command: () => emit("open-settings"),
  },
  { separator: true },
  {
    label: isDark.value ? "Light theme" : "Dark theme",
    icon: isDark.value ? Sun : Moon,
    command: toggleDark,
  },
  { separator: true },
  {
    label: "Log out",
    icon: LogOut,
    class: "app-sidebar__menu-item--danger",
    command: () => emit("logout"),
  },
]);
</script>

<template>
  <SidebarLayout class="app-sidebar-layout">
    <Sidebar id="app-sidebar" collapsible="offcanvas" :overlay="false" :open="open" width="15rem" @update:open="(v) => emit('update:open', v)">
      <SidebarSpacer />
      <SidebarAside>
        <SidebarPanel>
          <SidebarHeader>
            <div class="app-sidebar__logo"><span class="app-sidebar__logo-mark">Whistle</span><span>Ref</span></div>
          </SidebarHeader>

          <SidebarContent>
            <SidebarGroup>
              <SidebarGroupLabel>Chats</SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu>
                  <SidebarMenuItem>
                    <SidebarMenuButton :isActive="activeChat === 'bancho'" @click="emit('select-chat', 'bancho')">
                      <MessageSquare :size="15" />
                      <span class="app-sidebar__chat-label">BanchoBot</span>
                      <span v-if="unreadChats.bancho" class="app-sidebar__chat-unread" role="status" aria-label="New messages" />
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                  <SidebarMenuItem v-for="chat in directChats" :key="chat.id" class="app-sidebar__chat-item">
                    <SidebarMenuButton :isActive="activeChat === chat.id" @click="emit('select-chat', chat.id)">
                      <MessageSquare :size="15" />
                      <span class="app-sidebar__chat-label">{{ chat.label }}</span>
                      <span v-if="unreadChats[chat.id]" class="app-sidebar__chat-unread" role="status" aria-label="New messages" />
                    </SidebarMenuButton>
                    <button v-tooltip.top="'Close chat'" type="button" class="app-sidebar__chat-close" :aria-label="`Close ${chat.label} chat`" @click.stop="requestCloseChat(chat)">
                      <X :size="11" />
                    </button>
                  </SidebarMenuItem>
                  <SidebarMenuItem
                    v-for="channel in joinedChannels"
                    :key="channel.id"
                    class="app-sidebar__chat-item"
                    :class="{
                      'app-sidebar__chat-item--closed': channel.closed,
                    }"
                  >
                    <SidebarMenuButton :isActive="activeChat === channel.id" @click="emit('select-chat', channel.id)">
                      <MessageSquare :size="15" />
                      <span class="app-sidebar__chat-label-group">
                        <span class="app-sidebar__chat-label">{{ channel.lobby?.name || channel.label }}</span>
                        <span v-if="showRoomTypes" class="app-sidebar__chat-type">Stable</span>
                      </span>
                      <span v-if="unreadChats[channel.id]" class="app-sidebar__chat-unread" role="status" aria-label="New messages" />
                    </SidebarMenuButton>
                    <button
                      v-tooltip.top="'Close chat'"
                      type="button"
                      class="app-sidebar__chat-close"
                      :aria-label="`Close ${channel.lobby?.name || channel.label} chat`"
                      @click.stop="requestCloseChat(channel)"
                    >
                      <X :size="11" />
                    </button>
                  </SidebarMenuItem>
                  <SidebarMenuItem
                    v-for="room in lazerRooms"
                    :key="room.id"
                    class="app-sidebar__chat-item"
                    :class="{
                      'app-sidebar__chat-item--closed': room.closed,
                    }"
                  >
                    <SidebarMenuButton :isActive="activeChat === room.id" @click="emit('select-chat', room.id)">
                      <MessageSquare :size="15" />
                      <span class="app-sidebar__chat-label-group">
                        <span class="app-sidebar__chat-label">{{ room.label }}</span>
                        <span v-if="showRoomTypes" class="app-sidebar__chat-type">Lazer</span>
                      </span>
                      <span v-if="unreadChats[room.id]" class="app-sidebar__chat-unread" role="status" aria-label="New messages" />
                    </SidebarMenuButton>
                    <button v-tooltip.top="'Close chat'" type="button" class="app-sidebar__chat-close" :aria-label="`Close ${room.label} chat`" @click.stop="requestCloseChat(room)">
                      <X :size="11" />
                    </button>
                  </SidebarMenuItem>
                  <SidebarMenuItem>
                    <SidebarMenuButton @click="emit('open-create-lobby')">
                      <Plus :size="15" />
                      <span>Create lobby</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                  <SidebarMenuItem>
                    <SidebarMenuButton @click="emit('open-add-channel')">
                      <LogIn :size="15" />
                      <span>Add a channel</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          </SidebarContent>

          <SidebarFooter>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton class="app-sidebar__profile-button" aria-haspopup="true" aria-controls="profile_menu" @click="toggleProfileMenu">
                  <Avatar v-if="userAvatar" :image="userAvatar" shape="circle" class="app-sidebar__avatar" />
                  <Avatar v-else :label="initials(userName || '?')" shape="circle" class="app-sidebar__avatar" />
                  <span>{{ userName }}</span>
                  <ChevronDown :size="15" class="app-sidebar__profile-chevron" />
                </SidebarMenuButton>
                <Menu id="profile_menu" ref="profileMenu" class="app-user-menu" :model="profileMenuItems" :popup="true">
                  <template #item="{ item }">
                    <div class="app-sidebar__menu-item" :class="item.class">
                      <component :is="item.icon" :size="15" />
                      <span>{{ item.label }}</span>
                    </div>
                  </template>
                </Menu>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarFooter>
        </SidebarPanel>
      </SidebarAside>
    </Sidebar>

    <Dialog v-model:visible="closeConfirmationVisible" modal dismissableMask :closable="false" class="command-confirm-dialog" :pt="{ mask: { class: 'app-dialog-mask' } }" :style="{ width: '28rem' }">
      <Message severity="warn" variant="simple" :closable="false" class="command-confirm-message">
        <template #icon>
          <AlertTriangle :size="20" class="command-confirm-message__icon" />
        </template>
        <div class="command-confirm-message__content">
          <strong>Close this chat?</strong>
          <span> Are you sure you want to close “{{ pendingCloseChat?.label }}”? </span>
        </div>
      </Message>

      <template #footer>
        <Button label="Cancel" text severity="secondary" @click="cancelCloseChat" />
        <Button label="Close" @click="confirmCloseChat" />
      </template>
    </Dialog>

    <SidebarMain class="app-sidebar-main">
      <slot />
    </SidebarMain>
  </SidebarLayout>
</template>

<style>
.app-sidebar-layout {
  height: 100%;
  min-height: 100%;
}

.app-sidebar-layout .p-sidebar-aside,
.app-sidebar-layout .p-sidebar-panel {
  height: 100%;
  min-height: 100vh;
}

.app-sidebar-layout .p-sidebar-aside {
  position: absolute;
}

.app-sidebar-layout .p-sidebar-panel {
  border-right: 1px solid var(--app-border);
  background: var(--app-panel-gradient) !important;
  box-shadow: 1rem 0 3rem rgba(0, 0, 0, 0.12);
  backdrop-filter: blur(18px);
}

.app-sidebar-layout .p-sidebar,
.app-sidebar-layout .p-sidebar-aside {
  background: transparent !important;
}

.app-sidebar-layout .p-sidebar-header {
  padding: 1rem 1.15rem 0.85rem;
}

.app-sidebar-layout .p-sidebar-content {
  padding: 0.35rem 0.55rem;
}

.app-sidebar-layout .p-sidebar-footer {
  padding: 0.7rem 0.55rem 0.85rem;
}

.app-sidebar__logo {
  padding: 0.15rem 0.3rem;
  color: var(--app-text);
  font-family: "Nunito", "Manrope", sans-serif;
  font-size: 1.6rem;
  font-weight: 800;
  letter-spacing: -0.02em;
  user-select: none;
}

.app-sidebar__logo-mark {
  color: var(--app-primary);
}

.app-sidebar-layout .p-sidebar-group-label {
  padding: 0.55rem 0.7rem 0.45rem;
  color: var(--app-muted);
  font-size: 0.68rem;
  font-weight: 700;
  letter-spacing: 0.05em;
  text-transform: uppercase;
}

.app-sidebar-layout .p-sidebar-menu-button {
  min-height: 2.3rem;
  padding: 0.5rem 0.7rem;
  border: 1px solid transparent;
  border-radius: 0.6rem;
  color: var(--app-muted);
  font-family: inherit;
  font-size: 0.8rem;
  font-weight: 600;
  transition:
    background-color 160ms ease,
    border-color 160ms ease,
    color 160ms ease;
}

.app-sidebar-layout .p-sidebar-menu-button .app-sidebar__chat-label {
  min-width: 0;
  flex: 1 1 auto;
}

.app-sidebar-layout .p-sidebar-menu-button .app-sidebar__chat-label-group {
  display: flex;
  min-width: 0;
  flex: 1 1 auto;
  flex-direction: column;
  gap: 0.08rem;
  line-height: 1.1;
}

.app-sidebar-layout .p-sidebar-menu-button .app-sidebar__chat-type {
  color: var(--app-muted);
  font-size: 0.61rem;
  font-weight: 600;
  letter-spacing: 0.02em;
  line-height: 1;
}

.app-sidebar-layout .app-sidebar__chat-item {
  position: relative;
}

.app-sidebar-layout .app-sidebar__chat-item--closed {
  opacity: 0.5;
}

.app-sidebar-layout .app-sidebar__chat-item--closed:hover {
  opacity: 0.72;
}

.app-sidebar-layout .app-sidebar__chat-close {
  position: absolute;
  top: -0.1rem;
  right: -0.1rem;
  z-index: 2;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 1.05rem;
  height: 1.05rem;
  padding: 0;
  border: 1px solid var(--app-border);
  border-radius: 50%;
  background: var(--app-surface-raised);
  color: var(--app-muted);
  opacity: 0;
  cursor: pointer;
  transition:
    opacity 150ms ease,
    color 150ms ease,
    background-color 150ms ease,
    border-color 150ms ease;
}

.app-sidebar-layout .app-sidebar__chat-item:hover .app-sidebar__chat-close,
.app-sidebar-layout .app-sidebar__chat-close:focus-visible {
  opacity: 1;
}

.app-sidebar-layout .app-sidebar__chat-close:hover {
  border-color: rgba(255, 107, 126, 0.38);
  background: rgba(255, 107, 126, 0.12);
  color: var(--app-red);
}

.app-sidebar__chat-unread {
  width: 0.48rem;
  height: 0.48rem;
  flex-shrink: 0;
  margin-left: auto;
  border-radius: 50%;
  background: var(--app-primary);
  box-shadow: 0 0 0 0.16rem rgba(var(--app-primary-rgb), 0.12);
}

.app-sidebar-layout .p-sidebar-menu-button:hover {
  border-color: var(--app-border);
  background: var(--app-surface-hover);
  color: var(--app-text);
}

.app-sidebar-layout .p-sidebar-menu-button[data-active="true"],
.app-sidebar-layout .p-sidebar-menu-button[aria-current="page"] {
  border-color: rgba(var(--app-primary-rgb), 0.18);
  background: rgba(var(--app-primary-rgb), 0.14);
  color: var(--app-text);
}

.app-sidebar-layout .p-sidebar-menu-button svg {
  color: var(--app-purple-bright);
}

.app-sidebar-layout .p-sidebar-menu-button:not([data-active="true"]):not([aria-current="page"]) svg {
  color: var(--app-muted);
}

.app-sidebar-layout .p-sidebar-footer .p-sidebar-menu-button {
  gap: 0.6rem;
  color: var(--app-text);
}

.app-sidebar-layout .p-sidebar-footer .app-sidebar__profile-button {
  gap: 0.6rem;
  padding: 0.35rem 0.45rem;
}

.app-sidebar__profile-chevron {
  margin-left: auto;
  color: var(--app-muted);
  transition: transform 160ms ease;
}

.app-sidebar__avatar {
  width: 1.7rem;
  height: 1.7rem;
  border: 1px solid var(--app-border-strong);
  background: var(--app-surface-hover);
  color: var(--app-text);
  font-size: 0.6rem;
  font-weight: 700;
  flex-shrink: 0;
}

.app-sidebar__menu-item {
  display: flex;
  align-items: center;
  gap: 0.55rem;
  padding: 0;
  border-radius: 0.4rem;
  color: var(--app-text);
  cursor: pointer;
}

.app-sidebar__menu-item:hover {
  background: var(--app-surface-hover);
}

.app-sidebar__menu-item--danger {
  color: var(--app-red);
}

.app-user-menu {
  --p-menu-background: var(--app-surface);
  --p-menu-border-color: var(--app-border);
  min-width: 13rem;
  padding: 0.45rem;
  border: 1px solid var(--app-border);
  border-radius: 0.75rem;
  background-color: var(--app-surface) !important;
  background-image: var(--app-panel-gradient) !important;
  box-shadow: 0 1rem 2rem rgba(0, 0, 0, 0.24);
}

.app-user-menu .p-menu-list {
  background: transparent !important;
}

.app-user-menu .p-menu-item-content {
  border-radius: 0.5rem;
  background: transparent !important;
}

.app-user-menu .p-menu-item-link {
  width: 100%;
  min-height: 1.95rem !important;
  padding: 0 !important;
  border: 1px solid transparent;
  border-radius: 0.5rem;
  background: transparent !important;
  color: var(--app-text);
  font-family: inherit;
  font-size: 0.8rem !important;
  line-height: 1.2 !important;
}

.app-user-menu .app-sidebar__menu-item {
  width: 100%;
  min-height: 1.95rem;
  gap: 0.55rem;
  padding: 0.3rem 0.65rem;
  border: 1px solid transparent;
  border-radius: 0.5rem;
  font-size: 0.8rem;
  line-height: 1.2;
}

.app-user-menu .p-menu-item-link:hover,
.app-user-menu .p-menu-item-content:hover,
.app-user-menu .app-sidebar__menu-item:hover {
  border-color: rgba(var(--app-primary-rgb), 0.18);
  background: rgba(var(--app-primary-rgb), 0.14);
}

.app-user-menu .p-menu-item-link:hover {
  background: transparent !important;
}

.app-user-menu .p-menu-item-icon {
  width: 1rem;
  height: 1rem;
  margin-right: 0.05rem;
  color: var(--app-primary-bright);
}

.app-user-menu .app-sidebar__menu-item svg {
  width: 1rem;
  height: 1rem;
  flex-shrink: 0;
  color: var(--app-primary-bright);
}

.app-user-menu .p-menu-separator {
  margin: 0.25rem 0;
  border-top-color: var(--app-border);
}

.app-user-menu .app-sidebar__menu-item--danger,
.app-user-menu .app-sidebar__menu-item--danger .p-menu-item-icon {
  color: var(--app-red);
}

.app-user-menu .app-sidebar__menu-item--danger svg {
  color: var(--app-red);
}

.app-sidebar-main {
  height: 100%;
  min-height: 0;
  overflow-y: auto;
}
</style>
