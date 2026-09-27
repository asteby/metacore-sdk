---
"@asteby/metacore-runtime-react": patch
---

PermissionsManager: el selector de módulo elige la entrada, no la key. Dos entradas del menú sobre el mismo modelo (p. ej. "Ventas POS" y "Por cobrar" sobre sales_orders) ya no caen siempre en la primera. Si el servidor rechaza crear o editar un rol (422 nombre duplicado), el motivo aparece dentro del diálogo y el diálogo sigue abierto. El catálogo de validación traduce `protected_field`, que antes caía en "valor inválido".
