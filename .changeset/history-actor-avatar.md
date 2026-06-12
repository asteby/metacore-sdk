---
'@asteby/metacore-runtime-react': patch
---

RecordHistory: event headers show the actor's photo, not just initials — `ActivityEvent` gains `actor_avatar` and the component renders it via the new `resolveAvatarUrl` prop (host resolves the storage path, e.g. ops' `getStorageUrl(path, 'avatars')`; identity fallback for absolute paths).
