---
'@asteby/metacore-app-providers': minor
---

One face for every copilot avatar on screen: `usePublishMascotFace(state)` publishes a chat surface's `MascotState` while it is mounted and returns the shared face, `useMascotFace()` reads it, and `mascotFaceStore` / `createMascotFaceStore()` / `pickMascotFace()` expose the framework-free store. The most active state wins (`error` > `speaking` > `processing` > `thinking` > `listening` > `happy` > `idle`), so a hidden idle chat pane can no longer paint over a pane that is thinking. No new dependency (`useSyncExternalStore`).
