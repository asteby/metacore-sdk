---
"@asteby/metacore-runtime-react": minor
---

AddonConfigSurface: los campos de credencial ya guardados abren bloqueados (lápiz para editar, ojo para ver; el ojo de un secreto solo con `canRevealSecrets`, vía `GET /integrations/:provider/values/:key/reveal`) y el navegador ya no los rellena (solo lectura hasta enfocar, `name` estable, `autocomplete` por tipo). Al cambiar el selector de entorno (`environment`/`mode`/`env`) los campos por entorno se intercambian por los guardados para ese entorno (`GET …/values?environment=`) en vez de pedirlos de nuevo.
