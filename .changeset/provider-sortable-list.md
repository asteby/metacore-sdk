---
"@asteby/metacore-runtime-react": minor
---

Nueva lista ordenable de proveedores con estado (`ProviderSortableList`: insignias Listo / Sin credenciales / Sandbox / Con fallas / No atiende / Desactivado, arrastre con puntero y teclado, interruptor «Hereda de la organización», interruptor de activación y acciones por elemento) y el modelo puro de resolución de capacidades por mercado (`resolveCapability`, `groupByDomain`, `bundleSelections`, `changeImpact`, `providerStatus`…) portado desde ops, para que la pantalla Mercados y otras apps host lo reutilicen. Genérico, sin nociones de pagos y sin dependencias nuevas. `CapabilityProvider` del modelo se exporta como `CapabilityProviderBinding` para no chocar con `capability-gate`.

Notas de contrato:
- `ProviderStatus` incluye ya `unhealthy` y `disabled` (alineado con ready / not_configured / unhealthy / disabled del diseño de mercados del kernel; `missing_credentials` equivale a `not_configured`). `providerStatus` marca `unavailable` a un proveedor no instalado y acepta `{ enabled, healthy }`.
- `resolveCapability` refleja `capability.Select` v1 (regla de hoy). Select v2 (prioridad y estado por mercado) sigue pendiente del release F2 del kernel; el orden que emite la lista no lo consume este modelo.
- `onReorder` emite solo los elegibles: un host que guarda la lista completa debe conservar sus entradas no elegibles.
- Las etiquetas por omisión pasan por i18n (`capability_providers.*`, con el español como `defaultValue`); `labels` sigue siendo el override.
