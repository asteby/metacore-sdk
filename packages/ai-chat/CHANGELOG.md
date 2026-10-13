# @asteby/metacore-ai-chat

## 3.0.0

### Patch Changes

- @asteby/metacore-app-providers@149.0.0

## 2.0.0

### Patch Changes

- @asteby/metacore-app-providers@148.0.0

## 1.3.0

### Minor Changes

- cb66668: Markdown + GFM seguro en las respuestas de IA (listas, tablas, código con copiar, links endurecidos, sin HTML crudo, streaming-friendly); inbox de canales inyectable (`channels: ChannelAdapter`, kinds `bot | agent | team`, no leídos en el FAB, último canal recordado); modo pantalla completa del widget (`defaultExpanded`, botón expandir, Escape escalonado, `fullscreenHref` / `onOpenFullscreen`, `hidden`); badge demo ahora lo marca el backend (`demo` en la respuesta) además del prop; `CopilotChat` acepta `title/subtitle/avatar/headerStart/headerEnd/onEscape`. Aditivo: sin `channels` el widget se comporta como antes.

## 1.2.0

### Minor Changes

- 7733df3: ai-chat: `CopilotWidget` now accepts and forwards `sessions`, `onSelectSession` and `demo` to `CopilotChat`; Escape closes the open panel from anywhere in the document (e.g. focus on a toast), yielding to other modal dialogs, text fields outside the panel, handled events and IME composition.

  permissions: `useMyPermissions` accepts `scope: string | null | undefined`. Without a scope the query still runs but the persisted snapshot is neither read nor written (a scopeless entry could leak between orgs); string scopes behave as before.

## 1.1.0

### Minor Changes

- ced35ad: Accessibility and states: dialog semantics, Escape to close, focus in/out, 44px targets, focus ring, reduced motion; offline, retry on error, handled `decideProposal`/`loadHistory` failures, empty state, `demo` badge (`demo` prop) and optional session picker (`sessions`/`onSelectSession`). Proposals now accept `title/summary` or `action/model/payload` (normalized). New labels: `retry`, `offline`, `demo`, `decideError`, `historyError`, `sessions`, `newSession`.

## 1.0.1

### Patch Changes

- 3332536: Fix crash when opening the chat: the scroll effect returned the Promise from `scrollIntoView` as its cleanup, which made React throw (`destroy is not a function`) in Chromium.

## 1.0.0

### Patch Changes

- @asteby/metacore-app-providers@147.0.0

## 0.1.0

### Minor Changes

- d1ccd6e: New package: copilot chat (widget with draggable FAB, chat panel, starter prompts, proposals) with injected chat client, permissions, branding and suggestions; extracted from the ops app.
