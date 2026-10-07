// RecordPicker — THE "pick a related record" control of the runtime.
//
// Before it, every surface carried its own picker: the declarative
// DynamicSelectField, the hand-written EntitySelect, the business
// Customer/Product/Vehicle pickers, the DocumentEditor's product cell, the
// legacy `search` field of the generic modal and the multi-select of `ref`
// arrays — each with its own search loop, list markup, keyboard handling and
// create button. They are now thin configurations of this one primitive:
//
//   - data: caller-owned `items` (options resolver, static list, a search the
//     caller drives) or a `search(q, signal)` fetcher run here with debounce,
//     cancellation and a min-chars gate; loading / empty / error states;
//   - selection: single or `multiple` (chips with remove);
//   - create / edit: "+" joined to the trigger when empty, pencil when a value
//     is selected, "Crear …" at the foot of the list prefilled with the search
//     (record-picker-actions.tsx);
//   - rich options by props/slots: lead (avatar / initials / thumbnail),
//     subtitle (SKU, RFC…), trailing (price / stock), or a full `renderItem`;
//   - presentation: `trigger="button"` (select-like, search inside the list)
//     or `trigger="input"` (type in the field itself; `freeText` keeps the text
//     as the value, e.g. a free invoice line), `variant="field" | "cell"`;
//   - the list is ALWAYS portaled (never clipped by a table / modal overflow),
//     collision-aware (flips when there is no room) and stacked above dialogs;
//   - keyboard: ↑/↓/Home/End move, Enter picks, Esc closes (without closing the
//     dialog around it), Tab closes and moves on; ARIA combobox + listbox with
//     aria-activedescendant (focus never leaves the text box).
//
// Built only on @asteby/metacore-ui primitives (Popover, Button, Input, Badge),
// so it themes (light / dark) with the host.
import {
    useCallback,
    useEffect,
    useId,
    useRef,
    useState,
    type KeyboardEvent,
    type ReactNode,
    type Ref,
} from 'react'
import { Check, ChevronsUpDown, Loader2, Plus, Search, X, type LucideIcon } from 'lucide-react'
import {
    Badge,
    Button,
    Input,
    Popover,
    PopoverAnchor,
    PopoverContent,
    PopoverTrigger,
} from '@asteby/metacore-ui/primitives'
import { JOINED_TRIGGER_CLASS, RecordPickerAction, hasRecordPickerAction } from './record-picker-actions'
import { useDebouncedValue } from './use-debounced-value'

/**
 * z-index of the portaled list. Dialogs/sheets sit at 50; the list must stay
 * above the modal it was opened from regardless of portal order.
 */
export const RECORD_PICKER_Z_INDEX = 60

const cx = (...parts: Array<string | false | null | undefined>) => parts.filter(Boolean).join(' ')

// ---------------------------------------------------------------------------
// useRecordSearch — debounced, cancellable async search with a min-chars gate.
// ---------------------------------------------------------------------------

export interface UseRecordSearchOptions {
    /** Characters required before searching (default 2). 0 = search on empty too. */
    minChars?: number
    /** Debounce in ms (default 250). */
    delay?: number
    /** When false nothing is fetched and results reset (e.g. list closed). Default true. */
    enabled?: boolean
}

export interface UseRecordSearchResult<T> {
    results: T[]
    /** A request is in flight. */
    loading: boolean
    /** The last request failed. */
    error: boolean
    /** The debounce has not caught up with the typed text yet. */
    pending: boolean
}

/** Debounced async search with cancellation. `search` must be stable (useCallback). */
export function useRecordSearch<T>(
    query: string,
    search: (q: string, signal: AbortSignal) => Promise<T[]>,
    opts: UseRecordSearchOptions = {},
): UseRecordSearchResult<T> {
    const { minChars = 2, delay = 250, enabled = true } = opts
    const trimmed = query.trim()
    const q = useDebouncedValue(trimmed, delay)
    const [results, setResults] = useState<T[]>([])
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState(false)
    // The query the current results answer. Until it matches what was typed
    // (debounce running, or the request not answered yet) the search is
    // `pending` — so a list never flashes "no results" before searching.
    const [doneFor, setDoneFor] = useState<string | null>(null)

    useEffect(() => {
        if (!enabled || q.length < minChars) {
            setResults((r) => (r.length ? [] : r))
            setLoading(false)
            setError(false)
            setDoneFor(null)
            return
        }
        const ctrl = new AbortController()
        setLoading(true)
        setError(false)
        search(q, ctrl.signal)
            .then((rows) => {
                if (!ctrl.signal.aborted) setResults(rows)
            })
            .catch(() => {
                if (!ctrl.signal.aborted) {
                    setResults([])
                    setError(true)
                }
            })
            .finally(() => {
                if (!ctrl.signal.aborted) {
                    setLoading(false)
                    setDoneFor(q)
                }
            })
        return () => ctrl.abort()
    }, [q, search, minChars, enabled])

    return { results, loading, error, pending: enabled && trimmed.length >= minChars && doneFor !== trimmed }
}

const NO_SEARCH = () => Promise.resolve([] as never[])

/**
 * Stable identity for a caller's search function: always calls the latest one,
 * so an inline (non-memoized) fetcher doesn't re-trigger the search on every
 * render.
 */
export function useLatestSearch<A extends unknown[], R>(fn: (...args: A) => R): (...args: A) => R {
    const ref = useRef(fn)
    ref.current = fn
    return useCallback((...args: A) => ref.current(...args), [])
}

// ---------------------------------------------------------------------------
// RecordPicker
// ---------------------------------------------------------------------------

export interface RecordPickerItemState {
    /** Keyboard / pointer highlight. */
    active: boolean
    /** Part of the current value. */
    selected: boolean
    disabled: boolean
}

export type RecordPickerVariant = 'field' | 'cell'
export type RecordPickerTrigger = 'button' | 'input'

export interface RecordPickerProps<T> {
    /** Stable id of an item (the stored value). */
    getKey: (item: T) => string
    /** Display text of an item. */
    getLabel: (item: T) => string

    // --- data -------------------------------------------------------------
    /** Caller-owned list (resolver, static options, a search the caller drives). Wins over `search`. */
    items?: readonly T[]
    /** Async source run here (debounced, cancelled, gated by `minChars`). Must be stable. */
    search?: (q: string, signal: AbortSignal) => Promise<T[]>
    /** Characters required before searching / opening the input list. Default 0 (button) / 2 (input). */
    minChars?: number
    /** Debounce for `search` (ms). Default 250. */
    debounceMs?: number
    /** Loading flag for caller-owned `items`. */
    loading?: boolean
    /** Error flag for caller-owned `items`. */
    error?: boolean

    // --- query / open (controlled or not) ----------------------------------
    query?: string
    onQueryChange?: (query: string) => void
    /** Button: popover open. Input: the user is actively searching. */
    open?: boolean
    onOpenChange?: (open: boolean) => void

    // --- selection --------------------------------------------------------
    multiple?: boolean
    /** Current value: an id (single) or ids (multiple). */
    value?: string | number | null | readonly (string | number)[]
    /** Resolved item(s) of the current value, for the trigger. */
    selected?: T | readonly T[] | null
    /** An item was picked (in `multiple`, toggle it). */
    onSelect: (item: T) => void
    /** Shows a clear (×) when there is a value. */
    onClear?: () => void
    /** Chip remove in `multiple`. */
    onRemove?: (item: T) => void
    /** Close after a pick. Default: true for single, false for multiple. */
    closeOnSelect?: boolean

    // --- rendering --------------------------------------------------------
    /** Full option body override. */
    renderItem?: (item: T, state: RecordPickerItemState) => ReactNode
    /** Leading visual (avatar / initials / thumbnail / icon). */
    renderLead?: (item: T, where: 'option' | 'value') => ReactNode
    /** Subtitle under the label (SKU, RFC, phone…). */
    getDescription?: (item: T) => ReactNode
    /** Right-aligned content (price, stock badge…). */
    renderTrailing?: (item: T, where: 'option' | 'value') => ReactNode
    /** Trigger content override (button) / selected display (input). */
    renderValue?: (selected: T | null) => ReactNode
    isItemDisabled?: (item: T) => boolean
    /** Check mark column. Default: true in button mode. */
    showCheck?: boolean

    // --- copy -------------------------------------------------------------
    placeholder?: string
    searchPlaceholder?: string
    emptyText?: ReactNode
    loadingText?: ReactNode
    errorText?: ReactNode
    /** Shown below `minChars` in button mode. */
    minCharsText?: ReactNode
    clearLabel?: string
    /** Accessible name of the listbox. */
    listLabel?: string

    // --- create / edit ----------------------------------------------------
    /** Human name of the referenced model, for "Crear …" / "Editar …". */
    entityLabel?: string
    /** "+" (empty) and list footer. Receives the searched text to prefill. */
    onCreate?: (query: string) => void
    /** Pencil (with a value). */
    onEdit?: () => void
    createLabel?: string
    editLabel?: string
    /** When the "Crear …" footer shows: always (default), only with no hits, or never. */
    createFooter?: 'always' | 'empty' | 'never'
    createFooterLabel?: (query: string) => ReactNode
    /** Hide the joined +/pencil segment (keeps the footer). */
    hideJoinedAction?: boolean

    // --- presentation -----------------------------------------------------
    trigger?: RecordPickerTrigger
    variant?: RecordPickerVariant
    /** Input mode: the typed text IS the value (never shows a selected display). */
    freeText?: boolean
    icon?: LucideIcon
    id?: string
    ariaLabel?: string
    disabled?: boolean
    /** Locked display of the current value (no list, no actions). */
    readOnly?: boolean
    invalid?: boolean
    /** data-slot of the root (keeps legacy hooks like `dynamic-select`). */
    slot?: string
    /** data-slot of the input-mode anchor. */
    anchorSlot?: string
    /** data-slot of the portaled list container. */
    contentSlot?: string
    className?: string
    triggerClassName?: string
    /** Extra attributes for the trigger / text box (data-*, …). */
    triggerProps?: Record<string, unknown>
    inputRef?: Ref<HTMLInputElement>
    /** Floor for the list width (CSS length). Default 14rem. */
    minListWidth?: string
    /** Rendered after the joined group (e.g. a scan button). */
    after?: ReactNode
    /** Rendered under the control (badges, hints). */
    below?: ReactNode
    /** Rendered at the top of the list. */
    beforeList?: ReactNode
    /** Runs first on every key in the text box; `preventDefault()` to take over. */
    onInputKeyDown?: (e: KeyboardEvent<HTMLInputElement>) => void
    /** Keys the picker did not consume (closed list, Enter with no hits…). */
    onUnhandledKeyDown?: (e: KeyboardEvent<HTMLInputElement>) => void
}

const TABBABLE =
    'a[href],button:not([disabled]),input:not([disabled]):not([type="hidden"]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])'

/** Focus the tabbable after `from` (skipping portaled popper content). */
function focusNextAfter(from: HTMLElement | null) {
    if (!from || typeof document === 'undefined') return
    const all = Array.from(document.querySelectorAll<HTMLElement>(TABBABLE)).filter(
        (el) => el.tabIndex >= 0 && !el.closest('[data-radix-popper-content-wrapper]'),
    )
    const i = all.indexOf(from)
    ;(all[i + 1] ?? from).focus()
}

function asKeys(value: RecordPickerProps<unknown>['value'], multiple: boolean): string[] {
    if (multiple) return Array.isArray(value) ? value.map(String) : []
    if (value == null || value === '' || Array.isArray(value)) return []
    return [String(value)]
}

export function RecordPicker<T>(props: RecordPickerProps<T>) {
    const {
        getKey,
        getLabel,
        items,
        search,
        debounceMs = 250,
        multiple = false,
        value,
        selected,
        onSelect,
        onClear,
        onRemove,
        renderItem,
        renderLead,
        getDescription,
        renderTrailing,
        renderValue,
        isItemDisabled,
        placeholder = 'Seleccionar…',
        searchPlaceholder = 'Buscar…',
        emptyText = 'Sin resultados',
        loadingText = 'Buscando…',
        errorText = 'No se pudo buscar. Inténtalo de nuevo.',
        minCharsText,
        clearLabel = 'Quitar selección',
        listLabel,
        entityLabel = '',
        onCreate,
        onEdit,
        createLabel,
        editLabel,
        createFooter = 'always',
        createFooterLabel,
        hideJoinedAction = false,
        trigger = 'button',
        variant = 'field',
        freeText = false,
        icon: Icon,
        id,
        ariaLabel,
        disabled = false,
        readOnly = false,
        invalid = false,
        slot,
        anchorSlot,
        contentSlot = 'record-picker-content',
        className,
        triggerClassName,
        triggerProps,
        inputRef,
        minListWidth = '14rem',
        after,
        below,
        beforeList,
        onInputKeyDown,
        onUnhandledKeyDown,
    } = props
    const isInput = trigger === 'input'
    const minChars = props.minChars ?? (isInput ? 2 : 0)
    const showCheck = props.showCheck ?? !isInput
    const closeOnSelect = props.closeOnSelect ?? !multiple
    const listId = useId()
    const triggerRef = useRef<HTMLElement | null>(null)
    const anchorRef = useRef<HTMLDivElement>(null)
    const tabbingRef = useRef(false)

    // open / query: controlled when the caller passes them.
    const [openState, setOpenState] = useState(false)
    const open = props.open ?? openState
    const { onOpenChange, onQueryChange } = props
    const controlledOpen = props.open !== undefined
    const setOpen = useCallback(
        (o: boolean) => {
            if (!controlledOpen) setOpenState(o)
            onOpenChange?.(o)
        },
        [controlledOpen, onOpenChange],
    )
    const [queryState, setQueryState] = useState('')
    const query = props.query ?? queryState
    const controlledQuery = props.query !== undefined
    const setQuery = useCallback(
        (q: string) => {
            if (!controlledQuery) setQueryState(q)
            onQueryChange?.(q)
        },
        [controlledQuery, onQueryChange],
    )

    const trimmed = query.trim()
    const belowMin = trimmed.length < minChars
    const listOpen = !disabled && !readOnly && open && (!isInput || !belowMin)

    const internal = useRecordSearch<T>(query, (search ?? NO_SEARCH) as (q: string, s: AbortSignal) => Promise<T[]>, {
        minChars,
        delay: debounceMs,
        enabled: !!search && !items && open && !disabled && !readOnly,
    })
    const rows: readonly T[] = items ?? internal.results
    const loading = props.loading ?? (internal.loading || internal.pending)
    const error = props.error ?? internal.error

    const keys = asKeys(value as RecordPickerProps<unknown>['value'], multiple)
    const hasValue = keys.length > 0
    const isSelected = (item: T) => keys.includes(getKey(item))
    const single = !multiple ? ((selected as T | null | undefined) ?? null) : null
    const selectedList: readonly T[] = multiple && Array.isArray(selected) ? (selected as readonly T[]) : []

    const showFooter =
        !!onCreate &&
        !loading &&
        createFooter !== 'never' &&
        (createFooter === 'always' || (rows.length === 0 && !belowMin && !error))
    const count = rows.length + (showFooter ? 1 : 0)

    // Highlight: the selected row when (re)opening, else the first. Keyed on the
    // row ids (not the array identity) so a caller recomputing `items` on every
    // render doesn't reset the keyboard position.
    const [active, setActive] = useState(0)
    const rowSig = rows.map(getKey).join('\u0001')
    useEffect(() => {
        const i = rows.findIndex((r) => keys.includes(getKey(r)))
        setActive(i >= 0 ? i : 0)
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [rowSig, trimmed, listOpen])

    useEffect(() => {
        if (!listOpen || typeof document === 'undefined') return
        const el = document.getElementById(`${listId}-o${active}`)
        el?.scrollIntoView?.({ block: 'nearest' })
    }, [active, listOpen, listId])

    const enabledAt = (i: number) => i === rows.length ? showFooter : !!rows[i] && !isItemDisabled?.(rows[i]!)
    const step = (from: number, dir: 1 | -1) => {
        for (let i = from + dir; i >= 0 && i < count; i += dir) if (enabledAt(i)) return i
        return from
    }

    const close = () => setOpen(false)

    const runCreate = () => {
        const q = trimmed
        close()
        if (!freeText) setQuery('')
        onCreate?.(q)
    }

    const choose = (i: number) => {
        if (i === rows.length && showFooter) return runCreate()
        const item = rows[i]
        if (!item || isItemDisabled?.(item)) return
        onSelect(item)
        if (closeOnSelect) close()
        if (!freeText && !multiple) setQuery('')
    }

    const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
        if (onInputKeyDown) {
            // Only a preventDefault() from the caller takes over (Radix may
            // already have prevented Esc at the document level).
            const before = e.defaultPrevented
            onInputKeyDown(e)
            if (!before && e.defaultPrevented) return
        }
        if (listOpen && count > 0) {
            if (e.key === 'ArrowDown') {
                e.preventDefault()
                setActive((a) => step(Math.min(a, count - 1), 1))
                return
            }
            if (e.key === 'ArrowUp') {
                e.preventDefault()
                setActive((a) => step(Math.min(a, count), -1))
                return
            }
            if (!isInput && (e.key === 'Home' || e.key === 'End')) {
                e.preventDefault()
                setActive(e.key === 'Home' ? step(-1, 1) : step(count, -1))
                return
            }
            if (e.key === 'Enter' && enabledAt(active)) {
                e.preventDefault()
                choose(active)
                return
            }
        }
        if (isInput) {
            if (listOpen && e.key === 'Escape') {
                // Close the list, not the dialog around it.
                e.preventDefault()
                e.stopPropagation()
                close()
                return
            }
            if (!listOpen && !freeText && e.key === 'ArrowDown' && !belowMin) {
                e.preventDefault()
                setOpen(true)
                return
            }
            if (e.key === 'Tab') close()
        } else if (e.key === 'Tab' && !e.shiftKey) {
            // Close and move on to the next field (not to the end of <body>,
            // where the portaled list lives).
            e.preventDefault()
            tabbingRef.current = true
            close()
            return
        }
        onUnhandledKeyDown?.(e)
    }

    const activeId = listOpen && count > 0 && enabledAt(active) ? `${listId}-o${active}` : undefined

    // ---- the list (shared by both trigger modes) --------------------------
    const status = (() => {
        if (loading && rows.length === 0) {
            return (
                <div role="status" className="flex items-center justify-center gap-2 py-6 text-sm text-muted-foreground" data-slot="picker-loading">
                    <Loader2 className="size-4 animate-spin" aria-hidden />
                    {loadingText}
                </div>
            )
        }
        if (loading) return null
        if (error) {
            return (
                <p role="alert" className="px-2 py-4 text-center text-sm text-destructive" data-slot="picker-error">
                    {errorText}
                </p>
            )
        }
        if (rows.length > 0) return null
        if (belowMin && minChars > 0) {
            return (
                <div className="flex flex-col items-center gap-1 py-6 text-muted-foreground" data-slot="picker-min-chars">
                    <Search className="size-5" aria-hidden />
                    <span className="text-xs">{minCharsText ?? `Escribe al menos ${minChars} caracteres`}</span>
                </div>
            )
        }
        return (
            <div className="px-2 py-6 text-center text-sm text-muted-foreground" data-slot="picker-empty">
                {emptyText}
            </div>
        )
    })()

    const optionClass = (on: boolean, dis: boolean) =>
        cx(
            'relative flex cursor-default select-none items-center gap-2 rounded-sm px-2 py-1.5 text-sm outline-hidden',
            on && 'bg-accent text-accent-foreground',
            dis && 'pointer-events-none opacity-50',
        )

    const list = (
        <div className="max-h-72 overflow-y-auto overflow-x-hidden overscroll-contain" data-slot="record-picker-list">
            {beforeList}
            {status}
            <ul
                id={listId}
                role="listbox"
                aria-label={listLabel ?? ariaLabel ?? entityLabel ?? undefined}
                aria-multiselectable={multiple || undefined}
                className={cx('p-1', count === 0 && 'hidden')}
            >
                {rows.map((item, i) => {
                    const sel = isSelected(item)
                    const dis = !!isItemDisabled?.(item)
                    const on = i === active
                    const desc = getDescription?.(item)
                    return (
                        <li
                            key={getKey(item)}
                            id={`${listId}-o${i}`}
                            role="option"
                            aria-selected={multiple ? sel : on}
                            aria-disabled={dis || undefined}
                            data-active={on || undefined}
                            data-selected={sel || undefined}
                            data-slot="record-picker-option"
                            className={optionClass(on, dis)}
                            onMouseDown={(e) => e.preventDefault()}
                            onMouseMove={() => {
                                if (!on && !dis) setActive(i)
                            }}
                            onClick={() => choose(i)}
                        >
                            {renderItem ? (
                                renderItem(item, { active: on, selected: sel, disabled: dis })
                            ) : (
                                <>
                                    {showCheck ? (
                                        <Check className={cx('size-4 shrink-0', sel ? 'opacity-100' : 'opacity-0')} aria-hidden />
                                    ) : null}
                                    {renderLead?.(item, 'option')}
                                    <span className="flex min-w-0 flex-1 flex-col">
                                        <span className="truncate">{getLabel(item)}</span>
                                        {desc != null && desc !== '' ? (
                                            <span className="truncate text-xs text-muted-foreground">{desc}</span>
                                        ) : null}
                                    </span>
                                    {renderTrailing ? (
                                        <span className="ml-auto flex shrink-0 items-center gap-2">{renderTrailing(item, 'option')}</span>
                                    ) : null}
                                </>
                            )}
                        </li>
                    )
                })}
                {showFooter ? (
                    <>
                        {rows.length > 0 ? <li role="presentation" className="-mx-1 my-1 h-px bg-border" /> : null}
                        <li
                            id={`${listId}-o${rows.length}`}
                            role="option"
                            aria-selected={active === rows.length}
                            data-active={active === rows.length || undefined}
                            data-slot="picker-create"
                            className={cx(optionClass(active === rows.length, false), 'text-primary')}
                            onMouseDown={(e) => e.preventDefault()}
                            onMouseMove={() => setActive(rows.length)}
                            onClick={runCreate}
                        >
                            <Plus className="size-4 shrink-0" aria-hidden />
                            <span className="truncate">
                                {createFooterLabel ? createFooterLabel(trimmed) : `Crear ${entityLabel}`.trim()}
                                {!createFooterLabel && trimmed ? <span className="text-muted-foreground"> «{trimmed}»</span> : null}
                            </span>
                        </li>
                    </>
                ) : null}
            </ul>
        </div>
    )

    const contentStyle = {
        width: `max(var(--radix-popover-trigger-width), ${minListWidth})`,
        maxWidth: 'calc(100vw - 1rem)',
        zIndex: RECORD_PICKER_Z_INDEX,
    }

    const joined = !hideJoinedAction && !readOnly && hasRecordPickerAction(hasValue, onCreate, onEdit)
    const action = joined ? (
        <RecordPickerAction
            hasValue={hasValue}
            label={entityLabel}
            onCreate={onCreate ? () => runCreate() : undefined}
            onEdit={onEdit}
            createLabel={createLabel}
            editLabel={editLabel}
            disabled={disabled}
            variant={variant}
        />
    ) : null

    const defaultValueNode = (item: T | null) =>
        item ? (
            <>
                {renderLead?.(item, 'value')}
                <span className="min-w-0 flex-1 truncate">{getLabel(item)}</span>
                {renderTrailing?.(item, 'value')}
            </>
        ) : (
            <span className="min-w-0 flex-1 truncate text-muted-foreground">{placeholder}</span>
        )
    const valueNode = renderValue ? renderValue(single) : defaultValueNode(single)

    const wrap = (row: ReactNode) =>
        below ? (
            <div className={cx('w-full min-w-0 space-y-1.5', className)} data-slot={slot}>
                {row}
                {below}
            </div>
        ) : (
            row
        )
    const rowClass = cx('flex w-full min-w-0 items-center gap-1.5', !below && className)
    const rowSlot = below ? undefined : slot

    // ---- read-only --------------------------------------------------------
    if (readOnly) {
        return (
            <Button
                type="button"
                variant="outline"
                role="combobox"
                id={id}
                disabled
                aria-readonly="true"
                aria-label={ariaLabel}
                className={cx('w-full min-w-0 cursor-default justify-start font-normal opacity-100', triggerClassName)}
                {...triggerProps}
            >
                <span className="flex min-w-0 flex-1 items-center gap-2 text-left">{valueNode}</span>
            </Button>
        )
    }

    // ---- input trigger ----------------------------------------------------
    if (isInput) {
        const showValue = !freeText && !multiple && hasValue && !!(single || renderValue)
        const inputCls = cx(
            variant === 'cell' ? 'h-8 pl-8' : 'pl-8',
            joined && JOINED_TRIGGER_CLASS,
            triggerClassName,
        )
        return wrap(
            <div className={rowClass} data-slot={rowSlot}>
                <div className="flex min-w-0 flex-1 items-stretch">
                    <Popover open={listOpen} onOpenChange={(o) => !o && close()}>
                        <PopoverAnchor asChild>
                            <div ref={anchorRef} className="relative w-full min-w-0" data-slot={anchorSlot}>
                                {showValue ? (
                                    <div
                                        className={cx(
                                            'flex min-h-9 w-full min-w-0 items-center gap-2 rounded-md border bg-background px-3 py-1.5 text-sm dark:bg-input/30',
                                            joined && 'rounded-r-none',
                                            invalid && 'border-destructive',
                                        )}
                                        data-slot="record-picker-value"
                                    >
                                        {Icon ? <Icon className="size-4 shrink-0 text-muted-foreground" aria-hidden /> : null}
                                        <div className="min-w-0 flex-1">{valueNode}</div>
                                        {onClear && !disabled ? (
                                            <Button
                                                type="button"
                                                size="icon"
                                                variant="ghost"
                                                className="size-7 shrink-0"
                                                onClick={onClear}
                                                aria-label={clearLabel}
                                            >
                                                <X className="size-4" />
                                            </Button>
                                        ) : null}
                                    </div>
                                ) : (
                                    <>
                                        <Search
                                            className={cx(
                                                'pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground',
                                                variant === 'cell' ? 'size-3.5' : 'size-4',
                                            )}
                                            aria-hidden
                                        />
                                        <Input
                                            ref={inputRef}
                                            id={id}
                                            value={query}
                                            disabled={disabled}
                                            role="combobox"
                                            aria-autocomplete="list"
                                            aria-expanded={listOpen}
                                            aria-controls={listOpen ? listId : undefined}
                                            aria-activedescendant={activeId}
                                            aria-label={ariaLabel}
                                            aria-invalid={invalid || undefined}
                                            autoComplete="off"
                                            spellCheck={false}
                                            placeholder={placeholder}
                                            className={inputCls}
                                            onChange={(e) => {
                                                setQuery(e.target.value)
                                                setOpen(true)
                                            }}
                                            onBlur={() => close()}
                                            onKeyDown={onKeyDown}
                                            {...triggerProps}
                                        />
                                    </>
                                )}
                            </div>
                        </PopoverAnchor>
                        <PopoverContent
                            align="start"
                            sideOffset={4}
                            collisionPadding={8}
                            className="p-0"
                            data-slot={contentSlot}
                            // Focus stays in the text box: keep typing while the list shows.
                            onOpenAutoFocus={(e) => e.preventDefault()}
                            // Esc is handled by the text box (closes the list and
                            // stops there, so the dialog around it stays open).
                            onEscapeKeyDown={(e) => e.preventDefault()}
                            onCloseAutoFocus={(e) => e.preventDefault()}
                            // Clicking the list (scrollbar included) must not blur the box.
                            onMouseDown={(e) => e.preventDefault()}
                            onInteractOutside={(e) => {
                                if (anchorRef.current?.contains(e.target as Node)) e.preventDefault()
                            }}
                            style={contentStyle}
                        >
                            {list}
                        </PopoverContent>
                    </Popover>
                    {action}
                </div>
                {after}
            </div>,
        )
    }

    // ---- button trigger ---------------------------------------------------
    const onTriggerKeyDown = (e: KeyboardEvent<HTMLElement>) => {
        if (disabled) return
        if (e.key === 'ArrowDown' || e.key === 'ArrowUp' || (multiple && (e.key === 'Enter' || e.key === ' '))) {
            e.preventDefault()
            setOpen(true)
            return
        }
        // Type-to-search: a printable key on the closed trigger opens the list
        // with that character already in the search box.
        if (!open && e.key.length === 1 && e.key !== ' ' && !e.ctrlKey && !e.metaKey && !e.altKey) {
            e.preventDefault()
            setQuery(e.key)
            setOpen(true)
        }
    }
    const clearable = !!onClear && hasValue && !disabled && !multiple
    const cellCls =
        'h-8 border-transparent bg-transparent px-2 shadow-none hover:border-input hover:bg-transparent dark:bg-transparent dark:hover:bg-transparent'
    const comboboxAria = {
        role: 'combobox' as const,
        'aria-expanded': listOpen,
        'aria-haspopup': 'listbox' as const,
        'aria-controls': listOpen ? listId : undefined,
        'aria-invalid': invalid || undefined,
        'aria-label': ariaLabel,
        id,
    }

    const triggerEl = multiple ? (
        <div
            {...comboboxAria}
            ref={(el) => {
                triggerRef.current = el
            }}
            tabIndex={disabled ? -1 : 0}
            aria-disabled={disabled || undefined}
            onKeyDown={onTriggerKeyDown}
            className={cx(
                'flex min-h-9 w-full min-w-0 cursor-pointer items-center justify-between gap-2 rounded-md border border-input bg-transparent px-3 py-1.5 text-sm shadow-xs outline-none transition-[color,box-shadow] focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 dark:bg-input/30',
                variant === 'cell' && 'min-h-8 border-transparent shadow-none',
                invalid && 'border-destructive ring-1 ring-destructive/30',
                disabled && 'pointer-events-none opacity-50',
                joined && JOINED_TRIGGER_CLASS,
                triggerClassName,
            )}
            data-empty={!hasValue}
            {...triggerProps}
        >
            <span className="flex min-w-0 flex-1 flex-wrap items-center gap-1">
                {selectedList.length > 0 ? (
                    selectedList.map((item) => (
                        <Badge key={getKey(item)} variant="secondary" className="max-w-full gap-1 pr-1 font-normal" data-slot="record-picker-chip">
                            <span className="truncate">{getLabel(item)}</span>
                            {onRemove && !disabled ? (
                                <button
                                    type="button"
                                    aria-label={`Quitar ${getLabel(item)}`}
                                    className="rounded-full p-0.5 text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
                                    onPointerDown={(e) => e.stopPropagation()}
                                    onClick={(e) => {
                                        e.stopPropagation()
                                        onRemove(item)
                                    }}
                                    onKeyDown={(e) => e.stopPropagation()}
                                >
                                    <X className="size-3" />
                                </button>
                            ) : null}
                        </Badge>
                    ))
                ) : (
                    <span className="truncate text-muted-foreground">{placeholder}</span>
                )}
            </span>
            <ChevronsUpDown className="size-4 shrink-0 opacity-50" aria-hidden />
        </div>
    ) : (
        <Button
            {...comboboxAria}
            ref={(el: HTMLButtonElement | null) => {
                triggerRef.current = el
            }}
            type="button"
            variant="outline"
            disabled={disabled}
            onKeyDown={onTriggerKeyDown}
            className={cx(
                'w-full min-w-0 flex-1 justify-between gap-2 font-normal',
                variant === 'cell' && cellCls,
                clearable && 'pr-14',
                joined && JOINED_TRIGGER_CLASS,
                invalid && 'border-destructive ring-1 ring-destructive/30',
                triggerClassName,
            )}
            data-empty={!hasValue}
            {...triggerProps}
        >
            {Icon ? <Icon className="size-4 shrink-0 text-muted-foreground" aria-hidden /> : null}
            <span className="flex min-w-0 flex-1 items-center gap-2 text-left">{valueNode}</span>
            <ChevronsUpDown className="size-4 shrink-0 opacity-50" aria-hidden />
        </Button>
    )

    return wrap(
        <div className={rowClass} data-slot={rowSlot}>
            <div className="flex min-w-0 flex-1 items-center">
              <div className="relative flex min-w-0 flex-1 items-center">
                <Popover open={listOpen} onOpenChange={(o) => (disabled ? undefined : setOpen(o))}>
                    <PopoverTrigger asChild>{triggerEl}</PopoverTrigger>
                    <PopoverContent
                        align="start"
                        sideOffset={4}
                        collisionPadding={8}
                        className="p-0"
                        data-slot={contentSlot}
                        style={contentStyle}
                        onCloseAutoFocus={(e) => {
                            if (!tabbingRef.current) return
                            tabbingRef.current = false
                            e.preventDefault()
                            focusNextAfter(triggerRef.current)
                        }}
                    >
                        <div className="flex h-10 items-center gap-2 border-b px-3" data-slot="record-picker-search">
                            <Search className="size-4 shrink-0 opacity-50" aria-hidden />
                            <input
                                role="combobox"
                                aria-expanded={listOpen}
                                aria-controls={listId}
                                aria-autocomplete="list"
                                aria-activedescendant={activeId}
                                aria-label={searchPlaceholder}
                                autoComplete="off"
                                spellCheck={false}
                                placeholder={searchPlaceholder}
                                value={query}
                                onChange={(e) => setQuery(e.target.value)}
                                onKeyDown={onKeyDown}
                                className="flex h-10 w-full rounded-md bg-transparent py-3 text-sm outline-hidden placeholder:text-muted-foreground"
                            />
                        </div>
                        {list}
                    </PopoverContent>
                </Popover>
                {clearable ? (
                    <button
                        type="button"
                        aria-label={clearLabel}
                        title={clearLabel}
                        onClick={(e) => {
                            e.stopPropagation()
                            onClear?.()
                        }}
                        className="absolute right-8 top-1/2 z-10 -translate-y-1/2 rounded-sm p-0.5 text-muted-foreground outline-none hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
                        data-slot="record-picker-clear"
                    >
                        <X className="size-3.5" />
                    </button>
                ) : null}
              </div>
                {action}
            </div>
            {after}
        </div>,
    )
}
