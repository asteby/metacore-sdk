---
"@asteby/metacore-runtime-react": minor
---

Una sola acción primaria de alta por pantalla. `resolveListPrimaryAction` oculta el Crear genérico cuando hay `placement: create`, `replaces_create`, `create_mode: hidden|action`, `canCreate: false` o `ModelExtension.primaryActionKey`. Si dos acciones reclaman el alta, solo una lleva `data-primary`.
