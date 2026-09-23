---
"@asteby/metacore-runtime-react": patch
---

Los modales de acción que precargan renglones desde el registro (`$prefillFromRecord`, p. ej. "Recibir" de una orden de compra) ahora cargan las líneas desde la relación declarada del modelo cuando la fila de la lista no las trae. Antes el modal abría con "Sin renglones".
