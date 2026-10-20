---
"@asteby/metacore-notifications": minor
"@asteby/metacore-runtime-react": minor
---

Origen de avisos y etiquetas de enum siempre traducidos. notifications: el chip/eyebrow usa el nombre registrado por el host (`registerModuleLabel`/`registerModuleLabels`), luego `metadata.addon_name` del servidor y, si falta, la clave humanizada («Channel Orders»), nunca la clave cruda. runtime-react: la columna de etapa (`stage_field`) sin `options` pinta la etiqueta traducida de `stages[]` («Listo», no «Ready») y una opción con `labelKey` sin resolver se traduce en el cliente.
