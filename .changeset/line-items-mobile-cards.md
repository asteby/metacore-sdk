---
"@asteby/metacore-runtime-react": patch
---

Line-items declarativos (`DynamicLineItems`) responsive en móvil: la tabla de N columnas no cabía en un teléfono (obligaba a scroll horizontal renglón por renglón). En móvil cada renglón se vuelve una **card apilada** con sus columnas como campos etiquetados —mismo widget de celda, editable con el pulgar—, el botón "Agregar renglón" ocupa el ancho completo y los totales se muestran como resumen. De `sm` en adelante se conserva la tabla. Beneficia a todo modal con renglones (crear orden de compra, recepción de mercancía, asientos contables).
