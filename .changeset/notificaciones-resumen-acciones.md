---
'@asteby/metacore-notifications': minor
---

Toasts de notificación: el cuerpo ya no lleva `block`, que anulaba `line-clamp-2`; el título se trunca a una línea con el texto completo en `title`. Nuevas opciones `summary` (texto plano que sustituye al cuerpo en el toast) y `actions` (botones extra), también en `installUnifiedToasts` y en la ingesta en vivo (`payload.summary`/`payload.actions` o `metadata.summary`/`metadata.actions` con `{label, link}`, validados con `linkActions`). El temporizador de cierre se pausa mientras el toast tiene el foco.
