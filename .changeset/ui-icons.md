---
'@asteby/metacore-ui': minor
---

Add two new subpath exports that apps were maintaining as byte-duplicated
local copies:

- **`/icons`**, **`/icons/brand`**, **`/icons/custom`** — 16 brand icons
  (Discord, Docker, Facebook, Figma, GitHub, GitLab, Gmail, Medium,
  Notion, Skype, Slack, Stripe, Telegram, Trello, WhatsApp, Zoom) and
  9 custom icons (layout variants, sidebar variants, theme variants).
  `IconDir` stays in the apps for now — it consumes a direction
  provider that is a separate promotion candidate.

- **`/error-pages`** — `NotFoundError`, `GeneralError`, `UnauthorisedError`,
  `ForbiddenError`, `MaintenanceError`. Standard full-page error
  components using `@tanstack/react-router`. Apps drop their copies in
  `features/errors/*` and import from here.
