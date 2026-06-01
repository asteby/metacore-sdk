---
"@asteby/metacore-i18n": patch
---

fix(addon-i18n): never overwrite a cached bundle with an empty fetch result

useAddonI18n re-validates the addon i18n bundle from the Hub in the background.
fetchAddonI18n returns `{}` on a 404 or empty response, and the hook applied it
unconditionally — so a transient Hub hiccup blanked the live labels AND wrote `{}`
to localStorage, poisoning the cache for 6h. The sidebar then fell back to
humanized keys (e.g. "accounting.nav.group" → "Group") intermittently. An empty
result is now treated as "no update", leaving the cached/installed bundle intact.
