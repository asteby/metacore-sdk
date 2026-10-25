/**
 * ProviderSortableList: an ordered list of options with a status badge, a
 * keyboard-accessible drag handle and an "inherits from the organization"
 * marker. Domain-agnostic (payments, shipping, anything with a ranked set of
 * providers): the host decides what the ids mean and what to do with the new
 * order.
 *
 * Keyboard: focus the handle, Space/Enter grabs, ArrowUp/ArrowDown move,
 * Space/Enter drops, Escape cancels. Pointer: press the handle and drag.
 * Items that are not eligible (status `unavailable` or `eligible: false`) are
 * rendered after the sortable ones, have no handle, and are never part of the
 * emitted order.
 */
import * as React from 'react'
import type { ProviderStatus } from './model'
import { dropIndexFromPointer, moveId } from './reorder'

export interface ProviderSortableItem {
    id: string
    label: React.ReactNode
    status: ProviderStatus
    /** Secondary line (e.g. the account or environment). */
    description?: React.ReactNode
    /** Defaults to `status !== 'unavailable'`. */
    eligible?: boolean
}

export interface ProviderSortableListLabels {
    ready: string
    missing_credentials: string
    sandbox: string
    unavailable: string
    inherited: string
    /** aria-label of the drag handle; receives the item's text label. */
    handle: (label: string) => string
    /** Live-region messages. */
    grabbed: (label: string, position: number, total: number) => string
    moved: (label: string, position: number, total: number) => string
    dropped: (label: string, position: number, total: number) => string
    cancelled: (label: string) => string
}

export const DEFAULT_PROVIDER_LIST_LABELS: ProviderSortableListLabels = {
    ready: 'Listo',
    missing_credentials: 'Sin credenciales',
    sandbox: 'Sandbox',
    unavailable: 'No atiende',
    inherited: 'Hereda de la organización',
    handle: (l) => `Reordenar ${l}`,
    grabbed: (l, p, t) => `${l} tomado, posición ${p} de ${t}. Usa las flechas para mover.`,
    moved: (l, p, t) => `${l}, posición ${p} de ${t}.`,
    dropped: (l, p, t) => `${l} soltado en la posición ${p} de ${t}.`,
    cancelled: (l) => `Reordenamiento de ${l} cancelado.`,
}

export interface ProviderSortableListProps {
    items: ProviderSortableItem[]
    /** Ids of the eligible items in their current order; unlisted eligible items follow in `items` order. */
    order?: string[]
    /** Emits the new order of the eligible items on drop (keyboard or pointer). */
    onReorder: (order: string[]) => void
    /** The order shown is the organization's, not the market's own. */
    inherited?: boolean
    disabled?: boolean
    labels?: Partial<ProviderSortableListLabels>
    className?: string
    'aria-label'?: string
}

const cx = (...c: Array<string | false | undefined>) => c.filter(Boolean).join(' ')

const BADGE_TONE: Record<ProviderStatus, string> = {
    ready: 'bg-emerald-100 text-emerald-800',
    missing_credentials: 'bg-amber-100 text-amber-800',
    sandbox: 'bg-sky-100 text-sky-800',
    unavailable: 'bg-muted text-muted-foreground',
}

function isEligible(i: ProviderSortableItem): boolean {
    return i.eligible ?? i.status !== 'unavailable'
}

/** Eligible ids in display order, honoring `order` first. */
export function sortableOrder(items: readonly ProviderSortableItem[], order?: readonly string[]): string[] {
    const eligible = items.filter(isEligible).map((i) => i.id)
    const set = new Set(eligible)
    const head = (order ?? []).filter((id, n, a) => set.has(id) && a.indexOf(id) === n)
    return [...head, ...eligible.filter((id) => !head.includes(id))]
}

export function ProviderSortableList({
    items,
    order,
    onReorder,
    inherited,
    disabled,
    labels: labelsProp,
    className,
    'aria-label': ariaLabel,
}: ProviderSortableListProps) {
    const labels = { ...DEFAULT_PROVIDER_LIST_LABELS, ...labelsProp }
    const byId = React.useMemo(() => new Map(items.map((i) => [i.id, i])), [items])
    const base = React.useMemo(() => sortableOrder(items, order), [items, order])
    // While grabbed (keyboard) or dragging (pointer) the list shows a draft.
    const [draft, setDraft] = React.useState<string[] | null>(null)
    const [active, setActive] = React.useState<string | null>(null)
    const [announce, setAnnounce] = React.useState('')
    const rows = React.useRef(new Map<string, HTMLElement>())
    const shown = draft ?? base
    const blocked = items.filter((i) => !isEligible(i))
    const textOf = (id: string) => {
        const l = byId.get(id)?.label
        return typeof l === 'string' || typeof l === 'number' ? String(l) : id
    }

    const commit = (next: string[], id: string) => {
        const changed = next.some((x, n) => x !== base[n])
        setDraft(null)
        setActive(null)
        setAnnounce(labels.dropped(textOf(id), next.indexOf(id) + 1, next.length))
        if (changed) onReorder(next)
    }
    const cancel = (id: string) => {
        setDraft(null)
        setActive(null)
        setAnnounce(labels.cancelled(textOf(id)))
    }
    const step = (id: string, delta: number) => {
        const next = moveId(shown, id, delta)
        setDraft(next)
        setAnnounce(labels.moved(textOf(id), next.indexOf(id) + 1, next.length))
    }

    const onKeyDown = (id: string) => (e: React.KeyboardEvent) => {
        if (disabled) return
        const grabbed = active === id
        if (e.key === ' ' || e.key === 'Enter') {
            e.preventDefault()
            if (grabbed) commit(shown, id)
            else {
                setActive(id)
                setDraft(base)
                setAnnounce(labels.grabbed(textOf(id), base.indexOf(id) + 1, base.length))
            }
        } else if (grabbed && (e.key === 'ArrowUp' || e.key === 'ArrowLeft')) {
            e.preventDefault()
            step(id, -1)
        } else if (grabbed && (e.key === 'ArrowDown' || e.key === 'ArrowRight')) {
            e.preventDefault()
            step(id, 1)
        } else if (grabbed && e.key === 'Escape') {
            e.preventDefault()
            cancel(id)
        }
    }

    // Pointer: the target index follows the pointer over the rows' midpoints.
    const onPointerDown = (id: string) => (e: React.PointerEvent) => {
        if (disabled || (e.button !== undefined && e.button !== 0)) return
        setActive(id)
        setDraft(base)
        try {
            ;(e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId)
        } catch {
            /* synthetic events have no active pointer */
        }
    }
    const onPointerMove = (id: string) => (e: React.PointerEvent) => {
        if (active !== id || !draft) return
        const others = draft.filter((x) => x !== id)
        const mids = others.map((x) => {
            const r = rows.current.get(x)?.getBoundingClientRect()
            return r ? r.top + r.height / 2 : 0
        })
        const to = dropIndexFromPointer(e.clientY, mids)
        const next = [...others.slice(0, to), id, ...others.slice(to)]
        if (next.some((x, n) => x !== draft[n])) setDraft(next)
    }
    const onPointerUp = (id: string) => () => {
        if (active === id && draft) commit(draft, id)
    }
    const onPointerCancel = (id: string) => () => {
        if (active === id) cancel(id)
    }

    return (
        <div className={className}>
            {inherited && (
                <p data-testid="provider-list-inherited" className="mb-2 text-xs text-muted-foreground">
                    {labels.inherited}
                </p>
            )}
            <ol aria-label={ariaLabel} className="space-y-1">
                {shown.map((id, n) => {
                    const item = byId.get(id)!
                    const grabbed = active === id
                    return (
                        <li
                            key={id}
                            ref={(el) => {
                                if (el) rows.current.set(id, el)
                                else rows.current.delete(id)
                            }}
                            data-id={id}
                            data-grabbed={grabbed || undefined}
                            className={cx(
                                'flex items-center gap-3 rounded-md border px-3 py-2',
                                grabbed && 'bg-accent shadow-sm',
                            )}
                        >
                            <button
                                type="button"
                                disabled={disabled}
                                aria-label={labels.handle(textOf(id))}
                                aria-pressed={grabbed}
                                data-handle={id}
                                className="cursor-grab touch-none select-none px-1 text-muted-foreground"
                                onKeyDown={onKeyDown(id)}
                                onPointerDown={onPointerDown(id)}
                                onPointerMove={onPointerMove(id)}
                                onPointerUp={onPointerUp(id)}
                                onPointerCancel={onPointerCancel(id)}
                                onBlur={() => active === id && cancel(id)}
                            >
                                <span aria-hidden="true">⋮⋮</span>
                            </button>
                            <span className="w-5 text-xs tabular-nums text-muted-foreground">{n + 1}</span>
                            <span className="min-w-0 flex-1">
                                <span className="block truncate text-sm font-medium">{item.label}</span>
                                {item.description && (
                                    <span className="block truncate text-xs text-muted-foreground">{item.description}</span>
                                )}
                            </span>
                            <StatusBadge status={item.status} labels={labels} />
                        </li>
                    )
                })}
                {blocked.map((item) => (
                    <li
                        key={item.id}
                        data-id={item.id}
                        data-ineligible
                        aria-disabled="true"
                        className="flex items-center gap-3 rounded-md border border-dashed px-3 py-2 opacity-70"
                    >
                        <span className="min-w-0 flex-1">
                            <span className="block truncate text-sm font-medium">{item.label}</span>
                            {item.description && (
                                <span className="block truncate text-xs text-muted-foreground">{item.description}</span>
                            )}
                        </span>
                        <StatusBadge status={item.status} labels={labels} />
                    </li>
                ))}
            </ol>
            <div role="status" aria-live="assertive" className="sr-only">
                {announce}
            </div>
        </div>
    )
}

function StatusBadge({ status, labels }: { status: ProviderStatus; labels: ProviderSortableListLabels }) {
    return (
        <span
            data-status={status}
            className={cx('shrink-0 rounded-full px-2 py-0.5 text-xs font-medium', BADGE_TONE[status])}
        >
            {labels[status]}
        </span>
    )
}
