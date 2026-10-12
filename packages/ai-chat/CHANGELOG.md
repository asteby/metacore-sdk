# @asteby/metacore-ai-chat

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
