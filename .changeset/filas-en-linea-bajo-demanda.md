---
"@asteby/metacore-runtime-react": patch
---

La tabla de filas hijas del formulario de crear (`create_inline`) se carga bajo demanda (`React.lazy`) en vez de ir en el grafo inicial: solo la usa quien crea un registro cuyo modelo la declara. Sin esto, subir a 53.22 hacía crecer el shell de Ops a 857,6 KB gzip y rompía su techo de no-regresión de 856 KB.
