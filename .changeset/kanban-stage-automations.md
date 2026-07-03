---
"@asteby/metacore-runtime-react": minor
---

DynamicKanban: automatizaciones de etapa (estilo Bitrix). Cada lane suma un botón ⚡ que abre un diálogo para configurar reglas "al entrar a esta etapa → agregar tag / quitar tag / setear campo = valor", genéricas para cualquier modelo. Las reglas viven en el backend vía el cliente HTTP existente (`/stage-automations`), con toggle de activación, eliminación e indicador de conteo activo en el header del lane. La feature es no-intrusiva: si el endpoint no existe (404/error) el afford ⚡ simplemente no se muestra y el tablero sigue funcionando. Todo el texto pasa por `t('dynamic.automations.*')` con `defaultValue` en español.
