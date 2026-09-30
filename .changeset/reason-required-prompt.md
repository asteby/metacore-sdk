---
"@asteby/metacore-runtime-react": minor
---

Motivo obligatorio al eliminar/cancelar (PER-4). Un modelo que declara `reason_required` en su manifest responde 422 `errors.reason` a un DELETE o acción sin motivo; `useReasonPrompt().run({ request })` prueba la petición, y si el servidor lo exige pregunta una vez (`ReasonPromptDialog`) y reintenta con `reason`. Ya cableado en la eliminación de fila, la eliminación masiva (un motivo para el lote) y los modales de acción (confirmación y formulario). `ActivityEvent.reason` se pinta en `ActivityDiff` («Motivo: …»). `useAddonSettings`/`useUpdateAddonSettings` aceptan `branchId` para leer/escribir los ajustes por sucursal (`settings[].scope: branch`, POS-1); `addonSettingsKey`/`addonSettingsUrl` lo respetan.
