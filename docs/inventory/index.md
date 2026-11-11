# WhistleRef frontend inventory

Инвентаризация выполнена по состоянию исходников `client` на 2026-11-01. Номера строк относятся к файлам в рабочем дереве на момент чтения. Серверные файлы намеренно не описываются: задача ограничена фронтендом, а сервер упоминается только там, где контракт виден из клиента.

## Папки и документы

- [Корень `client/src`](root.md) — `App.vue`, `main.js`, `style.css`.
- [Composables](composables.md) — всё состояние, парсеры, websocket-клиент, OAuth, локальное хранение.
- [Общие компоненты](components.md) — UI вне режимов stable/lazer.
- [Компоненты lazer](components-lazer.md) — UI комнат osu!lazer.
- [Компоненты stable](components-stable.md) — UI IRC/`!mp`-лобби osu!stable.
- [Директивы](directives.md) — `v-tooltip`.
- [Конфигурация и тесты](config.md) — Vite, ESLint, package metadata, index HTML, клиентский тест.
- [Статические ресурсы](assets.md) — логотипы, иконки модов, звуки, favicon.
- [Сквозная логика](cross-cutting.md) — экраны, модалки, фазы, шорткаты, автообновление и локальное хранение.

## Полный список файлов фронтенда

### Корень `client`

`client/.env`, `client/.gitignore`, `client/.vscode/extensions.json`, `client/README.md`, `client/eslint.config.js`, `client/favicon.png`, `client/index.html`, `client/package.json`, `client/package-lock.json`, `client/vite.config.js`, `client/test/mappoolChat.test.mjs`.

### `client/src`

`client/src/App.vue`, `client/src/main.js`, `client/src/style.css`.

### `client/src/components`

`AddChannelDialog.vue`, `AppSidebar.vue`, `BulkBeatmapImportDialog.vue`, `CreateLobbyDialog.vue`, `LobbyMessagesSettings.vue`, `LoginPage.vue`, `MainScreen.vue`, `ModIconList.vue`, `MonakoEditor.vue`, `SettingsModal.vue`, `ShortcutEditDialog.vue`, `ShortcutImportExportSettings.vue`, `SidebarSectionCard.vue`, `SliderInputNumber.vue`, `SvgMarkup.vue`, `TagInput.vue`, `UpdateDialog.vue`, `WinConditionEditor.vue`.

### `client/src/components/lazer`

`BuiltinShortcutsSettings.vue`, `ChatWindow.vue`, `CommandBar.vue`, `LobbyScoreCard.vue`, `LobbySetupDialog.vue`, `MappoolCard.vue`, `MappoolsModal.vue`, `NextMap.vue`, `NowPlaying.vue`, `PlayerListCard.vue`, `PlayersDialog.vue`, `PlaylistModsModal.vue`, `RefereesDialog.vue`, `RoomInfoPanel.vue`.

### `client/src/components/stable`

`BanchoBotCommandBar.vue`, `BuiltinShortcutsSettings.vue`, `ChatWindow.vue`, `CommandBar.vue`, `LobbyScoreCard.vue`, `LobbySetupDialog.vue`, `MappoolCard.vue`, `MappoolsModal.vue`, `NowPlaying.vue`, `PlayerListCard.vue`, `PlayersDialog.vue`, `RefereesDialog.vue`, `RoomInfoPanel.vue`.

### `client/src/composables`

`useBeatmapAuthors.js`, `useBeatmapCover.js`, `useChatSettings.js`, `useDarkMode.js`, `useLazerRoomResourceCache.js`, `useLobbyMessages.js`, `useMappool.js`, `useMappoolChat.js`, `useMessageHighlighting.js`, `useNickColor.js`, `useNotifications.js`, `useNowPlayingSettings.js`, `useOsuOAuth.js`, `useRememberedCredentials.js`, `useServerConnection.js`, `useShortcutImportExport.js`, `useShortcuts.js`.

### `client/src/directives`

`client/src/directives/tooltip.js`.

### `client/src/assets`, `client/public`, `client/src/sounds`

Все SVG/JSON/PNG/MP3 перечислены в [assets.md](assets.md). Это статические файлы без JS-функций; каждый набор указан с назначением и точным списком путей.

## Проверка пропусков

Список выше получен из `rg --files client` с исключением `node_modules`; все найденные исходные, конфигурационные, тестовые и статические файлы распределены по документам. `stores`, `utils`, `router` и отдельного ws-файла в `client/src` нет: websocket-клиент находится в `composables/useServerConnection.js` (строки 3–523), а маршрутизация отсутствует — приложение монтируется одной страницей из `App.vue`.

## Общие пометки

- `[логика]` — вычисление/парсинг без зависимости от Vue/PrimeVue.
- `[UI]` — зависит от DOM, Vue-компонента или PrimeVue.
- `[мёртвый код]` — в клиентских исходниках нет вызова/использования.
- `[дубль]` — намеренно отмечена повторная реализация, обычно stable/lazer-пара.
