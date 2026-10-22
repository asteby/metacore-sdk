---
'@asteby/metacore-ui': minor
'@asteby/metacore-sdk': minor
---

`ResponsiveDialog` en `@asteby/metacore-ui/modal` (PR S-3 del plan UI/UX móvil): diálogo centrado desde 768px y bottom sheet por debajo (asa, deslizar para cerrar, `max-h-[92dvh]`, cuerpo con scroll, pie sticky con safe-area y teclado). El pie es declarativo con jerarquía fija (`primary`, `secondary`, `destructive` con confirmación integrada y `extra` del host). `Modal` y `FormModal` pasan a montarse encima, con las mismas props más `footerActions`/`mobile` y `footerExtra`; en móvil ahora se abren como bottom sheet (`mobile='dialog'` conserva el centrado). En `@asteby/metacore-sdk`: `ModalProps.footerExtra` y `ActionModalProps.footerExtra` opcionales (`ModalFooterAction[]`), para que el host añada acciones al pie sin portales.
