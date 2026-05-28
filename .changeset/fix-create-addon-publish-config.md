---
"create-metacore-addon": patch
---

Declarar `publishConfig.access: public` en `create-metacore-addon`. Sin este flag npm trata el primer release de un package unscoped como restricted contra tokens de organización y rechaza con E403, bloqueando el resto del release pipeline.
