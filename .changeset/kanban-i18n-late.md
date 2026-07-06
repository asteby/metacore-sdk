---
'@asteby/metacore-runtime-react': patch
---

fix(kanban): las etiquetas de lane dejan de mostrar la clave i18n cruda cuando el bundle del addon llega tarde. Un hook (useI18nResourceVersion) re-resuelve las etiquetas al mergearse el bundle async (addResourceBundle), sin depender del bindI18nStore del host.
