# @asteby/metacore-agent-workspace

## 6.1.0

### Minor Changes

- 9134fa7: abyGuidance emite `ops:aby-guide-stopped` ({ guideId, stepIndex }) cuando el usuario descarta un tour en curso, para que el host registre un tour saltado. El fin de tour ya emitía `ops:aby-guide-completed`.

## 6.0.0

### Patch Changes

- Updated dependencies [df0c760]
  - @asteby/metacore-runtime-react@53.0.0
  - @asteby/metacore-app-providers@153.0.0
  - @asteby/metacore-starter-core@162.0.0

## 5.0.0

### Patch Changes

- ecaa56c: recharts sale del grafo estático del índice de `runtime-react`. Los widgets `BarWidget`, `LineWidget`, `AreaWidget`, `PieWidget` y `DonutWidget` del índice (y `WidgetRenderer`/`DashboardGrid`) ahora son fachadas con `React.lazy` que descargan recharts solo cuando un tablero pinta una gráfica; antes el share de runtime-react lo arrastraba al primer pintado del shell. Los componentes con recharts viven en el nuevo subpath `@asteby/metacore-runtime-react/charts`, y `preloadWidgetCharts()` calienta el chunk. Los nombres exportados no cambian.

  Una sola versión de recharts en el ecosistema: `runtime-react` pasa de `^2.15.0` a `^3.8.1` (la que ya usan OPS y `agent-workspace`), y el peer de `agent-workspace` sube a `>=3`. Un test de grafo estático (`index-static-graph`) falla si recharts, maplibre-gl u otras librerías pesadas vuelven a entrar al índice.

- Updated dependencies [ecaa56c]
  - @asteby/metacore-runtime-react@52.1.0
  - @asteby/metacore-app-providers@152.0.0
  - @asteby/metacore-starter-core@161.0.0

## 4.0.0

### Patch Changes

- 0cd5ba5: El chat flotante muestra la mascota de la plataforma (piel y estado animado, `mascot_skin`) en la fila de Aby y en la cabecera de su conversación, igual que la bandeja de `/team-chat`, en vez de un ícono genérico de Lucide.
  - @asteby/metacore-app-providers@151.0.0

## 3.1.0

### Minor Changes

- 3ed6083: `openAbyWidget({ message, send: true })` abre una conversación nueva con Aby y envía la pregunta en cuanto se abre el panel (buscador, tablero, voz). Además, un borrador sin conversación previa ya no deja el panel en la lista de conversaciones con el texto escondido: abre una conversación nueva con el texto en el compositor.

## 3.0.0

### Minor Changes

- 47d97d9: Chat del asistente: al recargar el historial, los avisos de turno fallido guardados (`metadata.turn_error`) vuelven como burbuja de error con «Reintentar» (reenvía la pregunta previa) en lugar de texto plano; nuevo `abyTurnErrorFromMeta`. `pollAbyAssistantReply` ya no sondea el historial ~5 min con la red caída: se detiene si el navegador está sin conexión o tras `maxNetworkFailures` (3) fallos consecutivos sin respuesta HTTP (`AbyNetworkDownError`), y un aviso `turn_error` encontrado al sondear se reporta como error clasificado (`AbyHistoryTurnError`) en vez de como respuesta.

### Patch Changes

- Updated dependencies [944dd83]
- Updated dependencies [420ff5b]
- Updated dependencies [47d97d9]
  - @asteby/metacore-app-providers@150.0.0
  - @asteby/metacore-ui@2.28.0
  - @asteby/metacore-runtime-react@52.0.0
  - @asteby/metacore-starter-core@160.0.0

## 2.0.0

### Patch Changes

- Updated dependencies [bdc8a60]
- Updated dependencies [019192d]
- Updated dependencies [bdc8a60]
- Updated dependencies [bdc8a60]
  - @asteby/metacore-runtime-react@51.0.0
  - @asteby/metacore-ui@2.27.0
  - @asteby/metacore-starter-core@159.0.0
  - @asteby/metacore-app-providers@149.0.0

## 1.0.0

### Patch Changes

- Updated dependencies [b285f48]
  - @asteby/metacore-runtime-react@50.2.0
  - @asteby/metacore-app-providers@148.0.0
  - @asteby/metacore-starter-core@158.0.0

## 0.3.1

### Patch Changes

- 33e73fb: Chat de equipo: el encabezado de la lista ya no pinta un fondo sólido (se veía como un cuadro en el tema glass) y el hilo usa la superficie de tarjeta en escritorio.

## 0.3.0

### Minor Changes

- 56448c3: Sincroniza con ops (mascot-face-store, agent-suggestions, mascotName en el PiP, speech-dictation) y exporta ImmersiveCopilot, sonidos y stores.

## 0.2.0

### Minor Changes

- 3812cb9: Nuevo paquete: espacio de trabajo del agente completo (chat con historial, widget, chat de equipo con llamadas, guías) con todos los acoplamientos del host inyectados por puertos.
