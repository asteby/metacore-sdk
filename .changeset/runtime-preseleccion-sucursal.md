---
"@asteby/metacore-runtime-react": minor
---

Los selectores de relación respetan la sucursal activa del lado del cliente. (1) Cambiar la sucursal con un formulario o modal de acción abierto vuelve a pedir las opciones (`useOptionsResolver` y `useResolveOptionIds` ponen la sucursal activa en sus dependencias; antes se quedaban con las filas de la sucursal anterior); un valor elegido que deja de ser visible bajo la sucursal nueva se verifica por id, se quita y se avisa. (2) Un campo relación requerido, vacío y sin tocar con exactamente una opción se preselecciona (nuevo `autoSelectSole`, por omisión activo; apagado con `autoSelectSole: false` en el manifest o la prop; no aplica a registros existentes ni a listas filtradas por búsqueda). Piezas nuevas exportadas desde `branch-scope`: `useActiveBranchSignature`, `useSoleOptionPreselect`, `soleOptionToPreselect`, `reconcileAutoSelection`. Pruebas y README.
