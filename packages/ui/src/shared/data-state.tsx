import * as React from 'react'
import {
  AlertTriangle,
  Clock,
  FlaskConical,
  Inbox,
  Loader2,
  Lock,
  PieChart,
  RefreshCw,
  WifiOff,
  type LucideIcon,
} from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { cn } from '../lib/utils'
import { Button } from '../primitives/button'

/**
 * The non-success states a query-backed surface (widget, list, panel) must
 * render. `success` is not a kind: render the data.
 *
 * - `loading`   — first load, nothing to show yet.
 * - `empty`     — the query worked and returned nothing.
 * - `error`     — the query failed; offer `onRetry`.
 * - `forbidden` — the viewer lacks the permission (inline, not a full page).
 * - `offline`   — no network; data cannot refresh.
 * - `stale`     — showing data older than expected (pair with `description`).
 * - `partial`   — some sources answered, some did not.
 * - `demo`      — the data is illustrative, never a real measurement.
 */
export type DataStateKind =
  | 'loading'
  | 'empty'
  | 'error'
  | 'forbidden'
  | 'offline'
  | 'stale'
  | 'partial'
  | 'demo'

const ICONS: Record<DataStateKind, LucideIcon> = {
  loading: Loader2,
  empty: Inbox,
  error: AlertTriangle,
  forbidden: Lock,
  offline: WifiOff,
  stale: Clock,
  partial: PieChart,
  demo: FlaskConical,
}

const DEFAULT_TITLES: Record<DataStateKind, string> = {
  loading: 'Cargando…',
  empty: 'Sin datos',
  error: 'No se pudo cargar',
  forbidden: 'No tienes permiso para ver esto',
  offline: 'Sin conexión',
  stale: 'Datos desactualizados',
  partial: 'Resultado parcial',
  demo: 'Datos demostrativos',
}

export interface DataStateProps extends Omit<React.ComponentProps<'div'>, 'title'> {
  kind: DataStateKind
  /** Main line. Defaults to `data_state.<kind>` (Spanish fallback). */
  title?: React.ReactNode
  /** Secondary line: what happened, since when, what is missing. */
  description?: React.ReactNode
  /** Shows a retry button (any kind; typical for `error`/`offline`/`stale`). */
  onRetry?: () => void
  /** Retry button label. Defaults to `data_state.retry` («Reintentar»). */
  retryLabel?: string
  /** Extra call to action (e.g. «Conectar fuente»). */
  action?: React.ReactNode
  /** Override the kind's icon. `null` hides it. */
  icon?: LucideIcon | null
  /** Inline one-row layout for cards, banners and table footers. */
  compact?: boolean
}

/**
 * One component for every non-success state, with consistent copy, icon and
 * semantics: `role="alert"` for errors, `role="status"` (polite live region)
 * for the rest; the loading spinner respects `prefers-reduced-motion`. Uses
 * theme tokens only (`muted-foreground`, `destructive`, `warning`), never fixed
 * colors, and never relies on color alone (icon + text).
 *
 * i18n keys (optional, with Spanish fallbacks): `data_state.loading`,
 * `data_state.empty`, `data_state.error`, `data_state.forbidden`,
 * `data_state.offline`, `data_state.stale`, `data_state.partial`,
 * `data_state.demo`, `data_state.retry`.
 */
export function DataState({
  kind,
  title,
  description,
  onRetry,
  retryLabel,
  action,
  icon,
  compact = false,
  className,
  ...props
}: DataStateProps) {
  const { t } = useTranslation()
  const Icon = icon === null ? null : (icon ?? ICONS[kind])
  const heading = title ?? t(`data_state.${kind}`, { defaultValue: DEFAULT_TITLES[kind] })
  const isError = kind === 'error'
  const tone =
    isError ? 'text-destructive' : kind === 'stale' || kind === 'partial' || kind === 'offline' ? 'text-[var(--warning,currentColor)]' : ''

  return (
    <div
      data-slot='data-state'
      data-kind={kind}
      role={isError ? 'alert' : 'status'}
      aria-live={isError ? 'assertive' : 'polite'}
      aria-busy={kind === 'loading' || undefined}
      className={cn(
        'text-muted-foreground flex text-sm',
        compact
          ? 'flex-row flex-wrap items-center gap-2 py-2'
          : 'flex-col items-center justify-center gap-2 py-8 text-center',
        className
      )}
      {...props}
    >
      {Icon && (
        <Icon
          aria-hidden='true'
          className={cn(
            'shrink-0',
            compact ? 'size-4' : 'size-6',
            kind === 'loading' ? 'animate-spin motion-reduce:animate-none' : 'opacity-70',
            tone
          )}
        />
      )}
      <p className={cn('font-medium', isError ? 'text-destructive' : 'text-foreground/80')}>{heading}</p>
      {description && <p className={cn('text-xs', compact && 'basis-full sm:basis-auto')}>{description}</p>}
      {(onRetry || action) && (
        <div className={cn('flex items-center gap-2', !compact && 'mt-1')}>
          {onRetry && (
            <Button type='button' variant='outline' size='sm' onClick={onRetry}>
              <RefreshCw aria-hidden='true' className='size-3.5' />
              {retryLabel ?? t('data_state.retry', { defaultValue: 'Reintentar' })}
            </Button>
          )}
          {action}
        </div>
      )}
    </div>
  )
}
