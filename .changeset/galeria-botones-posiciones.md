---
"@asteby/metacore-runtime-react": patch
---

Galería de una relación 1:N:

- Los botones de cada tarjeta ya no se recortan: la barra de acciones envuelve a otra línea cuando la tarjeta es angosta (140 px o móvil) y el botón de eliminar siempre es visible.
- Posiciones sin repetir. Dos subidas seguidas ya no leen el mismo máximo de una lista que aún no se refrescó. Al terminar una subida y al eliminar una foto, el panel lee las filas del servidor y las renumera de forma contigua (0..n-1); las filas que un cliente anterior dejó con la misma posición se ordenan por antigüedad, así la original queda primero. Solo se escriben las filas cuya posición cambia.
