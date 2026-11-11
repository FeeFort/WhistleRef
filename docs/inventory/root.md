# Корень `client/src`

## `client/src/main.js` — создание Vue-приложения и глобальная регистрация сервисов

Строки 1–26. `[UI]` импортирует `App.vue` и глобальные стили, создаёт приложение, подключает PrimeVue с темой Aura и `.app-dark` как селектором тёмной темы, регистрирует ConfirmationService, ToastService и директиву `v-tooltip`, затем монтирует в `#app`. Лицензионный ключ PrimeUI берётся из `VITE_PRIMEUI_LICENSE_KEY` (15–24). Других провайдеров состояния, роутера или глобального websocket-клиента нет.

## `client/src/style.css` — глобальная визуальная система

Строки 1–5428 задают шрифты, CSS variables dark surface/text/accent/status colors (1–35), reset/scrollbars/body/#app (37–80), PrimeVue overrides, layout/sidebar/chat/cards/dialogs/settings, responsive breakpoints and animations. Это только CSS: функций, watchers, событий и storage нет. Точная разметка компонентов находится в Vue-файлах; CSS селекторы связывают их классы.

## `client/src/App.vue` — корневой экран, маршрутизация чатов и orchestration всего клиента

Это единственный page-компонент; template занимает строки 4000–4970, стили — 4971–5428. Он переключает login/app, sidebar, bancho/DM/stable/lazer-чаты и все модальные окна. Прямых props/emits нет: состояние приходит из composables и внутренних `ref`/`reactive` (строки 60–215).

### Состояние и derived state

`currentUser`, authentication/loading/error, OAuth credentials/profile, sidebar/settings/update/dialog flags, активный чат, списки каналов/DM/комнат, состояния лобби, chat messages, countdown timers, mappool contexts, profiles/resources and now-playing maps объявлены в строках 60–215. `connected` — сервер готов (178); `activeChat`, `activeChatKind`, `activeChannel`, active stable/lazer lobby, players/referees, score, timers, active mappool slots and now-playing — computed в строках 1406–2115. `[UI]` `activeChatKind` различает `bancho`, `dm`, `stable`, `lazer`; этот выбор определяет дочерние компоненты и командную панель.

### Функции и обработчики

Все ниже — функции `<script setup>`; если не указано иное, это `[UI]` orchestration с записью в состояние и/или отправкой websocket-команды.

- `readPlayerProfileCache()` (199–206) `[логика]` читает JSON `whistleref-lobby-player-profiles`; при битом/необъектном значении возвращает `{}`.
- `cacheLobbyPlayers(chatId, players)` (218–239) `[логика]` нормализует username, сохраняет userId/profile/avatar для не-slot игроков по IRC-nick и пишет изменившийся кэш в `localStorage`.
- `clearCachedLobbyProfiles(chatId)` (241–245) `[логика]` удаляет профильный кэш лобби и сохраняет его.
- `previewTeamSegments(text)` (326–344) `[логика]` режет preview-текст по именам Team Red/Blue с Unicode word boundaries и цветами.
- `normalizeOsuUser(user)` (373–380) `[логика]` приводит id/username/avatar к единому объекту.
- `previewNickStyle(message)`, `previewMessageStyle(message)`, `previewMessageHighlighted(message)`, `previewTime(time,index)` (1027–1094) `[UI]` строят стили, highlight-цвет и пример времени для превью настроек чата.
- computed draft/picker values `highlightWordsDraft`, `highlightStylesDraft`, `primaryColorPicker`, team color pickers, `chatSettingChanged`, `highlightMessageColor` (346–417, 1066–1074) `[UI]` нормализуют/отражают настройки в controls.
- `handleLazerError(event)` и `lazerErrorSummary(request)` (1417–1506) `[логика/UI]` переводят `error`/отрицательные ack lazer-запросов в понятный toast/system message и очищают pending legacy request.
- `normalizeLazerChatMessage`, `appendLazerChatHistory`, `appendLazerChatMessage` (1507–1549) `[логика]` приводят сообщения комнаты, дедуплицируют по id, добавляют phase-at-message через mappool context и при необходимости уведомляют.
- `loadLazerUserProfile(roomId,userId)`, `loadLazerStyleBeatmap(roomId,beatmapId)` (1550–1583) `[логика]` запрашивают osu API через cache composable, записывают результат в reactive cache и не повторяют pending-запросы.
- `registerLazerRoom(room)` (1585–1622) `[логика]` нормализует room, создаёт/обновляет room/lobby state, referee/player data, playlist и chat identity.
- `getActiveLazerPlaylist`, `clearLazerPlaylistRestore`, `queueLazerPlaylistRestore`, `restoreLazerSinglePlaylistItem`, `getLazerCurrentPlaylistItem` (1624–1674) `[логика]` выбирают текущий playlist item и восстанавливают его после legacy-команд.
- `clearLazerNowPlayingFinished`, `syncLazerNowPlaying`, `getLazerMappoolPreview`, `setLazerNowPlayingFromPreview`, `loadLazerNowPlayingMap` (1675–1804) `[логика]` синхронизируют now-playing с playlist/mappool/API и управляют timeout завершения.
- `moveLazerPlayer({userId,slot})` (2083–2091), `normalizeLazerMods` (1980–1984) `[логика/UI]` подготавливают изменение слота и список модов.
- timer lifecycle: mounted interval (2117–2126) `[UI]` каждую секунду обновляет stable/lazer countdowns; unmount очищает interval и все countdown timeout maps.
- `normalizeChannel`, `normalizeIrcNick`, `channelId`, `directChatId` (2128–2151) `[логика]` нормализуют IRC channel/nick и формируют ids.
- `createDefaultLobbyState`, `addJoinedChannel`, `addDirectChat`, `removeDirectChat` (2148–2245) `[логика]` создают локальную модель stable-лобби/DM и меняют список боковой панели.
- `applyLobbyState(event)` (2246–2297) `[логика]` применяет lobby state event, score/settings/players, обновляет profile cache и mappool state.
- `updateActiveLobbyScore`, `updateActiveLobbySettings`, `updateActiveLazerScore`, `updateActiveLazerSettings` (2298–2335) `[UI]` отправляют score/settings через composable.
- `applyRefereeConfirmation(channel,text)` (2336–2356) `[логика]` удаляет/обрабатывает IRC confirmation system message.
- `removeJoinedChannel`, `selectChat` (2357–2375) `[UI]` закрывают канал или выбирают чат и сбрасывают unread.
- notification functions `playNotificationSound`, `previewNotificationSound`, `toggleNotificationSoundMenu`, `selectNotificationSound`, `closeNotificationSoundMenu`, `onNotificationSoundKeydown`, `notificationChatTitle`, `notificationMatchesTrigger`, `isAppFocused`, `notifyIncomingMessage` (2376–2478) `[UI]` выбирают/проигрывают mp3, определяют триггер и показывают toast/звук при входящем сообщении.
- `appendChatMessage`, `appendWhistleBotMessage` (2479–2503) `[логика]` добавляют сообщения stable/IRC с id, timestamp, highlight and notification.
- legacy adapter: `nextLazerLegacyRequestId`, `sendLegacyLazerRequest`, `normalizeLazerUserName`, `resolveLazerLegacyUser`, `lazerLegacyPlayerExists`, `handleLazerLegacyCommand` (2504–2817) `[UI]` разбирают локальные `!`-команды и переводят их в lazer websocket commands, включая user lookup, move/kick/referee/playlist/settings/countdown.
- `downloadChatHistory` (2818–2839) `[UI]` сериализует текущую историю в скачиваемый текстовый файл.
- now-playing helpers `localNowPlayingMap`, `setNowPlaying`, `refreshNowPlayingMapAttributes`, `loadManualNowPlayingMap`, `handleNowPlayingEvent` (2840–3094) `[логика/UI]` нормализуют beatmap, запрашивают API-атрибуты, обновляют карточку и реагируют на `!mp`/lazer events.
- `expandLegacyStableModMask`, `normalizeMapMods`, `getLazerMultiplayerMods`, `getAllLazerMultiplayerMods`, `formatLazerModConflictError` (2917–2976) `[логика]` переводят mod bitmask/модификаторы и формируют конфликтное сообщение.
- `markRoomClosed`, `markLazerRoomClosed` (3095–3133) `[логика/UI]` переводят комнату в closed, завершают timer, добавляют системное сообщение и при необходимости очищают ресурсы.
- `requestLazerInviteJoin` (3134–3153) `[UI]` отправляет join room по приглашению и ставит timeout отказа.
- `joinChannel`, `showJoinToast`, `clearPendingJoin`, `failPendingJoin`, `requestPartChannel`, `closeActiveChat` (3154–3267) `[UI]` выполняют join/part stable или lazer, показывают статусы и закрывают чат после подтверждения.
- `handleSend`, `queueLazerChatMessage` (3268–3367) `[UI]` отправляют chat/action message, обрабатывают локальные команды и очередь сообщений до загрузки lazer room.
- `formatLazerCountdownDuration`, `clearLazerCountdown`, `clearLazerMatchStartCountdown`, `startLazerCountdown`, `abortLazerCountdown`, `abortActiveLazerTimer` (3368–3469) `[логика/UI]` запускают/останавливают локальные таймеры countdown и match-start с source/id.
- stable player controls `updateActiveLobbyPlayers`, `moveLobbyPlayer`, `toggleLobbyPlayerTeam`, `kickLobbyPlayer`, `setLobbyHost`, `sendLobbySetup` (3470–3530) `[UI]` меняют слот/команду/host/kick и открывают setup.
- `openLobbySetup`, `applyLazerLobbySetup`, `handleCommand`, `handleCreateLobby` (3531–3594) `[UI]` открывают модалку, создают lazer room или stable lobby и маршрутизируют команду.
- result flow `loadLazerMatchResult`, `calculateLazerApiResult`, `makeLazerCalculatedResult`, `evaluateLazerWinCondition`, `getMatchStatus`, `resolveBeatmapWinner`, `getLobbyTemplateValues`, `getLazerLobbyTemplateValues` (3595–3846) `[логика/UI]` загружают scores, рассчитывают win condition (через API/server result), определяют winner/status и подставляют шаблоны lobby messages.
- `handleMappoolPick`, `handleLazerMappoolPick`, `rulesetNumber`, `handleChatMappoolAction`, `handleLazerChatMappoolAction` (3847–3957) `[UI]` выбирают карту/слот из карточки или chat chip, показывают подтверждение, записывают map state и отправляют pick/ban/protect command.
- `handleSendResult`, `handleLazerSendResult` (3958–3978) `[UI]` форматируют активный preset и отправляют каждую enabled result message.

### Lifecycle/watchers

- watcher `lastEvent` (419–879) `[UI]` является главным inbound dispatcher: обрабатывает lazer errors/acks, auth, chat, lobby state, room/playlist/match events, update progress и уведомления.
- watchers цветов (880–891) `[UI]` синхронизируют CSS variables и drafts.
- `commitPrimaryColor`, `resetPrimaryColor`, `updateChatColor`, `commitChatColor`, `resetChatSetting`, highlight input handlers (892–1026) `[UI]` применяют/откатывают настройки, нормализуют tokens, запрещают неподходящий paste/wheel.
- `checkForUpdates`, `connectWithToast`, `beginUpdateDownload`, `cancelUpdateDownload`, login/OAuth handlers (1130–1305) `[UI]` подключают сервер, запускают update check/download/install и сохраняют credential/auth data через composable.
- mounted login initialization (1306–1358) `[UI]` читает remembered login/OAuth callback, подключается при наличии login и проверяет updates; page-exit handler (1358–1369) закрывает соединение/очищает listener.
- settings open/close (1388–1399) `[UI]` управляют modal.
- active-chat watcher (1845–1851) `[UI]` отмечает текущий чат прочитанным/запрашивает lazer chat и синхронизирует now playing.
- notification sound menu keydown/click handlers (2424–2444) `[UI]` закрывают меню Escape/outside.
- `watch` now-playing maps (3019–3027) `[UI]` обновляет отображение при смене map.

### UI

Корневой template показывает `LoginPage` пока не authenticated; после входа — `AppSidebar`, chat window, score/player/referee/mappool/now-playing panels и контекстные модальные окна. Кнопки sidebar открывают settings/create lobby/add channel, выбирают/закрывают chat и logout; chat components дают поле сообщения, Enter/Shift+Enter, chat actions и chips; stable/lazer cards дают score, setup, player/referee, mappool and timer operations (строки 4000–4969). Состояния disabled/loading/empty/error передаются props из App; отдельного router или URL navigation нет. Горячие клавиши settings/shortcuts реализованы дочерними компонентами и `useShortcuts`, а не document-level router.
