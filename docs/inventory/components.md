# `client/src/components`

Ниже перечислены общие компоненты. Все `[UI]`, если не отмечено иначе: они зависят от Vue/PrimeVue/DOM. В компонентах нет слотов, кроме явно указанных.

## Диалоги и страницы

### `AddChannelDialog.vue` — join stable/lazer channel

Props `visible`, `loading` (9–11); emits `update:visible`, `join` (13). State `channelInput`, `channelType` (15–16). `match`/`isValid` (25–35) `[логика]` распознают `#channel`/room input и разрешённый type. `close`, `join`, `updateVisible` (37–67) закрывают, нормализуют input и emit payload; watcher visible (69–78) очищает форму. UI (80–128): SelectButton type, text input, Enter, Cancel/Join; Join disabled/loading and empty invalid state.

### `CreateLobbyDialog.vue` — форма создания stable/lazer

Props `visible`, `disabled`, `loading` (13–26); emits `update:visible`, `create` (16). State mode/acronym/teams/qualifier/bestOf/ruleset/matchType/queue/beatmap/maxParticipants (28–40). `isLazer`, `maxParticipantsLabel` (42–43), `command`, `lobbyName`, validations (89–117) `[логика]` build stable `!mp make` command or lazer payload; `stripOuterParentheses`, `parseLobbyName`, `handleLobbyPaste` (54–88) normalize pasted lobby name; `close`, `create`, `resetForm` (119–181) emit/clear; watcher (182–188) resets on open. UI (190–309): mode selector changes fields, acronym/team/qualifier inputs, best-of, team type, queue mode, beatmap id, participant slider and parentheses toggle; Create disabled if invalid.

### `LoginPage.vue` — IRC/server and osu OAuth login

Props initial login/loading/osu credentials/profile/loading/error/callback URL (10–18); emits login, save-osu-credentials, osu-login, osu-logout, copy-callback (19). State fields and setup step (21–28); `showSetup`, `currentStepText` (29–32). `submit`, `saveOsuCredentials`, `loginFromOsu`, `editCredentials`, `logoutFromOsu`, `copyCallbackUrl` (35–82) validate and emit; watchers (84–105) sync props and reset submitted flags. UI (108–212) has a 2-step osu setup, copy callback button, Login from osu!, edit/logout, login/password/remember-me and loading/error displays. Enter submits forms; login field is disabled when supplied by server.

### `SettingsModal.vue` — searchable settings shell

Props `visible`; emit `update:visible` (7–8). State active category/search/DOM refs/match map (18–22), `activeSlot` computed (23). `close` (25–27) emits close; `onKeydown` (29–31) closes Escape; `applySearch` (33–57) reads text from `.settings-page__setting`, toggles hidden rows/categories. watcher (59–68) recalculates for query/category/visibility; mounted/unmounted (67–71) manage document keydown. Slots are named by category (`app`, `chat`, `notifications`, `shortcuts`, etc.; template 75–144), so concrete settings come from App and child components. UI has backdrop, category buttons, search, close and slot content.

### `UpdateDialog.vue` — update available/downloading/install state

Props visible, mode, current/latest version, release URL, downloaded/total bytes, speed, error (8–17); emits visible/update/cancel (19). computed progress/MB/s/ETA (21–29) `[логика]`; `formatMb`, `formatDuration` (30–38) `[логика]`; `openReleaseNotes` (40–43) opens external URL. UI (45–81) shows available, progress, error or downloaded state, release notes, Later/Update now/Cancel/install controls; no local persistence.

### `BulkBeatmapImportDialog.vue` — batch import map IDs into categories

Props visible/pool; emits visible/import (12–13). State source, category rows, processing/progress (16–20). `ids`, `allocated`, `allocationValid`, `progress` (22–45) `[логика]` parse unique numeric ids and validate category/count allocation. `reset`, watcher, `addRow`, `removeRow`, `close` (47–73) manage form. `assignments` (74–85) allocates ids by row counts; `makePreview` (86–98) creates map placeholder; `parseBeatmap` (99–103) calls external `/api/beatmaps/:id` through injected request path; `finishImport` (104–130) merges successes/failures; `startImport` (131–151) processes asynchronously and emits import. UI (153–204): textarea IDs, category/count rows, add/remove, progress/error, import disabled until valid.

### `LobbyMessagesSettings.vue` — editable result message presets

Prop visible, emit visible (13–14). State selected preset/message, drafts, dirty baseline/close confirmation (18–23). `selectedPreset/selectedMessage` computed (25–26); `loadPreset`, `loadMessage`, `snapshot`, `syncBaseline`, `saveMessage` (28–84) edit drafts; `isDirty` (53). `selectPreset`, `selectMessage`, `createPreset`, `createMessage`, `deleteMessage`, `deletePreset`, `chooseActivePreset`, `updateMessageEnabled`, `saveChanges` (85–148) call `useLobbyMessages`. `requestClose`, visibility handler, discard/save-close, variable insertion helpers, `onVisible` (149–204) implement unsaved-changes confirmation and template variable buttons. UI (214–339): preset list, active badge, message ordering/toggle, label/content editor, variable buttons, save/delete and confirm dialog. No websocket.

## Generic controls

### `SliderInputNumber.vue` — slider with click-to-edit number

Props modelValue/min/max/step/disabled/label/settingLabel/stacked; emits `update:modelValue` (6–18). `isStacked`, `stepPrecision`, `displayValue` computed (20–44) `[логика/UI]`; `roundToPrecision`, `clamp`, `update` (30–43) clamp/round/emit; `startEditing`, `updateDraft`, `commitEditing`, `cancelEditing` (45–66) toggle InputNumber, Enter commit, Escape cancel. UI (69–98) slider or inline input with mouse/double-click editing.

### `TagInput.vue` — editable token list

Props modelValue, placeholder, disabled; emits model update (3–8). `add`, `onKeydown`, `remove`, pointer/click/key handlers, `removeLast`, `onWheel` (10–59) `[UI]` trim/dedupe token, support Enter/comma, remove buttons, Backspace last token and prevent wheel changing surrounding controls. UI (61–85) chips with remove and input; keyboard controls are Enter, comma, Backspace.

### `ModIconList.vue` — mod icons/tooltips

Props mods, rulesetId, max, settings (11–27). `svgBody`, `viewBoxOf`, `modInfo`, setting/default/customized/format helpers, `modSettingsTooltip`, `extenderText`, `modIconSvg`, `moreModsIconSvg`, `escapeHtml`, `moreModsTooltip` (29–189) `[логика/UI]` read `mods.json` and SVG assets, normalize acronyms, render customized settings and interactive tooltip for hidden mods. computed normalized/visible/hidden/ruleset mods (43–61). UI (191–237) displays icons and “+N” tooltip; no state/network.

### `MonakoEditor.vue` — Monaco text editor

Props modelValue, language, theme, options; emits model update (13–17). `onMounted` (25–42) creates Monaco editor, listens content changes and emits; watcher (43–56) updates external value without echo; `onBeforeUnmount` disposes editor (57). UI is editor container (59–70); no slot.

### `WinConditionEditor.vue` — script editor/tester

Props modelValue, slotId, lazerMode; emits model update/test (7–8). State red/blue sample score/result; watcher (12–16) resets result on source; `test` (17–38) emits source, slot and sample context; `applyTestResult` (40–43) records result. UI (45–64) Monaco editor, red/blue inputs, Test button and success/error/system messages.

### `SvgMarkup.vue` — raw SVG renderer

Prop `markup` (2–5). Template uses `v-html` (7–11). `[UI]` no functions/events; caller must provide trusted sanitized markup.

### `SidebarSectionCard.vue` — titled sidebar section wrapper

Props title/icon/collapsible/expanded (2–7); template (9–65) exposes default slot and optional header toggle. No emits or local state; parent controls expanded.

### `MainScreen.vue` — пустой legacy-компонент

Файл содержит только пустой `<template>` (1–3) и не импортируется из `App.vue`; `[мёртвый код]`, пользовательского поведения нет.

## Shortcut settings

### `ShortcutEditDialog.vue` — custom shortcut editor/import conflict resolver

Props visible, shortcut, existingShortcuts, importedShortcuts (14–26); emits visible/save/delete/import (23). computed edit/import/conflicts/current/rename validation/canRename/counts/preview/color/name/canSave (28–115) `[логика/UI]`; form state (57–66). `close`, `save`, file picker/process/finalize import, `resolveCurrent`, rename/remove (116–197) validate, import JSON, resolve overwrite/skip/rename conflicts and emit. UI (198–316): command/name/description/icon/color/warning fields, import file, conflict controls, skip/overwrite/add-as-new, save/delete/cancel.

### `ShortcutImportExportSettings.vue` — settings wrapper for shortcut files

State file inputs/imported list (12–15). `exportCurrentShortcuts` (17–20) calls export; `openImportPicker`, `handleFileSelected`, `handleImport` (22–62) parse/conflict-check through composables, show Toast and pass items into `ShortcutEditDialog`. UI (63–164) Import/Export buttons, empty/duplicate/error feedback.

### `AppSidebar.vue` — chat navigation/profile

Props open, activeChat, currentUser, directChats, joinedChannels, unreadChats, lazerRooms (26–35); emits open/logout/settings/select-chat/create/add-channel/close-chat (37). `showRoomTypes` computed (41); refs profile menu and close confirmation (43–45). `toggleProfileMenu`, `initials`, `requestCloseChat`, `confirmCloseChat`, `cancelCloseChat` (47–70) `[UI]` open profile menu and confirm closing room/channel. `profileMenuItems` (72–91) defines Settings/Logout. UI (94–231): Bancho, DM, stable channels, lazer rooms with unread indicators, create/join buttons, profile menu, close confirmation; default slot at 231 for extra content.
