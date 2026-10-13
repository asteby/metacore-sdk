# @asteby/metacore-genui

## 1.0.0

### Minor Changes

- 4039e53: Nuevos paquetes. `@asteby/metacore-genui`: UI generativa segura por metadatos — valida (`parseUISpec`) y dibuja especificaciones `genui/v1` del agente con una lista blanca de componentes (texto, KPI, tarjeta, tabla, enlaces, línea de tiempo, gráfica SVG con resumen accesible y formulario de confirmación), sin HTML ni scripts; `createGenerativeUIResult` la registra en el registro de resultados del agente. `@asteby/metacore-automations`: cliente REST, hooks y pantalla de automatizaciones dinámicas (lista con filtros, detalle con autoría «persona con asistente», confirmación de propuestas, pausa/reanudación, simulación, historial y editor generado del JSON Schema `automation/v1`), más `automationUIActionHandler` para las tarjetas del chat.

### Patch Changes

- Updated dependencies [019192d]
- Updated dependencies [bdc8a60]
  - @asteby/metacore-ui@2.27.0
