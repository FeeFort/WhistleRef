# `client/src/directives`

## `tooltip.js` — DOM tooltip directive `v-tooltip`

Constants `SHOW_DELAY=350`, `FADE_DURATION=130`, `HIDE_DELAY=450`, `GAP=9` (1–4). `contentFrom`, `isHtmlContent`, `isInteractive`, `showDelayFrom`, `isDynamic`, `positionFrom` (6–28) `[логика]` decode binding `{value/html/interactive/showDelay/dynamic}` and modifiers top/bottom/left/right. `placeTooltip` (30–57) `[UI]` positions fixed tooltip near target or pointer and clamps to viewport. `removeTooltip`, `scheduleRemoveTooltip`, `hideTooltip` (59–87) cancel timers, fade/remove, preserve interactive tooltip while pointer/focus remains. `showTooltip` (89–119) waits delay, creates `div[role=tooltip]`, inserts text or supplied HTML, installs interactive hover listeners, positions and fades in.

`mounted` (121–166) stores per-target state and listeners for mouseenter/leave/move/focus/blur; dynamic mode follows pointer. `updated` (167–172) refreshes binding flags and removes empty content. `unmounted` (173–184) removes listeners/tooltip. `[UI]` side effects are DOM nodes and timers; no Vue state/network. `html` content is trusted by directive and is used by mod tooltip callers.

