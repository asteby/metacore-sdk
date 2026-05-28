---
'@asteby/metacore-marketplace': patch
---

fix(marketplace): align `HubClient.initiateInstall` with the real hub contract.

The hub exposes `POST /v1/install/initiate` (not `POST /marketplace/addons/{key}/install`). The wire body is `{ addonKey, version?, instance_id? }` and the response is `{ install_token, expires_in, verification_url, addon_key, version }`. Previously every consumer of the SDK was hitting a 404. `HubClient.initiateInstall` now posts to the correct path with the correct body and normalises the response back into the existing `InstallToken` shape (with `expires_at` resolved to an absolute ISO timestamp + a new `verification_url` field).

`InitiateInstallInput` drops `organization_id` and `context` (the hub takes tenant attribution from the user JWT, not the body) and adds an optional `instance_id`. `useInstallAddon` and the test stubs are updated accordingly. A new `installPath` option lets hosts behind a path-rewriting proxy override the install endpoint location.
