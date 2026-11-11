# `client/src/components/stable`

Stable UI работает поверх IRC/`!mp`; App передаёт callbacks, а компоненты сами не открывают websocket.

### `BanchoBotCommandBar.vue` — две быстрые команды BanchoBot

Prop `disabled` (5); emits `send-command`, `create` (6). Template (8–19) has Help, emitting `!help`, and Create lobby buttons. `[UI]`, no local state.

### `BuiltinShortcutsSettings.vue` — справочник встроенных stable shortcuts

Props visible/disabled and emit `update:visible` (8–14). `close` (28–30) emits false. Static `rows` (16–26) describe commands. UI Dialog (32–70) lists each shortcut and closes Done; no mutation of shortcut definitions.

### `ChatWindow.vue` — IRC/DM chat, history and mappool chips

Props lines 44–71: title/chatId/connected/currentUser/referees/messages/autoScrollToken/roomSize/timerActive/timerSeconds/format/winCondition/shortcutMode/roomClosed/nowPlaying/progress flags/team names/mappoolSlots/getMappoolState. Emits `send`, `toggle-sidebar`, `send-command`, `create-lobby`, `download-chat-history`, `mappool-action` (84). State draft/history navigation/input/list/auto-scroll/new-message count (86–91). `teamHighlights`, timer/status computed (33–82).

`currentHistory`, `setHistoryDraft`, `handleDraftInput`, `navigateMessageHistory` (100–146) `[UI]` implement input history and draft updates; focus/typing/insert helpers (148–175) manage keyboard focus. Nick/referee/BanchoBot styling (176–219) and time helpers (221–250) format rows. `messageTextStyle`, URL/ordinary/team segment functions (251–322) `[логика/UI]` linkify text and highlight teams/words. `mappoolStatus`, `actionIcon`, `mappoolSegments`, `renderChatMessageSegments`, `handleMappoolClick` (323–363) call parser/state and emit chip action. `isNearBottom`, `finishAutoScroll`, `cancelAutoScroll`, `animateScrollTo`, `scrollToBottom`, `onScroll`, `onWheel` (370–460) implement smooth scroll/new-message count. Watchers (461–496) scroll on messages/token and reset. `onGlobalKeydown` (497–522) supports focus/send shortcuts; mounted/unmounted (524–531) install global key listener. `send`, `onKeydown`, `forwardCommand` (533–576) emit text, Enter send, Shift+Enter newline and command callback. UI (578–669): menu, status/timer header, scrollable messages, mappool clickable chips, closed download button, new-message button, textarea and send button. `[дубль]` same functional structure as `lazer/ChatWindow.vue`, but stable props include format/winCondition/shortcutMode and stable room commands.

### `CommandBar.vue` — stable built-in/custom command launcher

Props disabled/docked (11–18), emits `send-command` (16). computed `commandGroups` (33–112) `[логика/UI]` merges built-in definitions with `useShortcuts`; `emitCommand`, `sendBuiltin`, `initials`, `sendCustom` (114–141) emit command or open confirmation for warning shortcuts; wheel handler, confirmation handlers (142–165) manage horizontal list and send/cancel. Drag handlers (166–184) reorder custom shortcuts. `openCreate`, `openEdit`, `handleSave` (186–208) open ShortcutEditDialog and update store; builtin modal state (209+). UI (210–313) has groups, draggable shortcuts, edit/add buttons, warning confirm, import editor and built-in settings. `[дубль]` lazer CommandBar has equivalent launcher with room-specific commands.

### `LobbyScoreCard.vue` — score, match settings and result send

Props lines 11–26: lobby/team names/scores/bestOf/nextPick/canEdit/control flags/qualification/mpLink/disabled/referees visibility. Emits score updates, qualification, result, settings, configure, referees (28). State/derived lines 31–70 cover copied, dialogs, accuracy/manual warning, draft settings/result, winner/validation. `changeScore`, click/contextmenu, normalize helpers, `resolveWinner` (85–125) update score and support context-menu decrement; `openResultDialog`, `sendResult`, `sendEditedResult` (126–178) emit result; settings/configure/referee/copy functions (179–219) manage dialogs, copy MP URL and emit. UI (245–437): team score click/context menu, Send Result, Lobby Settings, Copy MP Link, qualification toggle, Configure, Manage referees, edit result and settings dialogs. `[дубль]` lazer LobbyScoreCard adds room/referee props but same score/result flow.

### `LobbySetupDialog.vue` — `!mp set` form

Props visible/disabled/initial game mode/win condition/open slots (8–14); emits visible/send (15). Refs gameMode/winCondition/openSlots (16–18), command computed (31), `reset`, `close`, `send`, visible watcher (32–55) reset and emit `!mp set <mode> <win> <slots>`. UI (57–91) selects mode/win condition/slots and Send/Cancel. `[дубль]` lazer setup emits structured room settings instead.

### `MappoolCard.vue` — selected pool and ban/protect/pick buttons

Props disabled/lobbyId/qualificationMode (10–14), emits send-command/pick-map (15). Refs menu/search/position (17–22), computed lobby key/activePool/filter/groups (25–44). `send`, `mapState`, `runAction`, labels/ruleset (46–100) `[UI]` map a slot state to available actions and emit command/pick. Pool menu open/position/select/close/Escape (101–136), listeners mounted/unmounted (137–150). UI (152–263) searchable pool selector, Open mappools, grouped slots with status and Ban/Protect/Pick actions. `[дубль]` lazer card uses same workflow plus room command semantics.

### `MappoolsModal.vue` — full stable mappool CRUD/editor

Prop visible and emit visible (18–19). State for pool/slot/win editors, expanded sets, delete/import/bulk dialogs, menus and preview cache (23–60). Delete/cache helpers (61–118) read `whistleref-mappool-delete-confirmations` and `whistleref-beatmap-preview-cache-v2`; expand/category helpers (119–165), transition hooks (166–217), pool editor/multiplier validation (218–295), slot editor and win templates (296–366), menu positioning/Escape/lifecycle (367–454), category/slot add-delete (455–479), preview visibility/request/API loading (480–548), export/bulk/import/test (549–646), watchers (647–665). All functions are `[UI]` except normalization/validation helpers; writes through `useMappool`, requests beatmap preview via `requestApi`, test via `test_win_condition`. UI (667–1100+) supports add/edit/export/upload/delete pool, add/rename/delete category, add/edit/delete beatmap, ruleset, FreeMod multipliers, win-condition template/custom Monaco, preview, bulk import and confirmation dialogs. Keyboard: pool/category Enter/Space, rename Enter/Escape, global Escape; resize/scroll reposition menus. `[дубль]` lazer MappoolsModal shares CRUD and adds allowed/required mod structures.

### `NowPlaying.vue` — stable current beatmap progress

Props map/team names/progress flags (9–14). State progress DOM/percent/elapsed/label/delay (17–22). `formatElapsed`, duration/ruleset computed, `updateProgress`, `updateLabelPosition`, `startProgressUpdates` (27–70) `[UI]` calculate from `startTimestamp`, requestAnimationFrame/interval-like timer and label placement; watchers and lifecycle (71–85) restart/cleanup. Status icon/label, URL/background and picked-team computed (86–154). UI renders map cover/title/status, progress bar/time and team picker. `[дубль]` lazer NowPlaying has same component behavior.

### `PlayerListCard.vue` — stable lobby players

Props players/team names/currentUser/disabled/fullSlots (24–32), emit open-players (34). visible/real count computed (64–65). `colorFor`, `initials`, `playerNameStyle`, difficulty/mod helpers and tooltip/SVG functions (69–150) `[логика/UI]` render team colors, profile/avatar and mods. UI list and Manage players button; slots can be hidden depending fullSlots. `[дубль]` lazer version also renders style-change/mod settings.

### `PlayersDialog.vue` — stable player management

Props visible/players/disabled (10–12); emit visible/move-player etc. Template (26–332) shows roster with team/slot controls and kick; keyboard Escape closes. Parent/App sends actual websocket commands. No independent network call.

### `RefereesDialog.vue` — stable referee list

Props visible/referees/disabled; emits visible (source 1–20). Escape handler directly emits close; template is a simple modal list. App owns add/remove behavior. `[дубль]` lazer dialog has add/remove user input and ack watchers.

### `RoomInfoPanel.vue` — stable room summary

Props size/timer/format/winCondition/mode (4–10). Static computed-free template (12–113) displays room size, timer, team format, win condition and osu mode; no emits/state.

