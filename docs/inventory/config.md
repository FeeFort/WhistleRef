# Конфигурация, статика корня и тест

## `client/vite.config.js` — dev/build/test configuration

Lines 1–42: Vue plugin; `publicDir:false`; forced optimize dependency `@lucide/vue`; dev server on `0.0.0.0:5173` with websocket HMR; `/ws` proxy to `ws://127.0.0.1:3000` and `/api` proxy to `http://localhost:3000`; Vitest/jsdom globals; production build into `../server/static`, clears output, leaves CSS unminified and raises chunk warning limit. `[логика/config]` no runtime UI functions.

## `client/package.json` and `package-lock.json`

`package.json` lines 1–27 identifies a private ESM Vue 3 package, scripts `dev`, `build`, `preview`, `test:mappool`, `lint`, `format`, and dependencies Vue, PrimeVue/Aura, Lucide and Monaco. `package-lock.json` is the npm lockfile for those exact dependencies; it contains no application behavior. No need to port it as frontend functionality.

## `client/eslint.config.js` — lint rules

Lines 1–14 use Vue flat recommended config plus Prettier; ignore `dist`; disable `vue/attribute-hyphenation` and `vue/valid-template-root`.

## `client/index.html` — Vite shell

Lines 1–12 set English document, viewport, `favicon.png`, title `WhistleRef — BanchoBot`, mount `#app`, and load `/src/main.js`. The root `<html>` starts with `app-dark`, so dark CSS is initial.

## `client/.env` — build-time PrimeUI license

Line 1 defines `VITE_PRIMEUI_LICENSE_KEY`; Vite exposes it to `main.js` as the PrimeVue license. The value is an environment credential-like artifact and is not a behavioral setting; do not infer server authentication from it.

## `client/.gitignore`, `.vscode/extensions.json`, `client/README.md`, `client/favicon.png`

These files are project metadata/documentation/editor/favicon resources. No executable frontend behavior is present in the files themselves.

## `client/test/mappoolChat.test.mjs` — parser regression tests

Lines 1–118 import `createMappoolChatContext`, `advanceMappoolChatContext`, `parseMappoolMessage`, then assert: grouping punctuation/space, Russian Cyrillic slot aliases, nearest action selection, clause boundaries, Russian verbs, phase transitions, per-message phase persistence, terminal finished phase and context isolation. This is the only client test file found; it does not test Vue rendering, websocket, OAuth or storage.

