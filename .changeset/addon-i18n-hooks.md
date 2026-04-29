---
'@asteby/metacore-i18n': minor
'@asteby/metacore-fullstack-example': patch
---

Add `useAddonI18n` + `useAddonNames` hooks under `@asteby/metacore-i18n/addon-i18n` that fetch each addon's manifest i18n bundle from the Hub and stay reactive to `useLocale()`. Memory + localStorage cache with 6h TTL. The starter sidebar now uses `useAddonNames` so the installed-addon list shows the localised display name and live-updates on language switch — no reinstall required.

Resolution order in the sidebar: Hub-published manifest i18n → install-time `row.name` (set by the Hub iframe at click time) → raw `addon_key`.

Pairs with `asteby-hq/hub#73` adding the `/v1/addons/{key}/i18n/{lang}.json` endpoint.
