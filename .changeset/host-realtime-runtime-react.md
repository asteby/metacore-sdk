---
"@asteby/metacore-runtime-react": minor
---

Realtime en React: `RealtimeProvider`, `useRealtime`, `useRealtimeInvalidate` (invalida las queries del QueryClient del host cuya key menciona el modelo/tabla), `useRealtimeStatus`, `useRealtimeTick` y `queryKeyMatchesEvent`. `DynamicTable` y `DynamicKanban` aceptan la prop opt-in `realtime` (apagada por default; `<RealtimeProvider defaultRealtime>` cambia el default) para refetch en vivo ante `DATA_EVENT` del modelo.
