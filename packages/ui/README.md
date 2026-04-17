# @asteby/metacore-ui

Reusable UI kit for the Metacore ecosystem: a modular TanStack-Table data-table, a shell-ready layout (sidebar + header + authenticated shell), a keyboard-driven command palette, hooks, dialogs, and a curated set of shadcn/ui primitives — all built against React 19, Tailwind 4, and Radix.

## Install

```bash
pnpm add @asteby/metacore-ui @asteby/metacore-theme react react-dom react-i18next \
  @tanstack/react-router @tanstack/react-table @tanstack/react-query
```

Peer dependencies are kept loose on purpose (React `>=18`, TanStack packages for the pieces that use them, `tailwindcss >=4`).

## Quick start

Import Tailwind tokens + shadcn primitives from `@asteby/metacore-theme`, then pull building blocks from the appropriate subpath:

```tsx
import { AuthenticatedLayout, AppSidebar, NavUser } from '@asteby/metacore-ui/layout'
import { DataTableToolbar, DataTablePagination } from '@asteby/metacore-ui/data-table'
import { CommandMenu } from '@asteby/metacore-ui/command-menu'
import { useTableUrlState } from '@asteby/metacore-ui/hooks'
import { Button, Input } from '@asteby/metacore-ui/primitives'
import { cn } from '@asteby/metacore-ui/lib'
```

## Subpath exports

| Entry | What lives here |
| --- | --- |
| `@asteby/metacore-ui` | Everything (avoid — use subpaths for tree-shaking). |
| `@asteby/metacore-ui/data-table` | `DataTableToolbar`, `DataTableBulkActions`, `DataTableFacetedFilter`, `DataTableViewOptions`, `DataTablePagination`, `DataTableColumnHeader`, `FilterableColumnHeader`. |
| `@asteby/metacore-ui/layout` | `AuthenticatedLayout`, `AppSidebar`, `Header`, `NavGroup`, `NavUser`, `TeamSwitcher`, `ProfileDropdown`, `OrganizationCard`. |
| `@asteby/metacore-ui/dialogs` | `ConfirmDialog`, `LearnMore`, `LongText`, `PasswordInput`, `SelectDropdown`, `SkipToMain`. |
| `@asteby/metacore-ui/command-menu` | `CommandMenu` (router-agnostic). |
| `@asteby/metacore-ui/hooks` | `useTableUrlState`, `useDialogState`, `useIsMobile`. |
| `@asteby/metacore-ui/primitives` | shadcn/ui primitives: `Button`, `Input`, `Dialog`, `DropdownMenu`, `Popover`, `Command`, `Select`, `Sidebar`, `Sheet`, `Table`, `Tabs`, `Tooltip`, `ScrollArea`, `Sonner`, `Form`, `Textarea`, `Switch`, `Badge`, `Avatar`, `Checkbox`, `Label`, `Separator`, `Skeleton`, `Collapsible`, `AlertDialog`. |
| `@asteby/metacore-ui/lib` | `cn`, `getPageNumbers`, `getCookie`/`setCookie`/`removeCookie`, `resolveColorCss`/`resolveColorHex`/`generateBadgeStyles`. |

## Decoupling from app internals

Several components that in the source app depended on a zustand `auth-store`, a Vite-specific `api` client, or a tanstack-router `<Link>` have been refactored to receive their data via props:

- **`AppSidebar`** — receives `navGroups`, `currentHref`, `LinkComponent`, `header`, `footer`, and `isLoading` as props (no internal auth/navigation fetching).
- **`NavGroup`** / **`NavUser`** / **`ProfileDropdown`** — no longer read from an auth store. `NavUser` / `ProfileDropdown` accept children for the menu body and an optional sign-out callback.
- **`CommandMenu`** — receives `navGroups`, `onNavigate`, and optional `onThemeChange` instead of pulling from `useSearch` / `useTheme` / a hardcoded `sidebarData`.
- **`AuthenticatedLayout`** — pure shell. Consumers compose their own provider tree (theme, i18n, query client, websocket, etc.) around it and pass the `sidebar`, `headerChildren`, `topBanner`, and `widget` slots.
- **`FilterableColumnHeader`** — the app-specific `date_range` filter type and remote `filterSearchEndpoint` variant were removed to avoid pulling in `react-day-picker` and an HTTP client. `select`, `boolean`, `text`, and `number_range` remain.

Features intentionally **not** vendored: `branch-switcher`, `organization`, `top-nav`, `config-drawer`, `notifications-dropdown`, `ai-chat` — those are app-specific and belong in the consumer app.

## i18n

Components that render user-facing strings (`DataTablePagination`, `DataTableViewOptions`, `DataTableColumnHeader`, `CommandMenu`) use `react-i18next`'s `useTranslation()` hook and expect these keys:

```
datatable.view
datatable.columns
datatable.asc
datatable.desc
datatable.hide
datatable.page_x_of_y       (interpolation: current, total)
datatable.rows_per_page
datatable.go_first_page / go_previous_page / go_next_page / go_last_page / go_page
common.search_command
common.no_results
common.theme / theme_light / theme_dark / theme_system
```

Consumers should register these keys in their i18n resources. The package does **not** bundle translations.

## Build

```bash
pnpm --filter @asteby/metacore-ui build
```

## License

Apache-2.0
