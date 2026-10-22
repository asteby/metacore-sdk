---
'@asteby/metacore-runtime-react': minor
---

Componentes de UI declarativa de setup y salud de addons: `SetupFlow` (flujo reanudable de `contributions.setup` con pasos check/form/action/records/custom, estados por paso, `depends_on`, omitir opcionales, polling con backoff y `retry_after_s`, diagnósticos con botón de fix y autoguardado visible), `RecordsTable`, `HealthCard` y `StepStatusBadge`, con textos es/en. Además `AddonConfigSurface`, el diálogo unificado de configuración de addons movido desde ops (secretos write-only, probar conexión, dynamic_select, aviso de llave pegada en el campo equivocado, ajustes con `visible_when` y `write_only`). Nuevo subpath `@asteby/metacore-runtime-react/setup`.
