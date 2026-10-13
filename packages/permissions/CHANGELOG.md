# @asteby/metacore-permissions

## 1.0.0

### Patch Changes

- Updated dependencies [b285f48]
  - @asteby/metacore-runtime-react@50.2.0

## 0.1.1

### Patch Changes

- 7733df3: ai-chat: `CopilotWidget` now accepts and forwards `sessions`, `onSelectSession` and `demo` to `CopilotChat`; Escape closes the open panel from anywhere in the document (e.g. focus on a toast), yielding to other modal dialogs, text fields outside the panel, handled events and IME composition.

  permissions: `useMyPermissions` accepts `scope: string | null | undefined`. Without a scope the query still runs but the persisted snapshot is neither read nor written (a scopeless entry could leak between orgs); string scopes behave as before.

## 0.1.0

### Minor Changes

- 0da485e: Add `@asteby/metacore-permissions` (capability feed, role/grant API factory, screen-implied capabilities registry, nav gating helpers and `PermissionsPage`) and `@asteby/metacore-org-ai` (per-org provider/model/API-key settings and the Claude connect dialog). Both take an injected HTTP client, i18n and notifications.
