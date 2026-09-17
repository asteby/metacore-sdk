---
"@asteby/metacore-ui": minor
"@asteby/metacore-runtime-react": minor
---

`ProcessStepper` llega a `@asteby/metacore-ui/wizard`: el indicador de pasos de los modales de proceso (círculos con icono o número, check al completar, etiqueta debajo y conectores flexibles), una sola implementación para toda la plataforma.

`runtime-react`: los wizards declarativos (`form_layout.mode = "steps"`) en `DynamicForm` y `DynamicRecordDialog` ahora usan ese stepper en lugar de la barra de progreso plana, con navegación hacia atrás al pulsar un paso completado.
