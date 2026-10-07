---
"@asteby/metacore-runtime-react": minor
---

`ApiProvider` acepta `batch={false}` para no agrupar lecturas en `POST /q`: un host cuyo backend no implementa `/q` ya no paga un POST fallido por cada lectura. Además, con el batch activo, si `/q` responde 404/405 el cliente deja de intentarlo tras el primer fallo y la lectura se resuelve por el GET normal. El comportamiento por defecto no cambia para hosts que sí tienen `/q`.
