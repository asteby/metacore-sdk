---
'@asteby/metacore-starter-core': major
---

Delete unused duplicate `src/context/auth-provider.tsx`. The file was a parallel copy of the legacy `AuthProvider` with the double source-of-truth bug (localStorage `saas_user` + zustand `auth-storage`) and was never re-exported from `index.ts`, so no public consumer is affected. Apps should use the thin `AuthProvider`/`useAuth` from `@asteby/metacore-auth` (see #191).
