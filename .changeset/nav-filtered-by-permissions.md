---
"@asteby/metacore-runtime-react": minor
"@asteby/metacore-ui": minor
"@asteby/metacore-starter-core": minor
---

PIT-044: el menú lateral se filtra por los permisos efectivos del rol. `@asteby/metacore-ui` agrega `filterNavGroups`, `NavLinkItem.requires` y la prop `isItemVisible` de `AppSidebar`; `@asteby/metacore-runtime-react` agrega `useNavItemVisible`, `isNavItemAllowed`, `capabilityForNavItem` (una entrada `/m/<modelo>` exige `<modelo>.index`; las demás rutas no se bloquean) y `useNavigation` respeta `NavItem.requires`; el `AppSidebar` de starter-core lo aplica. Sin `PermissionsProvider` (o con `isAdmin`) no se oculta nada.
