---
"@asteby/metacore-starter-config": minor
---

Federación de addons: `metacoreFederationShared({ hostProvided })` (singleton + `import: false`), `metacoreFederationPlugin()` (alias del stub `virtual:pwa-register/react` -> ya no hace falta `_pwa-register-stub.ts` por addon, y el build FALLA con mensaje accionable si el `vite.config.ts` declara `shared` a mano; `handRolledShared: 'warn' | 'off'`), más `detectHandRolledFederationShared` / `assertNoHandRolledFederationShared`. Nuevo bin `metacore-tailwind-sources check|write` y export `./tailwind-sources` con la lista de paquetes del SDK que emiten clases Tailwind.
