---
"@asteby/metacore-runtime-react": minor
---

`AddonConfigSurface`: Guardar siempre disponible y refresco en el sitio. El pie del modal (fuera del scroll) lleva «Guardar» en TODOS los pasos del asistente (antes solo en el último; «Siguiente» queda como acción secundaria) y un estado «Sin cambios / Cambios sin guardar / Guardando… / Guardado» (aria-live). Tras guardar ya no se cierra: recarga en el sitio las credenciales guardadas (secretos en blanco, campos marcados como guardados), los ajustes y vuelve a listar los selects dependientes (series, entorno, régimen), sin perder paso, scroll ni foco; «Cancelar» pasa a «Cerrar» cuando no hay cambios. «Probar conexión» también refresca los selects dependientes tras persistir.
