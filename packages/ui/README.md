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

## Page header, ActionBar, PageShell and BackLink (mobile-first)

```tsx
import { ActionBar, BackLink, PageHeader, PageShell, type ActionItem } from '@asteby/metacore-ui/shared'

const items: ActionItem[] = [
  { key: 'dispatch', label: 'Despachar', priority: 'primary', run: dispatch },
  { key: 'edit', label: 'Editar', icon: <Pencil />, run: edit },
  { key: 'print', label: 'Imprimir', icon: <Printer />, priority: 'overflow', run: print },
  { key: 'delete', label: 'Eliminar', destructive: true, confirm: { title: '¿Eliminar SO-00004?' }, run: remove },
]

<PageShell header={
  <PageHeader
    leading={<BackLink asChild><Link to='/m/warehouse_orders'>Órdenes</Link></BackLink>}
    title='SO-00004' titleKind='identifier' subtitle={customerLink}
    badges={<Badge>Por surtir</Badge>}
    actions={<ActionBar items={items} />}
  />
}>
  {body}
</PageShell>
```

`ActionBar` rules (pure planner exported as `planActionBar` for adapters/tests):

- **One primary.** The first `priority: 'primary'` is the only `variant=default`; later ones are demoted to secondary.
- **Collapse by measurement, not only breakpoint.** A `ResizeObserver` measures the bar and moves secondaries into «⋯» from the end until primary + secondaries + «⋯» fit. `maxVisible` (default `{ base: 2, md: 3, lg: 4 }`, primary included, viewport breakpoints) is an upper bound and the first-paint plan. The bar never wraps to two lines; the primary never collapses (its label wraps instead).
- **Destructive** items never render inline: they go last in «⋯», after a divider, in `text-destructive`, and confirm (`ConfirmDialog destructive`) before `run`. Pass `confirm: false` if the host already confirms; pass `{ title, description, confirmLabel, cancelLabel }` to customise.
- **Overflow** opens as a dropdown from `md` (768px, `MOBILE_BREAKPOINT`) up and as a bottom sheet below (`overflowAs='auto' | 'menu' | 'sheet'`). Below `md`, secondaries with an `icon` render icon-only (labelled) and buttons use the 44px `comfortable` sizes.
- `run` may return a promise: the button shows a spinner and the other actions lock until it settles. Errors go to `onActionError` or are rethrown. `disabledReason` disables the action and explains why (tooltip on desktop, text in the menu/sheet).
- The bar fills its parent (`w-full`, inline-size containment): give it the room it may use.

`PageHeader` lays out by its own width (`@container`): under 448px it stacks leading → title + badges → actions; wider, title left (max 60%, shrinks) and actions right. `titleKind='identifier'` keeps folios/SKUs on one line (`truncate`, full value in `title`); `text` (default) wraps. Title size is fluid (`clamp(1.25rem, 1rem + 2vw, 1.5rem)`). `overflowActions` still works but `ActionBar` is preferred.

`PageShell` is the page container: single gutter `px-4 sm:px-6 lg:px-8`, `min-w-0`, bottom safe-area, `@container/page`, `width='narrow' | 'default' | 'wide' | 'full'`. `BackLink` is a 44px «‹ Atrás» that renders an `<a href>`, a `<button>` (no `href`) or your router link (`asChild`).

i18n keys (all with Spanish defaults): `action_bar.more`, `action_bar.label`, `action_bar.sheet_description`, `action_bar.confirm_title` (`{{label}}`), `action_bar.confirm_description`, `action_bar.cancel`, `back_link.label`, `page_header.more`.

## ResponsiveDialog, Modal and FormModal (`@asteby/metacore-ui/modal`)

```tsx
import { ResponsiveDialog } from '@asteby/metacore-ui/modal'

<ResponsiveDialog open={open} onOpenChange={setOpen} title='Despacho SO-00004' icon={<Warehouse />}
  header={<ProcessStepper … />}            // fixed, does not scroll
  footer={{
    primary: { label: 'Confirmar picking', run: confirmPicking },          // one CTA per step
    secondary: [{ label: 'Imprimir surtido', icon: <Printer />, run: print }],
    destructive: [{ label: 'Liberar apartado', run: release, confirm: { title: '¿Liberar el apartado?' } }],
    extra: footerExtra,                     // host actions, e.g. ModalProps.footerExtra
  }}
  size='md'                                 // sm | md | lg | xl | full (desktop)
  mobile='sheet'>                           // sheet (default) | fullscreen | dialog
  {body}
</ResponsiveDialog>
```

- **From 768px (`MOBILE_BREAKPOINT`)**: centered dialog, `max-h-[90dvh]`, footer `[destructive] ··· [start] [extra] [secondary] [PRIMARY]`.
- **Below**: bottom sheet with a drag handle (swipe down closes when `dismissable`), `max-h-[92dvh]`, scrolling body, and a sticky footer with `env(safe-area-inset-bottom)` that rises above the on-screen keyboard (`visualViewport`). Stacked: PRIMARY full width, then the first secondary + «⋯» (other secondaries, `extra`, and destructive last in red).
- No «Cerrar» button in the footer: the 44px X, Esc, swipe and back close it. `dismissable={false}` blocks all of them.
- Destructive actions confirm with `ConfirmDialog destructive` (`confirm: false` to skip, or an object to customise). `run` may return a promise: spinner on that action, the others lock.
- Titles wrap, they are never truncated. Focus goes to the dialog on open, is trapped while open, and returns to the trigger on close.
- `footerContent` renders custom footer nodes in the same sticky footer (legacy).

`Modal` and `FormModal` are now built on `ResponsiveDialog` with the same props. `Modal` adds `footerActions` (slots) and `mobile`. `FormModal` puts the submit button as the primary (full width on phones) and accepts `footerExtra`.

i18n keys (Spanish defaults): `responsive_dialog.close`, `responsive_dialog.more`, `responsive_dialog.confirm_title` (`{{label}}`), `responsive_dialog.confirm_generic`, `responsive_dialog.confirm_description`, `responsive_dialog.cancel`.

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
      meta="Zona Norte · Seguridad"
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

## Touch (`@asteby/metacore-ui/touch`)

Primitivos sin marca para kioskos y pantallas de cliente. El tamaño sale de `--touch-min-target` (60 px por defecto) y `--touch-font-scale`, que pinta `@asteby/metacore-theme/touch`; cada componente acepta `minTarget` para sobrescribirlo.

```tsx
import { VirtualKeyboard, TouchButton, TouchGrid, useIdleReset, useWakeLock } from '@asteby/metacore-ui/touch'

const [email, setEmail] = useState('')
<VirtualKeyboard layout='email' value={email} onValueChange={setEmail} onEnter={next} />

const { warning, secondsLeft, reset } = useIdleReset(60, 10, () => navigate('/attract'))
useWakeLock()
```

- `VirtualKeyboard`: `layout` `text | numeric | email`, `decimal` (numérico), shift `off → una vez → bloqueo`, `labels` para i18n, `onKey` para el flujo crudo de teclas.
- `useIdleReset`: cualquier pointer/tecla/touch/rueda reinicia; `warning` se activa los últimos `warnSeconds`.
- `useWakeLock`: re-adquiere al volver la pestaña a visible; sin soporte es no-op.
