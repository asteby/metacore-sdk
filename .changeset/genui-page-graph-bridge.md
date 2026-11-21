---
"@asteby/metacore-genui": minor
---

Puente entre el grafo de pagina y la fusion de overlays de Loom: `toBlockGraph` / `fromBlockGraph` (arbol <-> lista plana `{ id, type, region, config, fallback }`, sin perdida para add/remove/move/configure/replace). `props` ya no admite la clave `visible` (la gobierna el nodo).
