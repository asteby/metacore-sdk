---
"@asteby/metacore-runtime-react": patch
---

Corrige que al editar un registro (p. ej. un renglón dentro de una relación) un campo select con valor se borrara al guardar sin tocarlo. `DynamicForm` siembra los valores del registro de forma síncrona, ignora el `onValueChange('')` espurio del Select cuando ya hay valor y `''` no es opción válida, y en edición no manda selects vacíos que el usuario no tocó. `deriveRelationFormFields` ahora copia `readonly` de la columna, y el modal de alta/edición de renglón limita su alto al viewport con cuerpo con scroll y botones fijos abajo.
