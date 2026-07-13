---
"@asteby/metacore-runtime-react": minor
---

feat(license-gate): gate de licencia reutilizable — el negocio blindado en el SDK.

Nuevo primitivo `<LicenseGate>` (más `<LicenseExpiryBanner>`, `<LicenseStatusBadge>` y los helpers `isLicenseOperable`/`isLicenseBlocking`/`isPresetEntitled`/`isTrialExpired`) que ops y todos los verticales montan en una línea para blindar la app tras la licencia de instancia:

- Sin enforcement o estado operable (`valid`/`stale`/`grace`) → renderiza children; `stale`/`grace` montan un banner degradado (`expired` no descartable, el resto descartable con TTL en localStorage).
- Enforcement && `missing`/`invalid`/`expired` → modal bloqueante full-screen no descartable con formulario de activación (clave `lic_…` o token pegado); `plan === 'trial'` + `expired` muestra "Tu prueba gratuita terminó". La activación exitosa desbloquea sin recargar.
- Branding-aware (logo/nombre) con fallback neutro; i18n es-first con `t(key, { defaultValue })`.

Independiente del kernel: el host resuelve el `LicenseState` con su propio transporte y pasa `onActivate`. No requiere release del kernel.
