# `client/src/components/lazer`

Lazer components operate on `roomId`/playlist/room events and call callbacks supplied by App. Their websocket effects occur in App callbacks, except ack watchers that only update local pending UI.

### `BuiltinShortcutsSettings.vue` — lazer built-in shortcut reference

Props visible/disabled; emit visible; static rows and `close` (1–108). `[UI]` Dialog lists room commands and Done.

### `ChatWindow.vue` — lazer room chat

Props lines 45–73: title/chatId/connection/currentUser/referees/messages/scroll token/room size/timer+match countdown/format/roomId/closed/nowPlaying/playlist/current item/progress/team names/mappool/get state. Emits are `send`, sidebar, send-command, create-lobby, download history, mappool-action (source 84). Functions lines 100–604 mirror stable ChatWindow: draft history, focus/typing, nick/team/highlight/link segments, mappool parser/status/action chips, smooth scrolling/new-message count, global keyboard, send and command forwarding. Lazer-only rendering shows match countdown, playlist item linkage and room-close state (template 620–1197). `[дубль]` of stable ChatWindow with additional playlist/countdown fields.

### `CommandBar.vue` — lazer room command launcher

Props docked/disabled/roomId/startCountdownSeconds (13–17), emits send-command. Computed command groups and methods lines 20–209 mirror stable launcher; room-specific start/abort/lock/roll/leave commands include room id, warning confirmation, drag reorder and ShortcutEditDialog. UI lines 210–603 adds countdown/room controls. `[дубль]` stable CommandBar for common shortcut CRUD.

### `LobbyScoreCard.vue` — lazer score/result card

Props stable score fields plus `roomLink`, `lazerMode`, `referees` (12–29); emits same score/qualification/result/settings/configure/referees contract. State/computed/functions lines 31–218 mirror stable card; room link/referee rendering appears in template 230–830. `[дубль]` stable card for score editing/result templates; actual lazer result loading is App.

### `LobbySetupDialog.vue` — lazer room setup

Props visible/disabled/loading/initialQueueMode/initialMatchType/initialMaxParticipants (9–15), emit visible/send. State refs and `maxParticipantsLabel` (16–37); `send` (39–45) emits `{queue_mode,match_type,max_participants}`. Watcher (47–66) syncs initial values. UI (68–209) selects queue/match type and participant limit, with loading/disabled states.

### `MappoolCard.vue` — lazer pool/chips

Props disabled/lobbyId/roomId/qualificationMode (11–15), emits send-command/pick-map. `lobbyKey`, active/filter/groups computed and `send/mapState/runAction/actionLabel/rulesetNumber` (17–100); pool menu position/select/close/Escape/lifecycle (101–150). Template 152–762 adds required/allowed mod labels and room-compatible action commands. `[дубль]` stable card for pool selection/action UI.

### `MappoolsModal.vue` — lazer mappool editor

Prop visible, emit visible; pool/slot/editor/delete/import/preview/menu refs (lines 18–60). Delete/cache/expand/category/editor/win-template/menu/preview/export/import/test functions (61–681) mirror stable modal but normalize lazer required/allowed mods and playlist-compatible win conditions. UI 682–1100+ has pool/category/beatmap CRUD, mod configuration entry, win condition, previews, bulk import/export and invalid pool confirmation. `[дубль]` stable MappoolsModal for common CRUD; lazer-specific mod fields and `PlaylistModsModal` path are unique.

### `NextMap.vue` — playlist next-map management

Props visible/disabled/roomId/items/currentItemId/playlist mode and callbacks (14–19); emits visible. State open/id/submitting/removing/swapping/mod dialog (21–27). `orderedItems`, `nextItem`, parsed id/swap/mod computed (33–40). `itemLabel/Mapper/Meta/Mods/Ruleset/Background`, `loadBeatmap`, `loadPlaylistBeatmaps`, `itemUrl` (42–109) `[логика/UI]` fetch/cache beatmaps with App requestApi. `open`, `add`, `beginSwap`, `openModsSettings`, `handleEscape`, `remove` (111–164) add/swap/remove playlist items and open mod editor. lastEvent watcher (165–179) handles ack/error; item watcher loads data; mounted/unmounted Escape. UI 193–812: configure dialog, Beatmap ID, add/swap, ordered playlist, replace/remove, mod settings and loading/error states.

### `NowPlaying.vue` — lazer beatmap progress

Props map/team names/progress flags (8–15), state/progress functions/watchers/lifecycle (17–85) same as stable; computed status/url/background/mods/picked-by (86–154), template 156–372 adds lazer ruleset and mod display. `[дубль]` stable NowPlaying.

### `PlayerListCard.vue` — lazer room player list

Props players/team names/currentUser/disabled/fullSlots/roomId (24–35), emit open-players. `visiblePlayers`, `realPlayerCount` (66–67), color/initials/style difficulty/mod acronym/icon/info/more tooltip functions (69–180) render team, style-change and mods; Manage players opens dialog. No network.

### `PlayersDialog.vue` — invite, drag, team and kick

Props visible/players/roomId/disabled (13–18); emits visible/move-player (20). State dragged player/slot/user id/pending flags (21–26); parsed invite/slot computed (31–34). `close`, `invite` (36–61) accept username/id and invoke App-supplied invitation; `toggleTeam` (62–70) changes team; drag start/end/over/leave/drop (71–101) move player to slot; `kickPlayer` (102–110); style helpers (111–135). Watcher (136–147) resets; `lastEvent` watchers (148–177) clear pending on matching ack/error. UI (185–246) invite input/Enter, draggable player rows, team toggle and kick, disabled/loading states.

### `PlaylistModsModal.vue` — required/allowed mod editor

Props visible/item/ruleset/disabled; emits visible/save-mods (21–31). State picker kind, saving, freestyle/customize hover/select (34–44). Computed ruleset map/categories/picker size/customizable/preview (85–115). Helpers lines 117–365 normalize mod entries/settings, beatmap difficulty-dependent ranges/options, SVG/tooltip previews and conflict text. `syncFromItem`, picker open/commit, customize hover/select/close (366–439); conflict removal, toggle/category/selectAll/deselectAll/blocked, icon and tooltip functions (440–581); `payload`, `save` (582–609) emits required/allowed mod arrays/settings. `onKeydown`, watchers, `lastEvent`, lifecycle (610–661) handle Escape, prop sync, save ack/error. UI (682–1315) has required/allowed selectors, category grid, select all/deselect, per-mod settings, conflicts, freestyle toggle, cancel/save/loading. No direct websocket.

### `RefereesDialog.vue` — lazer referee management

Props visible/referees/roomId/disabled; emit visible. State userId/pending and computed target/valid (11–25). `close`, async `add`, `remove` (27–62) accept user id/name and invoke App callback; watcher clears state; `lastEvent` watcher (71–83) resolves matching ack/error. UI (91–121) input/Enter/Add and referee list Remove, Escape close.

### `RoomInfoPanel.vue` — lazer room summary

Props size/timer/format/roomId/roomLink/lock state and match data (4–12). Static display template (14–113) shows room id/link, size, timer, format and state; no emits/local effects.

