---
"@asteby/metacore-genui": patch
---

Endurecimiento del contrato `genui/v2` antes de los renderizadores: ningún segmento (separado por `.`, `:` o `@`) de una clave i18n `$t`, de `formField.depends_on`, de una clave de fila (`table.rows[]`, `data.*.inline[]`) ni de los identificadores usados como clave de registro (`widget`, `icon`, `addon`, `invoke.action`, `emit.id`, `slot.name`, `ext`, `id` de bloque, `name`) puede ser `__proto__`, `constructor` ni `prototype` (`genui.forbidden_key`; `asset:<id>` de `media.src` por patrón). `key` cierra los segmentos vacíos (`a..b`, `a.`), `depends_on` debe apuntar a un campo del mismo formulario (`genui.unknown_target`) y `propertyNames` admite `x-no-proto`. Un overlay o una fuente llamados `constructor` ahora fallan antes con `genui.forbidden_key`.
