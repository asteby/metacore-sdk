---
"@asteby/metacore-runtime-react": minor
---

Paso asistido por IA en los wizards declarativos (`form_layout.sections[].assist`, kernel ≥ 0.141.0): `AssistInterview` renderiza dentro del paso una entrevista conversacional guiada por el proveedor del host (`/assist/:provider/sessions`): una pregunta a la vez con efecto de escritura, progreso en vivo (leyendo el sitio, buscando logo, detectando colores, IA…), tarjetas de vista previa (logo en claro/oscuro, paleta) y respuestas rápidas; al terminar rellena los campos `output` del formulario. Disponible en `DynamicRecordDialog` y `DynamicForm`.
