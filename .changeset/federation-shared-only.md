---
"@asteby/metacore-starter-config": minor
---

`metacoreFederationShared({ only })`: declara SOLO un subconjunto de los singletons canonicos (misma config canonica por clave; el router host-only conserva `import: false` en remotes). Un remote que declara un shared que no importa rompe `loadShare` (`M_ID`), asi que los addons pueden migrar al helper sin arrastrar singletons de mas. Nombre desconocido en `only` lanza error; `hostProvided`/`extras`/`extra`/`overrides` se aplican encima de `only`; en `overrides`, una propiedad `undefined` se elimina. `assertMetacoreFederationShared(shared, { partial })` relaja la exigencia de presencia. Sin `only` el comportamiento no cambia. El guard de `shared` a mano acepta configs generadas con `only`.
