# `client/src/composables`

Composables — единственный слой, похожий на store. Модульные `ref` созданы один раз при импорте и возвращаются из функций; компоненты читают/меняют их через returned refs/methods. Отдельных Pinia stores нет.

## Малые composables

### `useBeatmapAuthors.js` — отображение авторов beatmap

`ownerName(owner)` (1–3) `[логика]` выбирает username/name из owner и fallback `Unknown`. `formatBeatmapOwners(beatmap)` (6–13) `[логика]` собирает mapper/beatmapset creator/authors, убирает дубли и возвращает строку для UI. Используется в App и lazer/stable map cards; запросов/хранилища нет.

### `useBeatmapCover.js` — URL фона cover

`beatmapCoverBackground(beatmapsetId)` (3–10) `[логика]` возвращает osu beatmapset-cover URL или пустую строку для отсутствующего id. Сеть не вызывает.

### `useNickColor.js` — стабильный цвет ника

`hashString(str)` (5–17) `[логика]` считает хеш. `nickColor(author,currentUser)` (20–24) `[логика]` возвращает accent/current-user цвет или один из палитры по хешу; `useNickColor()` (19–26) экспортирует функцию. Состояния и storage нет; используется chat components/App.

### `useMessageHighlighting.js` — правила выделения сообщений

`escapeRegExp` (11–13) `[логика]` экранирует regex; `normalizeTeamHighlights` (15–21) нормализует `{name,color}` команд; `teamTextStyle` (23–25) строит inline color; `normalizeHighlightWords` (27–36) trim/dedupe слов; `normalizeHighlightStyles` (38–41) фильтрует по `HIGHLIGHT_STYLE_OPTIONS`; `highlightTextStyle` (43–64) возвращает CSS style для background/color/border/weight; `messageHasHighlight` (66–76) проверяет целое слово/regex совпадение. Не зависит от Vue, запросов и storage; читатели — App и обе ChatWindow.

### `useNowPlayingSettings.js` — флаги now-playing

Module refs `showNowPlaying`, `showProgressBar`, `showProgressTimeLabel` (4–6) читают `whistleref-now-playing`, `...-progress`, `...-progress-label`; любое значение кроме строки `false` включено. Три watcher (7–9) пишут boolean-строки. `useNowPlayingSettings()` (10–12) возвращает refs. `[UI]`; читатели App/NowPlaying.

### `useNotifications.js` — настройки звука/toast

`soundUrl(filename)` (22–24) `[логика]` создаёт URL `/src/sounds/...`; `NOTIFICATION_SOUNDS` (26–44) перечисляет MP3; `loadSettings` (46–54) `[логика]` читает JSON `whistleref-notifications`, проверяет sound и применяет defaults. Refs настроек (57–62) — soundEnabled, toastEnabled, ignoreBanchoBot, sound, soundTrigger, toastTrigger; deep watcher (66–70) пишет всё в storage. `getNotificationSoundUrl` (72–74) `[логика]` возвращает URL; `useNotifications` (76–78) возвращает refs. Читает/меняет App и Settings.

## Настройки и локальные данные

### `useChatSettings.js` — настройки chat rendering

`loadSettings` (23–40) `[логика]` читает `whistleref-chat-settings`, сливает defaults, нормализует words/styles/colors/modes. Refs (42–55): highlightReferee, highlightBanchoBot, highlightTeams, bot/red/blue/unassigned colors and mode, timestampMode, highlightWords, highlightStyles, highlightColorMode/color, fullSlots. Deep watcher (74–80) `[UI]` сохраняет JSON. `useChatSettings` (82–84) возвращает все refs. Читают App, stable/lazer ChatWindow, SettingsModal; меняют App/settings controls.

### `useDarkMode.js` — тема и primary color

`clamp` (10–12), `hexToRgb` (14–29), `rgbToHsl` (31–59), `hslToHex` (61–75) `[логика]` преобразуют цвет. `applyTheme` (77–91) `[UI]` выставляет `.app-dark` и CSS variables, вычисленные из primary color. `toggleDark` (93–97) переключает и сохраняет `whistleref-theme`; `setPrimaryColor` (99–108) валидирует hex, сохраняет `whistleref-primary`, применяет переменные; `canUseViewTransition` (110–112) проверяет API; `transitionTheme` (114–154) меняет тему с view transition и fallback. `useDarkMode` (156–158) возвращает refs/methods. Инициализация читает localStorage; вызывается App.

### `useLobbyMessages.js` — presets сообщений результата

`migrateTemplateContent` (27–29) и `migrateMessageContent` (50–54) `[логика]` переименовывают старые template keys и мигрируют конкретные старые default strings. `uid` (99–101) генерирует UUID/fallback. `cloneDefaults` (103–108) клонирует defaults. `loadState` (110–129) читает `whistleref-lobby-message-presets`, при ошибке/default создаёт presets. `activePreset` computed (135) выбирает активный; deep watcher (137–152) чинит missing active id и пишет JSON. `addPreset`, `updatePreset`, `removePreset`, `setActivePreset` (154–185) `[логика/UI]` изменяют presets. `addMessage`, `updateMessage`, `removeMessage`, `moveMessage` (187–222) `[логика/UI]` управляют сообщениями. `replaceState` (224–230) заменяет импортированное состояние. `formatLobbyTemplate(content,values)` (232–234) `[логика]` подставляет `{{key}}`, отсутствующее значение становится `—`. `useLobbyMessages` (236–250) экспортирует refs/actions. Читатели — App и LobbyMessagesSettings.

### `useShortcuts.js` — параметры таймера и built-in/custom shortcuts

`loadJSON` (35–43) `[логика]` читает JSON с fallback; `uid` (45–47) создаёт id. Module refs (49–56): `startDelaySeconds`, `timerSeconds`, `builtinWarnings`, `customShortcuts`; watchers (58–65) пишут `whistleref-start-delay`, `whistleref-timer-seconds`, `whistleref-builtin-warnings`, `whistleref-custom-shortcuts`. `addCustomShortcut`, `updateCustomShortcut`, `removeCustomShortcut`, `reorderCustomShortcut`, `setBuiltinWarning` (67–101) `[UI]` управляют shortcut definitions. `toPascalCase`, `resolveIcon` (103–114) `[логика/UI]` разрешают Lucide icon. `normalizeShortcutColor` (116–120) `[логика]` валидирует/нормализует color. `useShortcuts` (122–136) возвращает refs/actions/constants. Читают Shortcut settings, CommandBar и App; команды отправляются через App.

### `useShortcutImportExport.js` — JSON импорт/экспорт

`normalizeShortcutName` (5–9) `[логика]` trim/lowercase для conflict key; `normalizeShortcut` (11–20) приводит legacy/current fields к `{label,command,description,icon,color,warning}`. `exportShortcuts(shortcuts)` (22–43) `[UI]` создаёт JSON Blob и инициирует download `whistleref-shortcuts-YYYY-MM-DD.json`. `parseShortcutsFile(file)` (45–72) `[логика]` читает text/JSON, проверяет `shortcuts[]`, нормализует entries и возвращает `{valid,shortcuts,errors}` с duplicate/name/command validation. `detectConflicts` (74–79) `[логика]` сопоставляет имена импортируемых и текущих. Читают ShortcutImportExportSettings.

## Парсеры и mappool state

### `useMappoolChat.js` — chat parser для ban/protect/pick

Строки 1–146 содержат таблицы русско-латинских alias, action regex и phase patterns. `escapeRegExp` (148–150), `russianCategoryAlias`, `latinCategoryAlias` (152–166), `slotAliases` (168–177), `slotPattern` (179–196), `findSlots` (198–217) `[логика]` находят slot ids с пробелом/дефисом, кириллическими и латинскими alias, разрешая overlap в пользу длинного/раннего совпадения. `buildGroups` (219–234) объединяет близкие slot occurrences; `getClauseBounds` (236–262) режет по пунктуации/but/then; `collectActionCandidates` (264–289) находит ban/protect/pick/skip/cancel/re-pick/action patterns; `compareCandidates` (291–296) выбирает длинное, близкое, левое и приоритетное действие. `phaseFromText` (298–310) `[логика]` распознаёт opening ban/protect/pick и phase phrases на английском/русском. `createMappoolChatContext` (313–318) создаёт `{phase:'unknown',phaseAtMessage:Map}`; `advanceMappoolChatContext` (320–330) обновляет phase, помечает finished при закрытии и сохраняет phase per message id. `parseMappoolMessage` (332–359) выдаёт groups и slots с action/group bounds; после finished возвращает пусто. `mappoolParserCacheKey` (361–363) строит cache key. `PARSER_VERSION`, `phaseFromText` экспортируются (365). Используется обеими ChatWindow и App; тест — `client/test/mappoolChat.test.mjs`.

### `useMappool.js` — два module store для stable/lazer pools

`defaultModsForCategory`, `defaultLazerModsForCategory` (27–45) `[логика]` defaults mods; `normalizeMultipliers`, `winConditionSource`, `getMultiplier`, `adjustedTeamScore` (47–107) строят stable win-condition script и free-mod score adjustment. Lazer equivalents (109–140) используют lazer template. `readStoredState`/`readMappools` (142–181) читают storage и нормализуют. Для каждого mode watchers (183–199) сохраняют lobby map/qualification/active pool и serialized mappools.

`sortMappoolSlots` (212–224) `[логика]` сортирует category order, numeric suffix and unknowns. `categoryFromSlotKey` (226–230), `normalizeWinCondition` (232–243), `normalizeConfig` (245–314) приводят legacy/current pool/slot shape, mods, commands, duration, preview and categories. `serializeMappool` (316–342) и `serializeLazerMappool` (344–367) `[логика]` формируют storage/export shape; `normalizePreview` (369–381) чистит preview. `addMappool`, `updateMappool`, `deleteMappool` (383–394) меняют pool list. `normalizeCommands` (396–402), `normalizeDuration` (404–412), `lobbyKey` (414–416) helpers. `ensureLobbyMapState`, `getMapState`, `setMapState`, `clearLobbyMapState`, `clearAllMapStates` (418–449) хранят per-lobby/per-slot state; `getQualificationMode`, `hasQualificationMode`, `setQualificationMode`, `clearLobbyState` (451–471) управляют qualification/lobby reset; `getActivePool`, `setActivePool` (473–483) выбирают pool. `useMappool(mode)` (485–506) возвращает refs и bound actions. State keys: stable `whistleref-mappools`, `whistleref-mappool-state`; lazer аналогичные mode-specific keys (строки 142–199). Читают App, MappoolCard, MappoolsModal, ChatWindow.

## OAuth, credentials, cache

### `useOsuOAuth.js` — osu OAuth URL/callback

`getOsuRedirectUri` (4–6) `[логика]` строит current-origin `/oauth/callback` URI. `createState` (8–11) создаёт random state. `startOsuAuthorization(clientId)` (13–24) `[UI]` сохраняет state в sessionStorage, открывает osu authorize URL с scopes идентификации и redirect. `readOsuAuthorizationCallback` (26–46) `[логика]` читает query/hash `code`/`state`/`error`, проверяет state из sessionStorage и возвращает callback result; код/ошибка не обмениваются напрямую, обмен делает App/server.

### `useRememberedCredentials.js` — IndexedDB credential storage

`openDatabase` (9–25) `[логика]` открывает `whistleref` DB version 1 и object stores `credentials`, `osu-auth`; `readValue`, `writeValue`, `deleteValue` (27–55) обёртки transaction. `saveEncryptedValue`, `loadEncryptedValue` (57–78) используют WebCrypto AES-GCM key из `crypto.subtle`/stored key material; точная защита зависит от браузера. Public `saveRememberedCredentials`, `loadRememberedCredentials`, `saveOsuAuthData`, `loadOsuAuthData`, `clearRememberedCredentials` (89–122) `[логика]` сохраняют/читают/удаляют login/password и osu auth. App использует их для remember-me/OAuth; raw credentials не лежат в localStorage.

### `useLazerRoomResourceCache.js` — per-room profile/beatmap cache

`readCache`/`persist` (7–24) `[логика]` читают/пишут JSON localStorage cache; `roomCache` (26–31) создаёт room bucket; `validId` (33–36) проверяет numeric id; `schedule` (38–43) дедуплицирует pending request by key. `getLazerCachedProfile`, `loadLazerCachedProfile`, `loadLazerCachedProfileByUsername` (45–93) читают cache или вызывают переданный `requestApi` endpoint `/users/...`, сохраняют profile. `getLazerCachedBeatmap`, `loadLazerCachedBeatmap` (95–127) аналогично для `/beatmaps/...`. `clearLazerRoomResourceCache` (129–134) удаляет room. Вызывается App/PlayerList/NowPlaying; endpoint details are osu API/server-dependent.

## Websocket client and API contract

### `useServerConnection.js` — websocket transport, login and all outbound commands

`getDefaultWebSocketUrl` (3–12) `[логика]` выбирает `/ws` в dev и `ws(s)://host:3000/ws` в production; `send` (31–35) сериализует payload только при `OPEN`. `ApiRequestError` (23–29) добавляет details к API error.

Outbound wrappers (39–137) `[логика]` отправляют: `send_message(channel,message)`, `join_channel/part_channel`, `test_win_condition(slotId,source,sampleContext)`, `lazer_make_room`, `lazer_invite_player`, `lazer_send_chat_message`, `lazer_roll`, `lazer_join_room`, `lazer_leave_room`, `lazer_close_room`, `lazer_start_match`, `lazer_abort_match`, `lazer_set_lock_state`, `lazer_change_room_settings`, `lazer_move_user`, `lazer_kick_player`, `lazer_add_referee`, `lazer_remove_referee`, `lazer_stop_match_countdown`, playlist add/edit-current/edit/remove and `lazer_load_chat`. Every wrapper returns boolean from `send`; exact payload fields are visible in cited lines.

`requestOsu` (151–188) and `requestApiOnce` (191–238) `[логика]` open/reuse socket, send request payload, wait for matching response, cleanup listeners/timer and reject on error/close/timeout. `apiRetryDelay` (239–244) and `requestApi` (246–261) retry retryable `ApiRequestError` with server-provided retry hints. Stable commands `setLobbyScore`, `setLobbySettings`, `refreshLobbyTitle`, `setActiveWinCondition` (263–290) wrap `send` payloads. Update functions `sendUpdateCommand`, `requestUpdateCheck` (293–346) handle check/progress/update service.

`closeSocket`, `resolveLogin`, `rejectLogin` (347–375) clean socket/pending login. `useServerConnection` (377–523) owns connection lifecycle: `login` sends `{type:'login',login,password}`, sets state `connecting/ready/error`, installs message/error/close listeners and resolves on `login_success`; inbound JSON is assigned to `lastEvent`; `logout`, `loginOsu`, `logoutOsu`, `joinChannel`, `partChannel` expose actions. It returns refs `state,lastError,lastEvent` and every outbound wrapper. No client-side schema validation exists beyond response matching, so unknown server payloads are handled by App’s event dispatcher or ignored.

## Websocket message contract observed from frontend

### Client to server

| `type` | Fields | Sender |
|---|---|---|
| `login` | `login`, `password` | `useServerConnection.login`, lines 377–458 |
| `logout` | none | `logout`, lines 459–462 |
| `login_osu` / `logout_osu` | OAuth credential/token fields or none | `loginOsu`/`logoutOsu`, lines 463–470 |
| `join_channel` / `part_channel` | `channel` | wrappers lines 47–49, 471–476 |
| `send_message` | `channel`, `message` | lines 43–45 |
| `set_lobby_score` | channel and red/blue score fields | lines 263–274 |
| `set_lobby_settings` | channel, bestOf, nextPickTeam | lines 275–284 |
| `refresh_lobby_title` | channel | lines 285–288 |
| `set_active_win_condition` | channel, beatmapId, source | lines 289–291 |
| `test_win_condition` | slotId, source, sampleContext | lines 51–53 |
| `api_request` | endpoint, method, body | lines 207–208 |
| `osu_request` | request payload | `requestOsu`, lines 151–188 |
| `check_update` | none | lines 313–314 |
| `update_start`, `update_cancel`, `update_install` | update-specific payload/none | lines 293–300 |
| `lazer_make_room` | payload spread | lines 55–57 |
| `lazer_invite_player` | room_id, user_id | lines 59–61 |
| `lazer_send_chat_message` | room_id, message, is_action | lines 63–65 |
| `lazer_roll` | room_id, max | lines 67–69 |
| `lazer_join_room`, `lazer_leave_room`, `lazer_close_room` | room_id | lines 71–81 |
| `lazer_start_match` / `lazer_abort_match` | room_id, countdown for start | lines 83–89 |
| `lazer_set_lock_state` | room_id, locked | lines 91–93 |
| `lazer_change_room_settings` | room_id plus settings spread | lines 95–97 |
| `lazer_move_user` | room_id, user_id, slot, team | lines 99–101 |
| `lazer_kick_player`, `lazer_add_referee`, `lazer_remove_referee` | room_id, user_id | lines 103–113 |
| `lazer_stop_match_countdown` | room_id | lines 115–117 |
| `lazer_add_playlist_item` | room_id plus payload | lines 119–121 |
| `lazer_edit_current_playlist_item` | room_id plus payload | lines 123–125 |
| `lazer_edit_playlist_item` | room_id, playlist_item_id plus payload | lines 127–129 |
| `lazer_remove_playlist_item` | room_id, playlist_item_id | lines 131–133 |
| `lazer_load_chat` | room_id | lines 135–137 |

### Server to client

The client explicitly branches on `type` in App watcher (App.vue 419–879, 1205–1236) and `useServerConnection` request handlers (151–346). Observed classes are `login_success`, `login_error`, `error`, `ack`, `message`, stable channel/lobby events, `lazer_room`, `lazer_chat_history`, `lazer_chat_message`, `lazer_*` state/match/playlist/user events, `api_response`, `osu_response`, `update_available`, `update_progress`, `update_downloaded`, `update_error`, and close/error transport events. Exact server-origin field sets are not declared in client types; for events not unpacked in those branches the correct statement is “неясно из фронтенда”. The consuming code is App’s `lastEvent` watcher; request-specific responses are consumed by `requestOsu`, `requestApiOnce`, `requestUpdateCheck`.

