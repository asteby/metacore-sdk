---
"@asteby/metacore-runtime-react": minor
---

feat(license-gate): gateo por rol del formulario de activación.

`<LicenseGate>` acepta dos props nuevas (backward-compatible):

- `canActivate?: boolean` (default `true`): cuando es `false`, el modal bloqueante se muestra SIN el formulario de activación.
- `readOnlyMessage?: string`: mensaje mostrado en ese caso (default: "Contacta al administrador de la plataforma para activar la licencia.").

Aplica a todas las variantes del modal (missing/invalid/expired, incluido el copy de trial vencido). Permite que solo el Platform Root/superadmin active la licencia mientras el resto de usuarios ve el bloqueo con la indicación de a quién contactar.
