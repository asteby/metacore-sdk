---
"@asteby/metacore-runtime-react": patch
---

`DocumentFormDialog` reinicia tipo y paso al abrirse durante el render, no en un efecto: el primer frame ya es el DocumentEditor del tipo pedido. Antes, si el host lo dejaba montado mientras cambiaban sus formularios (misma ruta para otra vista) o el `initialType`, al abrir se pintaba un instante el wizard «Nuevo documento» o el editor del tipo anterior (QA Pitsline r6, Nota de crédito).
