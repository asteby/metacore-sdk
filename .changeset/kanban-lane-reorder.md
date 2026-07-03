---
"@asteby/metacore-runtime-react": minor
---

DynamicKanban: reordenar las columnas del tablero arrastrándolas por su encabezado (estilo Trello/Bitrix). Aplica a todas las lanes —etapas declaradas, etapas custom y smart lanes— con reorden optimista y persistencia por organización vía el endpoint `/stage-layout` del host (`GET`/`PUT` orden completo/`DELETE` restablece). Si el host no expone el endpoint, el drag de columnas queda deshabilitado en silencio y el tablero funciona igual. Se agrega el hook `useStageLayout` y un affordance "Restablecer orden" cuando existe un orden custom.
