/**
 * PermissionsDiff — renders a row-per-permission table of changes
 * between two manifest versions. Used by `InstallConfirmModal` during
 * upgrades and by the addon detail page to preview what a version will
 * change.
 *
 * Visual convention:
 *   added     → green pill + "+" prefix
 *   modified  → amber pill + reason diff
 *   removed   → red pill (struck through)
 *   unchanged → muted, optional via `hideUnchanged`
 */
import type { Manifest, PermissionDiffRow } from '../client/types'
import { diffPermissions } from '../client/manifest'
import { cn } from './utils'

export interface PermissionsDiffProps {
  current: Manifest | null
  next: Manifest
  /** Hide unchanged rows — usually true for the install/upgrade modal. */
  hideUnchanged?: boolean
  className?: string
}

const CHANGE_STYLES: Record<PermissionDiffRow['change'], string> = {
  added: 'border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
  modified: 'border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300',
  removed:
    'border-rose-500/40 bg-rose-500/10 text-rose-700 line-through dark:text-rose-300',
  unchanged: 'border-border bg-muted/40 text-muted-foreground',
}

const CHANGE_PREFIX: Record<PermissionDiffRow['change'], string> = {
  added: '+',
  modified: '~',
  removed: '−',
  unchanged: ' ',
}

export function PermissionsDiff({
  current,
  next,
  hideUnchanged = true,
  className,
}: PermissionsDiffProps) {
  const rows = diffPermissions(current, next).filter(
    (r) => !(hideUnchanged && r.change === 'unchanged'),
  )
  if (rows.length === 0) {
    return (
      <p
        className={cn('text-sm text-muted-foreground', className)}
        data-testid="permissions-diff-empty"
      >
        No permission changes.
      </p>
    )
  }
  return (
    <ul
      data-testid="permissions-diff"
      className={cn('flex flex-col gap-1.5', className)}
    >
      {rows.map((row) => {
        const display = row.next ?? row.current
        if (!display) return null
        return (
          <li
            key={row.id}
            data-change={row.change}
            className={cn(
              'flex items-start gap-2 rounded-md border px-2.5 py-1.5 text-sm',
              CHANGE_STYLES[row.change],
            )}
          >
            <span aria-hidden className="font-mono">
              {CHANGE_PREFIX[row.change]}
            </span>
            <span className="flex-1">
              <span className="font-mono text-xs">{display.kind}</span>
              <span className="ml-1 text-xs opacity-80">{display.target}</span>
              {display.reason ? (
                <span className="ml-2 italic opacity-70">{display.reason}</span>
              ) : null}
            </span>
          </li>
        )
      })}
    </ul>
  )
}
