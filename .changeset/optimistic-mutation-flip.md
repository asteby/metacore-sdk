---
"@asteby/metacore-runtime-react": minor
---

`useOptimisticMutation`: escritura optimista sobre una entrada de caché de TanStack Query con rollback al último valor confirmado, escrituras serializadas por `queryKey` (el último clic es la última escritura), descarte de dobles clics, `debounceMs` para ráfagas (arrastrar y soltar) con flush al desmontar, y `reconcile` para escribir la respuesta del servidor sin refetch. `useFlipAnimation`: animación FLIP de reordenamiento (Web Animations API, solo `transform`) que respeta `prefers-reduced-motion`.
