---
"@asteby/metacore-runtime-react": patch
---

`AddonConfigSurface`: un campo de credencial oculto por `visible_when` (propio o de su sección de `form_layout`) ya nunca es obligatorio, no se valida, no cuenta en el estado de error del paso y no se envía. Antes se validaban TODOS los campos declarados: un conector con proveedores condicionales (connector_email con Resend/SendGrid/Mailgun) pedía la API key de SendGrid al guardar con Resend. Las secciones con `visible_when` también desaparecen como pasos del asistente, y el mensaje de error nombra solo campos aplicables. Helpers puros nuevos: `applicableFields`, `visibleSections`, `predicateHolds`.
