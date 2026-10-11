---
'@asteby/metacore-theme': minor
---

`themeBootScript({ defaultAttrs })`: a vertical can declare the `data-*` attributes (e.g. `{ 'data-ui-theme': 'glass' }`) painted on `<html>` for a first visit, before any theme has been stored. Once the providers have stored a theme the option is ignored, so a user's or org's real pick is never overridden. Replaces hand-rolled localStorage seeding in the host's `index.html`.
