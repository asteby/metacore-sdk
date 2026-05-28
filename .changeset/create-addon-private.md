---
"create-metacore-addon": patch
---

Marcar create-metacore-addon como `private: true` para deshabilitar publicación al npm. El package falla con E403 al publish porque el token NPM_TOKEN no tiene permiso para crear packages unscoped — el publishConfig.access no resuelve esto. Decisión sobre naming (mantener unscoped con cuenta personal del owner vs migrar a `@asteby/create-metacore-addon`) queda como follow-up.
