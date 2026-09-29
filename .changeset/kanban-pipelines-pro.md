---
"@asteby/metacore-runtime-react": minor
"@asteby/metacore-ui": patch
"@asteby/metacore-marketplace": patch
"@asteby/metacore-starter-core": patch
---

Kanban de pipelines a nivel pro.

- **La tarjeta arrastrada queda bajo el cursor.** El `DragOverlay` de dnd-kit se pinta en `<body>` (`PortalDragOverlay`, exportado). Con el tema glass, el panel de la página tiene `backdrop-filter` y se volvía el bloque contenedor del overlay `fixed`, que aparecía desplazado a la derecha y abajo. Lo mismo para la barra de acciones masivas de las tablas, el modal de instalación del marketplace y el veil de licencia.
- **Las columnas no permitidas se marcan al levantar la tarjeta y no aceptan el drop.** `isTransitionAllowed` sigue la misma regla que `StageMachine.Allows` del kernel: sin `transitions` en la metadata no hay restricción; una lista vacía no permite movimientos entre etapas; una tarjeta sin etapa (o con una ajena a la máquina) puede ir a cualquier etapa. Soltar en una columna no permitida devuelve la tarjeta a su lugar, sin petición ni toast.
- **Movimiento optimista con rollback animado.** El movimiento corre sobre `useOptimisticMutation`; si el servidor lo rechaza, la tarjeta vuelve a su columna con `useFlipAnimation` (nueva opción `shouldAnimate`) y un toast con el motivo. El drop anima la tarjeta hasta su nuevo lugar.
- **Totales por columna.** El encabezado muestra el conteo real del servidor y la suma de cada columna que declara `display_config.aggregate`, en la moneda de la org, y se recalculan en vivo mientras un movimiento está en curso.
- **Tarjetas sin filas vacías.** Un campo sin valor (o con un uuid sin resolver) no se pinta como "Canal: —"; la tarjeta muestra los siguientes campos que sí tienen valor. La búsqueda por columna encuentra una relación por su nombre.
- **Auto-scroll horizontal y teclado.** Cerca del borde el tablero se desplaza solo; con teclado, Espacio/Enter levanta la tarjeta, ←/→ cambian de columna y Escape cancela, con anuncios para lector de pantalla.
- `DynamicKanban` y `DynamicTable` toman la moneda y la zona horaria del `OrgRuntimeProvider` cuando no llegan por prop (antes el dinero caía a USD).
- `useApi()` reenvía al cliente del host exactamente los argumentos recibidos, sin un `config` `undefined` al final.
