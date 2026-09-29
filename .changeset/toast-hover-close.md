---
"@asteby/metacore-ui": minor
"@asteby/metacore-i18n": minor
"@asteby/metacore-starter-core": patch
---

Los toasts se cierran con una "x" al estilo de macOS. El `Toaster` de `@asteby/metacore-ui/primitives` agrega a cada toast (success, error, info, warning, loading, con acción y `toast.custom`) un botón circular de 18 px en la esquina superior izquierda, de vidrio con los tokens del tema, que aparece con fade y escala al pasar el mouse o enfocar con teclado y queda siempre visible en pantallas táctiles. El auto-cierre sigue pausado mientras el mouse está encima. Se desactiva con `closeButton={false}` (o por toast con `closeButton: false` / `dismissible: false`); `closeButtonLabel` fija el `aria-label`, que por defecto sale de la clave `toast.dismiss` ("Cerrar notificación" / "Dismiss notification"), nueva en `@asteby/metacore-i18n`. El `Toaster` de `@asteby/metacore-starter-core` ahora envuelve el de `@asteby/metacore-ui`.
