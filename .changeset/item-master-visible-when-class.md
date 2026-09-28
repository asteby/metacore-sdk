---
"@asteby/metacore-runtime-react": minor
---

`visible_when.class` (kernel v3 attribute classes): el formulario muestra un campo de extensión solo cuando la categoría del registro (o una de sus categorías padre) lleva la clase. `useAttributeClasses` resuelve las clases desde `attribute_classes` de la categoría; `filterVisibleFields` y `stripHiddenFieldValues` aceptan las clases, así que un campo oculto no se valida ni se envía.
