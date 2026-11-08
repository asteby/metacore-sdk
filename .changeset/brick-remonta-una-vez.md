---
"@asteby/storefront-react": patch
---

El formulario de tarjeta embebido ya no muestra «No pudimos cargar el formulario de tarjeta» en el primer montaje en frío: si el primer montaje del proveedor agota `sdkTimeoutMs` (o falla sin ser crítico), el hook lo remonta UNA vez en silencio (el segundo, con script y assets en caché, queda listo en un segundo) y el comprador sigue viendo «cargando». Nunca sobre un reto pendiente ni ante un `form_error` crítico; montar no cobra nada. Opción nueva `mountRetries` (por omisión 1; 0 = mostrar el aviso de inmediato). El presupuesto se renueva cada vez que el formulario queda listo.
