---
'@asteby/metacore-ui': minor
---

Add icons subpath — `@asteby/metacore-ui/icons`, `/icons/brand`, `/icons/custom`.

Exports 16 brand icons (Discord, Docker, Facebook, Figma, GitHub, GitLab,
Gmail, Medium, Notion, Skype, Slack, Stripe, Telegram, Trello, WhatsApp,
Zoom) and 9 custom icons (layout variants, sidebar variants, theme
variants). Apps that had byte-duplicated copies in `assets/brand-icons/`
and `assets/custom/` can drop the local files and import from the SDK.

`IconDir` (app-context-coupled via a direction provider) intentionally
stays out of this release — it should land together with the provider
promotion.
