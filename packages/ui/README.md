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
| `@asteby/metacore-ui/profile` | Detail-page kit (mobile-first): `ProfileHeader`, `SectionCard`, `StatStrip`, `DefinitionList`, `RecordList`/`RecordRow`, `ContactLink`, `EmptyState`, `PillTabsList`/`PillTabsTrigger`. |
| `@asteby/metacore-ui/lib` | `cn`, `getPageNumbers`, `getCookie`/`setCookie`/`removeCookie`, `resolveColorCss`/`resolveColorHex`/`generateBadgeStyles`. |

`Button` sizes: `default | sm | lg | icon` plus the opt-in roomier `comfortable` (h-11), `comfortable-lg` (h-12) and `icon-comfortable` (size-11). All buttons get a pressed state (`scale .98`, disabled under `prefers-reduced-motion`). `Sidebar` honours the optional host variables `--app-topbar-h`, `--app-notice-h` (fixed top chrome) and `--app-bottombar-h` (mobile sheet bottom offset); all default to 0.

## Decoupling from app internals

Several components that in the source app depended on a zustand `auth-store`, a Vite-specific `api` client, or a tanstack-router `<Link>` have been refactored to receive their data via props:

- **`AppSidebar`** — receives `navGroups`, `currentHref`, `LinkComponent`, `header`, `footer`, and `isLoading` as props (no internal auth/navigation fetching).
- **`NavGroup`** / **`NavUser`** / **`ProfileDropdown`** — no longer read from an auth store. `NavUser` / `ProfileDropdown` accept children for the menu body and an optional sign-out callback.
- **`CommandMenu`** — receives `navGroups`, `onNavigate`, and optional `onThemeChange` instead of pulling from `useSearch` / `useTheme` / a hardcoded `sidebarData`.
- **`AuthenticatedLayout`** — pure shell. Consumers compose their own provider tree (theme, i18n, query client, websocket, etc.) around it and pass the `sidebar`, `headerChildren`, `topBanner`, and `widget` slots.
- **`FilterableColumnHeader`** — the app-specific `date_range` filter type and remote `filterSearchEndpoint` variant were removed to avoid pulling in `react-day-picker` and an HTTP client. `select`, `boolean`, `text`, and `number_range` remain.

Features intentionally **not** vendored: `branch-switcher`, `organization`, `top-nav`, `config-drawer`, `notifications-dropdown`, `ai-chat` — those are app-specific and belong in the consumer app.

## States, page header, QR and segmented control

Theme tokens only (the app sets the palette), keyboard- and screen-reader-ready:

```tsx
import { DataState, PageHeader, QrCodeFrame } from '@asteby/metacore-ui/shared'
import { SegmentedControl } from '@asteby/metacore-ui/primitives'
import { PillTabsList, PillTabsTrigger } from '@asteby/metacore-ui/profile'

// Every non-success state of a query-backed surface
<DataState kind="error" description="Hace 5 min" onRetry={refetch} />
<DataState kind="demo" compact description="Datos demostrativos, no mediciones" />
// kinds: loading | empty | error | forbidden | offline | stale | partial | demo

<PageHeader
  icon={Inbox}
  title="Bandeja"
  description="Conversaciones de todos los canales"
  badges={<Badge variant="muted">Demo</Badge>}
  actions={<Button>Nueva</Button>}
  overflowActions={[{ key: 'export', label: 'Exportar', onSelect: exportCsv }]}
/>

<QrCodeFrame src={qrDataUrl} alt="Código QR para vincular WhatsApp" expired={expired} onRefresh={restart} />

<SegmentedControl aria-label="Vista" value={view} onValueChange={setView}
  items={[{ value: 'list', label: 'Lista', icon: List }, { value: 'kanban', label: 'Kanban', icon: Columns3 }]} />

<PillTabsTrigger value="open" count={12}>Abiertas</PillTabsTrigger>
```

Optional i18n keys (Spanish fallbacks): `data_state.<kind>`, `data_state.retry`,
`page_header.more`, `qr_frame.loading`, `qr_frame.expired`, `qr_frame.refresh`.

## Link previews

WhatsApp/Slack-style cards for news, posts and evidence. The components **never fetch external sites**:
the backend extracts the metadata (`og:title`, `og:image`, site name, favicon...) and the app passes it in.
Route images through your own proxy with `resolveImageUrl`.

```tsx
import { LinkPreviewCard, MediaGrid, SourceBadge, FaviconAvatar } from '@asteby/metacore-ui/shared'

const proxy = (u: string) => `/api/media/proxy?url=${encodeURIComponent(u)}`

<MediaGrid aria-label="Evidencias" minItemWidth={300}>
  {items.map(n => (
    <LinkPreviewCard
      key={n.id}
      variant="rich"               // compact | row | rich | hero
      data={{ url: n.url, title: n.title, description: n.summary, imageUrl: n.ogImage,
              siteName: n.siteName, faviconUrl: n.favicon, kind: 'article', publishedAt: n.publishedAt }}
      resolveImageUrl={proxy}
      meta="Colima · Seguridad"
      badges={<Badge variant="outline">+3 medios</Badge>}
      onSelect={() => openDetail(n.id)} // optional: card becomes a button, external link stays secondary
    />
  ))}
</MediaGrid>

<SourceBadge domain="medio.mx" siteName="El Medio" faviconUrl={fav} suffix="· hace 2 h" />
<FaviconAvatar domain="medio.mx" size="md" />
```

- Fixed aspect ratios (16:9 for `rich`/`hero`, square thumbnails for `row`/`compact`) → no layout shift;
  skeleton + blur while loading; favicon + domain + initial fallback when there is no image or it fails.
- Whole card clickable (stretched link/button) with visible focus; badges, footer and the secondary
  external link remain focusable. External links use `target="_blank" rel="noopener noreferrer nofollow"`.
- `loading` renders a skeleton with the same footprint. `formatRelativeTime(date, { now, locale })` and
  `domainFromUrl(url)` are exported. Labels follow `locale` (`es` default, `en`).

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
