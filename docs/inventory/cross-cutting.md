# Сквозной функциональный справочник

## Экраны и модальные окна

1. Login screen: `App.vue` 4000+ switches to `LoginPage.vue` 108–212. User enters server login/password, optionally remembers it, configures osu OAuth client id/secret, copies callback, authorizes or logs out osu. Success returns to app; errors are rendered from App props.
2. Main app: `App.vue` 4000–4969 renders `AppSidebar` and selected chat. Sidebar chooses Bancho, DM, stable channel or lazer room; unread markers are cleared by `selectChat` App 2370–2375.
3. Stable chat: `stable/ChatWindow.vue` 578–669 plus `CommandBar`, `LobbyScoreCard`, `PlayerListCard`, `MappoolCard`, `NowPlaying`, `RoomInfoPanel`. Buttons open create/add-channel, player/referee dialogs, lobby setup, mappools and settings. Close channel/room uses App confirmation flow.
4. Lazer room chat: `lazer/ChatWindow.vue` plus room/playlist/player/mod components; playlist/current-map and match countdown are visible. Room state changes arrive through App watcher.
5. Settings modal: `SettingsModal.vue` 75–144 is a category/search shell. Slots supplied by App contain appearance, chat highlighting, notifications, now-playing, shortcuts, lobby messages and import/export controls.
6. Stable modals: `CreateLobbyDialog`, `AddChannelDialog`, stable `LobbySetupDialog`, `PlayersDialog`, `RefereesDialog`, `MappoolsModal`, `BulkBeatmapImportDialog`, `WinConditionEditor`, `UpdateDialog`, `LobbyMessagesSettings`.
7. Lazer modals: lazer `LobbySetupDialog`, `PlayersDialog`, `RefereesDialog`, `MappoolsModal`, `NextMap`, `PlaylistModsModal`, plus shared update/settings/shortcut dialogs.

## Чат, маппул и фазы

ChatWindow stable/lazer calls `parseMappoolMessage` and uses `createMappoolChatContext`/`advanceMappoolChatContext` in App. Slot chips are built from active pool slots; status comes from `getMapState`, and click emits `mappool-action` to App (`stable/ChatWindow.vue` 323–363; `lazer/ChatWindow.vue` 371–382). `useMappoolChat.js` supports English/Russian ban/protect/pick vocabulary, Cyrillic aliases, nearest action in a clause, and terminal finished phase. Stable and lazer contexts are independent per chat id in App.

## Chips and actions

`MappoolCard` groups slots by category and maps current state to allowed action buttons. App `handleMappoolPick`/`handleLazerMappoolPick` writes local slot state and sends command (App 3847–3957). MappoolsModal stores pool definitions and per-lobby slot state; win condition sources are generated in `useMappool.js` and optionally tested by `WinConditionEditor` through `test_win_condition`.

## Горячие клавиши и шорткаты

Chat input: Enter sends, Shift+Enter inserts newline, Escape/focus/global handler behavior is in ChatWindow 497–576. TagInput supports Enter/comma/Backspace (TagInput 24–59). Settings closes with Escape (SettingsModal 29–31). Mappool headers use Enter/Space and editors use Enter/Escape (stable MappoolsModal 678–739; lazer equivalent 693–754). Lazer player rows support drag-and-drop (lazer PlayersDialog 71–101); stable CommandBar custom shortcuts support drag reorder (stable CommandBar 166–184). `useShortcuts` stores built-in warnings, timer delay/seconds and custom commands; CommandBar sends command text through App.

## Автообновление, таймеры и now-playing

App checks updates on initial mounted flow (App 1130–1204), handles update events in lastEvent watcher (419–879, 1205–1236), displays `UpdateDialog`, starts/cancels/downloads/install. App’s mounted interval (2117–2126) recalculates lobby countdowns. Lazer local countdowns are managed by `startLazerCountdown` and abort functions (3393–3469). NowPlaying components calculate progress from map timestamps and use `useNowPlayingSettings`; map/profile/beatmap API data is cached by `useLazerRoomResourceCache`.

## Настройки и локальное хранение

All keys and formats are enumerated below; migrations are only the template-key/content migrations in `useLobbyMessages` 18–54 and normalization of old mappool/shortcut records in composables. No generic versioned migration registry exists. Invalid JSON generally falls back to defaults; storage writes are reactive and immediate.

### Таблица локальных данных

| Storage | Key | Формат/содержимое | Чтение и запись |
|---|---|---|---|
| localStorage | `whistleref-remembered-login` | plain username string, not password | App 61, 1127, 1245–1249, 1292 |
| localStorage | `whistleref-theme` | `dark`/`light` | `useDarkMode.js` 6, 93–97 |
| localStorage | `whistleref-primary` | hex color | `useDarkMode.js` 8, 99–108 |
| localStorage | `whistleref-chat-settings` | JSON settings object for refs/colors/words/styles/modes/fullSlots | `useChatSettings.js` 21–80 |
| localStorage | `whistleref-notification-settings` | JSON booleans plus sound/trigger strings | `useNotifications.js` 3, 46–70 |
| localStorage | `whistleref-now-playing-settings`, `...-progress`, `...-progress-label` | stringified booleans | `useNowPlayingSettings.js` 3–9 |
| localStorage | `whistleref-shortcuts-custom` | JSON custom shortcut array | `useShortcuts.js` 4, 56–65 |
| localStorage | `whistleref-shortcuts-start-delay`, `whistleref-shortcuts-timer-seconds` | JSON number | `useShortcuts.js` 5–6, 58–59 |
| localStorage | `whistleref-shortcuts-warnings` | JSON warning map | `useShortcuts.js` 7, 60–61 |
| localStorage | `whistleref-lobby-message-presets` | JSON `{presets,activePresetId}` | `useLobbyMessages.js` 97–152 |
| localStorage | `whistleref-mappool-state`, `whistleref-lazer-mappool-state` | JSON maps by lobby id: qualification, slot states, active pool | `useMappool.js` 3,142–199 |
| localStorage | `whistleref-mappools`, `whistleref-lazer-mappools` | JSON serialized pool arrays | `useMappool.js` 158–199 |
| localStorage | `whistleref-lobby-player-profiles` | JSON `{chatId:{normalizedNick:{username,userId,profileUrl,avatarUrl}}}` | App 189–245 |
| localStorage | `whistleref-lazer-room-resource-cache-v3` | JSON room buckets with profiles/beatmaps | `useLazerRoomResourceCache.js` 4–21 |
| localStorage | `whistleref-beatmap-preview-cache-v2` / `-v3` | JSON preview cache; stable/lazer use separate generations | stable/lazer MappoolsModal 59–120 |
| localStorage | `whistleref-mappool-delete-confirmations` | JSON per-pool/category/slot confirmation map | stable/lazer MappoolsModal 60–104 |
| sessionStorage | `whistleref-osu-oauth-state` | one OAuth CSRF state string, removed after callback read | `useOsuOAuth.js` 2,13–35 |
| IndexedDB `whistleref` v1 | object stores `credentials`, `osu-auth`; keys `default`, `osu-auth`, `credential-key` | encrypted records and encryption key material | `useRememberedCredentials.js` 1–122 |

Preview cache uses `v2` in stable and `v3` in lazer, so the frontend has no migration between them. The only explicit migrations found are template variable renames/default message replacements (useLobbyMessages 18–54); mappool and shortcut normalization occurs on load rather than through a versioned migration registry.
