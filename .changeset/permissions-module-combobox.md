---
'@asteby/metacore-runtime-react': patch
---

PermissionsManager: the module picker is now a grouped combobox (same Popover + Command pattern as the role selector) instead of an always-visible flat list. The long list felt heavy in the left column; the combobox is compact, opens to the grouped+searchable modules (GENERAL, CLIENTES, PUNTO DE VENTA…), and shows the selected module with its icon. Selecting an option reveals its action grid on the right. Granted-count badges appear per option.
