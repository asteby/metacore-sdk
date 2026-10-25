---
"@asteby/metacore-runtime-react": minor
---

Nueva lista ordenable de proveedores con estado (`ProviderSortableList`: insignias Listo / Sin credenciales / Sandbox / No atiende, arrastre con puntero y teclado, «Hereda de la organización») y el modelo puro de resolución de capacidades por mercado (`resolveCapability`, `groupByDomain`, `bundleSelections`, `changeImpact`, `providerStatus`…) portado desde ops, para que la pantalla Mercados y otras apps host lo reutilicen. Genérico, sin nociones de pagos y sin dependencias nuevas. `CapabilityProvider` del modelo se exporta como `CapabilityProviderBinding` para no chocar con `capability-gate`.
