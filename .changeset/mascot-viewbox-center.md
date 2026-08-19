---
"@asteby/metacore-app-providers": patch
---

Fix `<Mascot>` sitting low/off-center for skins without an antenna (e.g. Aby/`gear-lime`): the viewBox was sized to fit the antenna's extra height on every skin, leaving ~30px of dead space above a no-antenna mascot. The crop is now computed per-skin from `antenna`.
