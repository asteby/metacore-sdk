# @asteby/metacore-permissions

Capability feed, role/grant API, screen-implied capabilities, nav gating and a
ready-made `PermissionsPage` built on `PermissionsManager`. Transport, labels,
navigation and translation are all injected - nothing here knows about a host
app or vertical.

## Adoption

```tsx
import {
  createPermissionsApi, createScreenCapabilityRegistry, PermissionsPage,
  useMyPermissions, filterNavGroupsByCan,
} from '@asteby/metacore-permissions'

const registry = createScreenCapabilityRegistry({
  modules: { product: 'Products' },          // labels for implied caps
  groups: { product: 'Catalog' },
  screenAccess: t('permissions.access'),
})
const api = createPermissionsApi({ http: axiosInstance, registry })
// custom routes: createPermissionsApi({ http, paths: { me: '/v2/me' } })
```

1. **Session feed** - `useMyPermissions({ fetch: api.fetchMyPermissions, userId, scope })`
   returns `{ permissions, role, isAdmin }` (persisted per scope for first paint);
   feed it to `PermissionsProvider` from `@asteby/metacore-runtime-react`.
2. **Page** - `<PermissionsPage api={api} groups={navGroups} extraItems={addonItems} registry={registry} translate={t} labels={{ title: t('permissions.title') }} />`.
   States: loading (aria-busy skeleton), error (role=alert + retry), empty, ready.
   Syncing invalidates `MY_PERMISSIONS_QUERY_KEY` so the signed-in user's gating refreshes.
3. **Nav gating** - `filterNavGroupsByCan(groups, can, { trusted: sidebarTrustedPaths(host, addon), adminShellUrls })`.
   Rules: `/m/<model>` needs `<model>.index`; addon screens need `screen.<slug>.access`;
   `adminShellUrls` (default: small generic set) need the same probe; `folderKey` needs
   `folder.<key>.access`; server-trusted leaves skip legacy probes.

Peers: `@asteby/metacore-runtime-react`, `@asteby/metacore-ui`, `@tanstack/react-query`, `react`.
Backend contract: `GET /permissions/me`, `GET /permissions/modules` (`modules`, `general`,
`screen_implies`; legacy `data[]` accepted), roles CRUD and `POST .../sync` (full replace).
