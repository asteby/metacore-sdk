---
"@asteby/metacore-ai-chat": patch
---

Fix crash when opening the chat: the scroll effect returned the Promise from `scrollIntoView` as its cleanup, which made React throw (`destroy is not a function`) in Chromium.
