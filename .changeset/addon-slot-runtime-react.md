---
'@asteby/metacore-runtime-react': minor
---

Nuevo `<AddonSlot kind context>` (con `AddonSlotProvider`, `satisfiesSdkRange`): monta las contribuciones de slot de los manifests instalados (remoto federado) y las registradas en el slot store, ordenadas por `order` y luego `priority`. Cada contribución va aislada en ErrorBoundary + Suspense con timeout (`timeoutMs`, `slot.timeout_ms`); si falla emite `addon_slot_failed{addon,kind,reason}` por `onEvent` y pinta su fallback sin afectar a sus hermanos ni al shell. Comprueba `frontend.sdk` contra `sdkVersion` del host y admite `requireIntegrity`. Todo es opt-in: `<Slot>` y `slotRegistry` siguen funcionando.
