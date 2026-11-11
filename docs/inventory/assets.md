# Статические ресурсы

Статические assets не содержат функций, props, watchers или websocket side effects. Их назначение определяется импортами и именами файлов.

## Branding and public files

- `client/src/assets/WhistleRef.svg` — logo imported by root/login UI.
- `client/src/assets/github.svg` — GitHub icon used by UI.
- `client/public/icons.svg` — public sprite/resource.
- `client/public/favicon.svg` and `client/favicon.png` — browser icons; PNG is selected by `index.html` line 6.

## Mod metadata

- `client/src/assets/mods/mods.json` — ruleset/mod metadata: acronym, name, category, settings and SVG mapping; consumed by `ModIconList`, stable/lazer player cards and `PlaylistModsModal`.
- `client/src/assets/mods/settings.json` — mod setting metadata/defaults; consumed by lazer mod configuration.
- `client/src/assets/mods/mod-icon.svg`, `mod-customized.svg`, `mod-extender.svg`, `more-mods.svg` — generic mod, customized, extender and overflow icon fragments.
- `client/src/assets/mods/automation/autopilot.svg`, `autoplay.svg`, `relax.svg`, `spun-out.svg` — automation icons.
- `client/src/assets/mods/conversion/alternate.svg`, `classic.svg`, `constant-speed.svg`, `difficulty-adjust.svg`, `dual-stages.svg`, `eight-keys.svg`, `five-keys.svg`, `four-keys.svg`, `hold-off.svg`, `invert.svg`, `mirror.svg`, `nine-keys.svg`, `one-key.svg`, `random.svg`, `seven-keys.svg`, `single-tap-fixed.svg`, `single-tap.svg`, `six-keys.svg`, `swap.svg`, `target-practice.svg`, `ten-keys.svg`, `three-keys.svg`, `two-keys.svg` — lazer conversion mod icons.
- `client/src/assets/mods/difficulty-increase/accuracy-challenge.svg`, `blinds.svg`, `cover.svg`, `double-time.svg`, `fade-in.svg`, `flashlight.svg`, `hard-rock.svg`, `hidden.svg`, `nightcore.svg`, `perfect.svg`, `strict-tracking.svg`, `sudden-death.svg`, `traceable.svg` — difficulty-increase icons.
- `client/src/assets/mods/difficulty-reduction/daycore.svg`, `easy.svg`, `half-time.svg`, `no-fail.svg`, `no-release-fixed.svg`, `no-release.svg`, `simplified-rhythm.svg` — difficulty-reduction icons.
- `client/src/assets/mods/fun/adaptive-speed.svg`, `approach-different.svg`, `barrel-roll.svg`, `bloom.svg`, `bubbles.svg`, `deflate.svg`, `depth.svg`, `floating-fruits.svg`, `freeze-frame.svg`, `grow.svg`, `magnetised.svg`, `moving-fast.svg`, `muted.svg`, `no-scope.svg`, `repel.svg`, `spin-in.svg`, `synesthesia.svg`, `transform.svg`, `wiggle.svg`, `wind-down.svg`, `wind-up.svg` — fun mod icons.

## Sounds

`client/src/sounds/bell-2.mp3`, `bell.mp3`, `bong.mp3`, `cs go.mp3`, `ding.mp3`, `gah dayum.mp3`, `i like this one.mp3`, `idk bro wtf is this.mp3`, `knock.mp3`, `saint.mp3`, `shine.mp3`, `shock.mp3` are notification sound choices enumerated by `useNotifications.js` lines 26–44 and played by `App.vue` lines 2376–2423.

