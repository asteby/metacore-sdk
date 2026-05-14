---
'@asteby/metacore-auth': minor
---

refactor(auth): single source of truth — store is canonical, `AuthProvider` retained as a thin wrapper

`AuthProvider` no longer holds its own `useState`/Context with a different storage key (`saas_user`) than the canonical zustand store (`auth_user`). It is now a Fragment-returning wrapper that, on mount, optionally seeds `useAuthStore` with `initialUser` / `initialAccessToken` for SSR/hydration use-cases. All reads and mutations live in the store.

The legacy `useAuth()` hook is kept for back-compat but is now a read-through projection over `useAuthStore`. Calling `login(email, role)` and `logout()` now mutate the store directly, so consumers can mix-and-match `useAuth()` and `useAuthStore` without state divergence.

Both `AuthProvider` and `useAuth` are marked `@deprecated`. New code should prefer `useAuthStore(state => state.auth.user)` (or the full `auth` slice). No public API was removed.

Net effect: removes the dual-source-of-truth bug flagged by the Bridge API audit. The "two states could drift" failure mode is now structurally impossible.
