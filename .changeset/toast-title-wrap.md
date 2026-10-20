---
"@asteby/metacore-notifications": patch
---

El título del toast ya no se corta en una línea con «…»: se ajusta hasta 3 líneas (`line-clamp-3 break-words`) y conserva el texto completo en el tooltip. Un error como «No se pudo verificar la conexión: Mercado Pago respondió HTTP 403…» perdía la causa en «Mercad…».
