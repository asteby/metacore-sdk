---
"@asteby/metacore-runtime-react": patch
---

DynamicKanban: las lanes ahora aprovechan el ancho del viewport. Crecen (flex-1) para llenar el contenedor cuando todas caben, con un ancho mínimo legible (280px) y un máximo razonable (420px); el scroll horizontal solo aparece cuando ya no caben. Elimina el espacio muerto a la derecha y las columnas angostas al reducir la ventana.
