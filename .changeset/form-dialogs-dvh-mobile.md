---
"@asteby/metacore-runtime-react": patch
---

Modales de crear/editar y de acciones (incluida crear orden de compra con line-items) usan `90dvh` en vez de `90vh`: en móvil el `vh` contaba el alto detrás de la barra del navegador y empujaba el footer con **Guardar/Crear** fuera de lo visible. Con `dvh` el botón queda siempre alcanzable.
