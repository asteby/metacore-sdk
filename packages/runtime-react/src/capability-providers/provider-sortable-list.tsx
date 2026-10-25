/**
 * ProviderSortableList: an ordered list of options with a status badge, a
 * keyboard-accessible drag handle and an "inherits from the organization"
 * marker. Domain-agnostic: the host decides what the ids mean and what to do
 * with the new order.
 *
 * Keyboard: focus the handle, Space/Enter grabs, ArrowUp/ArrowDown move,
 * Space/Enter drops, Escape cancels. Pointer: press the handle and drag.
 * Items that are not eligible (status `unavailable` / `disabled`, `enabled:
 * false` or `eligible: false`) are rendered after the sortable ones in their
 * own list, have no handle, and are never part of the emitted order.
 *
 * `onReorder` emits ONLY the eligible ids. A host that persists the whole
 * list (including ineligible entries that are not merely "does not serve the
 * market", e.g. disabled ones) must merge: keep its own ineligible entries
 * and replace the order of the eligible ones with what is emitted here.
 */
import * as React from 'react'
import { useTranslation } from 'react-i18next'
import type { ProviderStatus } from './model'
import { dropIndexFromPointer, moveId } from './reorder'

export interface ProviderSortableItem {
    id: string
    /**
     * What to show. If it is not plain text, also pass `textLabel`: the handle
     * and the live region announce `textLabel` (never the raw id when avoidable).
     */
    label: React.ReactNode
    /** Plain-text name for assistive technology (handle, live region). */
    textLabel?: string
    status: ProviderStatus
    /** Secondary line (e.g. the account or environment). */
    description?: React.ReactNode
    /** Defaults to `status` not being `unavailable` / `disabled`, and `enabled !== false`. */
    eligible?: boolean
    /**
     * The row's own `enabled` flag. `false` shows the `disabled` badge and
     * makes the item ineligible. With `onEnabledChange` a switch is rendered.
     */
    enabled?: boolean
    /** Per-item actions (e.g. a "connect" link while `missing_credentials`). */
    actions?: React.ReactNode
}

export interface ProviderSortableListLabels {
    ready: string
    missing_credentials: string
    sandbox: string
    unavailable: string
    unhealthy: string
    disabled: string
    inherited: string
    /** Heading (aria-label) of the list of items that cannot be ordered. */
    unavailableGroup: string
    /** Keyboard instructions, linked to every handle with aria-describedby. */
    instructions: string
    /** aria-label of the drag handle; receives the item's text label. */
    handle: (label: string) => string
    /** aria-label of the enabled switch. */
    enable: (label: string) => string
    /** Live-region messages. */
    grabbed: (label: string, position: number, total: number) => string
    moved: (label: string, position: number, total: number) => string
    dropped: (label: string, position: number, total: number) => string
    cancelled: (label: string) => string
}

/** Spanish defaults, kept as a plain constant for hosts that want to spread/override it. */
export const DEFAULT_PROVIDER_LIST_LABELS: ProviderSortableListLabels = {
    ready: 'Listo',
    missing_credentials: 'Sin credenciales',
    sandbox: 'Sandbox',
    unavailable: 'No atiende',
    unhealthy: 'Con fallas',
    disabled: 'Desactivado',
    inherited: 'Hereda de la organización',
    unavailableGroup: 'Sin orden: no disponibles',
    instructions: 'Espacio o Enter para tomar, flechas para mover, Espacio o Enter para soltar, Escape para cancelar.',
    handle: (l) => `Reordenar ${l}`,
    enable: (l) => `Activar ${l}`,
    grabbed: (l, p, t) => `${l} tomado, posición ${p} de ${t}. Usa las flechas para mover.`,
    moved: (l, p, t) => `${l}, posición ${p} de ${t}.`,
    dropped: (l, p, t) => `${l} soltado en la posición ${p} de ${t}.`,
    cancelled: (l) => `Reordenamiento de ${l} cancelado.`,
}

/** Replaces any `{{name}}` that the translator left (e.g. no i18n instance yet). */
function fill(s: string, vars: Record<string, string | number>): string {
    return s.replace(/\{\{\s*(\w+)\s*\}\}/g, (m, k: string) => (k in vars ? String(vars[k]) : m))
}

/**
 * Default labels through the host's i18n (`capability_providers.*` keys, same
 * convention as the rest of the package), falling back to the Spanish text.
 * `overrides` always wins.
 */
function useProviderListLabels(overrides?: Partial<ProviderSortableListLabels>): ProviderSortableListLabels {
    const { t } = useTranslation()
    const D = DEFAULT_PROVIDER_LIST_LABELS
    const s = (key: keyof ProviderSortableListLabels, def: string) =>
        t(`capability_providers.${key}`, { defaultValue: def }) as string
    const f = (key: string, def: string, vars: Record<string, string | number>) =>
        fill(t(`capability_providers.${key}`, { defaultValue: def, ...vars }) as string, vars)
    return {
        ready: s('ready', D.ready),
        missing_credentials: s('missing_credentials', D.missing_credentials),
        sandbox: s('sandbox', D.sandbox),
        unavailable: s('unavailable', D.unavailable),
        unhealthy: s('unhealthy', D.unhealthy),
        disabled: s('disabled', D.disabled),
        inherited: s('inherited', D.inherited),
        unavailableGroup: s('unavailableGroup', D.unavailableGroup),
        instructions: s('instructions', D.instructions),
        handle: (label) => f('handle', 'Reordenar {{label}}', { label }),
        enable: (label) => f('enable', 'Activar {{label}}', { label }),
        grabbed: (label, position, total) =>
            f('grabbed', '{{label}} tomado, posición {{position}} de {{total}}. Usa las flechas para mover.', { label, position, total }),
        moved: (label, position, total) => f('moved', '{{label}}, posición {{position}} de {{total}}.', { label, position, total }),
        dropped: (label, position, total) =>
            f('dropped', '{{label}} soltado en la posición {{position}} de {{total}}.', { label, position, total }),
        cancelled: (label) => f('cancelled', 'Reordenamiento de {{label}} cancelado.', { label }),
        ...overrides,
    }
}

export interface ProviderSortableListProps {
    items: ProviderSortableItem[]
    /** Ids of the eligible items in their current order; unlisted eligible items follow in `items` order. */
    order?: string[]
    /** Emits the new order of the ELIGIBLE items on drop (keyboard or pointer). Never called when nothing moved. */
    onReorder: (order: string[]) => void
    /** The order shown is the organization's, not the market's own. */
    inherited?: boolean
    /** Renders the "inherits from the organization" switch instead of a plain note. */
    onInheritedChange?: (inherited: boolean) => void
    /** Renders a per-item enabled switch. */
    onEnabledChange?: (id: string, enabled: boolean) => void
    disabled?: boolean
    labels?: Partial<ProviderSortableListLabels>
    className?: string
    'aria-label'?: string
}

const cx = (...c: Array<string | false | undefined>) => c.filter(Boolean).join(' ')

const BADGE_TONE: Record<ProviderStatus, string> = {
    ready: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-300',
    missing_credentials: 'bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300',
    sandbox: 'bg-sky-100 text-sky-800 dark:bg-sky-500/15 dark:text-sky-300',
    unhealthy: 'bg-red-100 text-red-800 dark:bg-red-500/15 dark:text-red-300',
    unavailable: 'bg-muted text-muted-foreground',
    disabled: 'bg-muted text-muted-foreground',
}

function statusOf(i: ProviderSortableItem): ProviderStatus {
    return i.enabled === false ? 'disabled' : i.status
}

function isEligible(i: ProviderSortableItem): boolean {
    if (i.enabled === false) return false
    return i.eligible ?? (i.status !== 'unavailable' && i.status !== 'disabled')
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
    onInheritedChange,
    onEnabledChange,
    disabled,
    labels: labelsProp,
    className,
    'aria-label': ariaLabel,
}: ProviderSortableListProps) {
    const labels = useProviderListLabels(labelsProp)
    const helpId = React.useId()
    const byId = React.useMemo(() => new Map(items.map((i) => [i.id, i])), [items])
    const base = React.useMemo(() => sortableOrder(items, order), [items, order])
    // While grabbed (keyboard) or dragging (pointer) the list shows a draft.
    const [draft, setDraft] = React.useState<string[] | null>(null)
    const [active, setActive] = React.useState<string | null>(null)
    const [announce, setAnnounce] = React.useState('')
    const rows = React.useRef(new Map<string, HTMLElement>())
    const handles = React.useRef(new Map<string, HTMLElement>())
    const mode = React.useRef<'keyboard' | 'pointer'>('keyboard')
    // True between a programmatic reorder and the moment focus is restored:
    // moving the focused <li> in the DOM makes browsers blur the handle.
    const reordering = React.useRef(false)

    // The draft is reconciled against the CURRENT items on every render, so an
    // items/order change (refetch, market switch, addon uninstalled) in the
    // middle of a grab can never leave ids that no longer exist.
    const shown = React.useMemo(() => {
        if (!draft) return base
        const live = new Set(base)
        const kept = draft.filter((id, n, a) => live.has(id) && a.indexOf(id) === n)
        return [...kept, ...base.filter((id) => !kept.includes(id))]
    }, [draft, base])
    const shownRef = React.useRef(shown)
    shownRef.current = shown

    const blocked = items.filter((i) => !isEligible(i))
    const textOf = (id: string) => {
        const item = byId.get(id)
        if (!item) return id
        if (item.textLabel) return item.textLabel
        return typeof item.label === 'string' || typeof item.label === 'number' ? String(item.label) : id
    }

    const clear = () => {
        setDraft(null)
        setActive(null)
    }
    const commit = (next: string[], id: string, announceUnchanged = true) => {
        const changed = next.some((x, n) => x !== base[n])
        clear()
        if (changed || announceUnchanged) setAnnounce(labels.dropped(textOf(id), next.indexOf(id) + 1, next.length))
        if (changed) onReorder(next)
    }
    const cancel = (id: string) => {
        clear()
        setAnnounce(labels.cancelled(textOf(id)))
    }
    const step = (id: string, delta: number) => {
        const next = moveId(shown, id, delta)
        reordering.current = true
        setDraft(next)
        setAnnounce(labels.moved(textOf(id), next.indexOf(id) + 1, next.length))
    }

    // Keep the latest closures reachable from the window listeners below.
    const latest = React.useRef({ commit, cancel })
    latest.current = { commit, cancel }

    // The grabbed item vanished (items changed) or the list got disabled
    // mid-grab: drop the grab without emitting anything.
    React.useEffect(() => {
        if (active && (disabled || !base.includes(active))) clear()
    }, [active, disabled, base])

    // Moving the focused <li> blurs the handle in real browsers (happy-dom does
    // not): put the focus back on the grabbed handle after every reorder.
    React.useLayoutEffect(() => {
        reordering.current = false
        if (active && mode.current === 'keyboard') {
            const h = handles.current.get(active)
            if (h && document.activeElement !== h) h.focus({ preventScroll: true })
        }
    })

    // Pointer drag: listen on window while dragging. Pointer capture on the
    // handle would be lost whenever React moves its <li>, leaving the drag
    // half done; window listeners survive any DOM reordering.
    React.useEffect(() => {
        if (!active || mode.current !== 'pointer') return
        const id = active
        const onMove = (e: PointerEvent) => {
            const cur = shownRef.current
            const others = cur.filter((x) => x !== id)
            const mids = others.map((x) => {
                const r = rows.current.get(x)?.getBoundingClientRect()
                return r ? r.top + r.height / 2 : 0
            })
            const to = dropIndexFromPointer(e.clientY, mids)
            const next = [...others.slice(0, to), id, ...others.slice(to)]
            if (next.some((x, n) => x !== cur[n])) setDraft(next)
        }
        const onUp = () => latest.current.commit(shownRef.current, id, false)
        const onCancel = () => latest.current.cancel(id)
        window.addEventListener('pointermove', onMove)
        window.addEventListener('pointerup', onUp)
        window.addEventListener('pointercancel', onCancel)
        return () => {
            window.removeEventListener('pointermove', onMove)
            window.removeEventListener('pointerup', onUp)
            window.removeEventListener('pointercancel', onCancel)
        }
    }, [active])

    const onKeyDown = (id: string) => (e: React.KeyboardEvent) => {
        if (disabled) return
        const grabbed = active === id
        if (e.key === ' ' || e.key === 'Enter') {
            e.preventDefault()
            if (grabbed) commit(shown, id)
            else {
                mode.current = 'keyboard'
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

    const onPointerDown = (id: string) => (e: React.PointerEvent) => {
        if (disabled || (e.button !== undefined && e.button !== 0)) return
        mode.current = 'pointer'
        setActive(id)
        setDraft(base)
    }

    const switches = (item: ProviderSortableItem) =>
        onEnabledChange ? (
            <input
                type="checkbox"
                role="switch"
                disabled={disabled}
                checked={item.enabled !== false}
                aria-label={labels.enable(textOf(item.id))}
                data-enabled-switch={item.id}
                onChange={(e) => onEnabledChange(item.id, e.target.checked)}
            />
        ) : null

    return (
        <div className={className}>
            {onInheritedChange ? (
                <label
                    data-testid="provider-list-inherited"
                    className="mb-2 flex items-center gap-2 text-xs text-muted-foreground"
                >
                    <input
                        type="checkbox"
                        role="switch"
                        disabled={disabled}
                        checked={!!inherited}
                        onChange={(e) => onInheritedChange(e.target.checked)}
                    />
                    {labels.inherited}
                </label>
            ) : (
                inherited && (
                    <p data-testid="provider-list-inherited" className="mb-2 text-xs text-muted-foreground">
                        {labels.inherited}
                    </p>
                )
            )}
            <span id={helpId} className="sr-only">
                {labels.instructions}
            </span>
            <ol aria-label={ariaLabel} className="space-y-1">
                {shown.map((id, n) => {
                    const item = byId.get(id)
                    if (!item) return null
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
                                ref={(el) => {
                                    if (el) handles.current.set(id, el)
                                    else handles.current.delete(id)
                                }}
                                aria-label={labels.handle(textOf(id))}
                                aria-describedby={helpId}
                                aria-pressed={grabbed}
                                data-handle={id}
                                className="cursor-grab touch-none select-none px-1 text-muted-foreground"
                                onKeyDown={onKeyDown(id)}
                                onPointerDown={onPointerDown(id)}
                                onBlur={() => {
                                    if (active === id && mode.current === 'keyboard' && !reordering.current) cancel(id)
                                }}
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
                            {item.actions}
                            {switches(item)}
                            <StatusBadge status={statusOf(item)} labels={labels} />
                        </li>
                    )
                })}
            </ol>
            {blocked.length > 0 && (
                <ul aria-label={labels.unavailableGroup} className="mt-1 space-y-1">
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
                            {item.actions}
                            {switches(item)}
                            <StatusBadge status={statusOf(item)} labels={labels} />
                        </li>
                    ))}
                </ul>
            )}
            <div role="status" aria-live="polite" aria-atomic="true" className="sr-only">
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
