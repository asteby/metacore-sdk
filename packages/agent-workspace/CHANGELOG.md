# @asteby/metacore-agent-workspace

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
