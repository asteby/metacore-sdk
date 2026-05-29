---
"@asteby/metacore-ui": minor
---

Helpers genéricos de navegación de addons en `@asteby/metacore-ui/layout`: `resolveIconName` (resuelve cualquier ícono Lucide con fallback neutro), `humanizeNavKey`/`translateNavTitle` (red de seguridad i18n: una key namespaced sin traducir degrada al último segmento humanizado en vez de filtrar la key cruda) y `addonGroupToCollapsibleItem` (convierte un grupo de addon en un item padre colapsable con ícono e hijos indentados, la forma que `<NavGroup>` renderiza como dropdown). Con esto cualquier addon de terceros se ve pro por defecto, sin que el autor declare íconos ni i18n.
