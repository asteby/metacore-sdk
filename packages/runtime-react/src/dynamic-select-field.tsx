// DynamicSelectField — async, searchable single-select for declarative forms.
//
// This is the declarative answer to "I don't want to type a raw FK UUID".
// Instead of a plain <select> that dumps every option (RefSelect) or a free
// text input, it renders a typeahead combobox that queries the canonical
// options endpoint as the user types:
//
//   GET /api/options/<ref>?field=id&q=<text>&limit=<n>
//
// reusing `useOptionsResolver` (which already debounce-aborts in-flight
// requests). It is the metacore equivalent of 7leguas' `search.go` / dynamic
// `type: search` field, but driven entirely from the manifest — so an addon
// declares `type: "dynamic_select"` + `ref` and gets a searchable picker with
// zero custom React.
//
// Resolution path (highest priority first):
//   1. field.ref          → /options/<ref>?field=id        (canonical, preferred)
//   2. field.searchEndpoint→ used verbatim as the options endpoint (escape hatch)
//
// Edit-mode caveat: resolving an EXISTING value's label requires the id to be
// in a fetched page (we match by id against loaded options, else show the raw
// value). A dedicated `?ids=` lookup is a follow-up; create flows — the common
// case — start empty and never hit this.
import { useEffect, useRef, useState } from 'react'
import {
    Button,
    Command,
    CommandEmpty,
    CommandGroup,
    CommandInput,
    CommandItem,
    CommandList,
    Popover,
    PopoverContent,
    PopoverTrigger,
} from '@asteby/metacore-ui/primitives'
import { Check, ChevronsUpDown, ImageIcon, Loader2, Plus } from 'lucide-react'
import { resolveColorCss } from '@asteby/metacore-ui/lib'
import { DynamicIcon } from './dynamic-icon'
import { useOptionsResolver, type ResolvedOption } from './use-options-resolver'
import { getDependsOn, getFieldRef } from './dynamic-form-schema'
import type { ActionFieldDef } from './types'

/**
 * Default hint shown when a cascading picker's depended-on field is still
 * empty. Domain-neutral on purpose; a caller may override it per field via
 * `dependsHint`.
 */
export const DEFAULT_DEPENDS_HINT = 'Selecciona primero el campo del que depende'

/**
 * Small square thumbnail for an option's `image`. Falls back to a neutral
 * placeholder icon when the option has no image so rows/triggers stay aligned.
 * `size` is in pixels (kept small — 20–24px — so the picker reads as a list,
 * not a gallery). Inline style for the box dimensions: arbitrary Tailwind
 * classes from a federated addon don't always survive the host's class scan.
 */
export function OptionThumb({ image, size = 20 }: { image?: string | null; size?: number }) {
    const box = { width: size, height: size }
    if (!image) {
        return (
            <span
                className="text-muted-foreground bg-muted flex shrink-0 items-center justify-center rounded-sm"
                style={box}
                aria-hidden
            >
                <ImageIcon className="size-3 opacity-60" />
            </span>
        )
    }
    return (
        <img
            src={image}
            alt=""
            aria-hidden
            loading="lazy"
            className="shrink-0 rounded-sm object-cover"
            style={box}
            // A broken image url shouldn't leave a torn-icon glyph; collapse to
            // the neutral placeholder background instead.
            onError={(e) => {
                e.currentTarget.style.visibility = 'hidden'
            }}
        />
    )
}

/**
 * Leading visual for an option: a photo thumbnail (FK relations with an image),
 * else a declared icon, else a color dot (enum/status options with a color).
 * Returns null when the option carries none, so plain text options stay plain.
 */
export function OptionLead({
    option,
    size = 20,
}: {
    option?: Pick<ResolvedOption, 'image' | 'color' | 'icon'> | null
    size?: number
}) {
    if (!option) return null
    if (option.image) return <OptionThumb image={option.image} size={size} />
    if (option.icon) {
        return (
            <span
                className="flex shrink-0 items-center justify-center"
                style={{ width: size, height: size, color: option.color ? resolveColorCss(option.color) : undefined }}
                aria-hidden
            >
                <DynamicIcon name={option.icon} className="size-4" />
            </span>
        )
    }
    if (option.color) {
        return (
            <span
                className="shrink-0 rounded-full"
                style={{ width: Math.round(size * 0.5), height: Math.round(size * 0.5), background: resolveColorCss(option.color) }}
                aria-hidden
            />
        )
    }
    return null
}

/** True when any option (or the selected one) carries a renderable visual. */
function optionsHaveVisual(
    options: ReadonlyArray<Pick<ResolvedOption, 'image' | 'color' | 'icon'>>,
    selected?: Pick<ResolvedOption, 'image' | 'color' | 'icon'> | null,
): boolean {
    const has = (o?: Pick<ResolvedOption, 'image' | 'color' | 'icon'> | null) =>
        !!(o && (o.image || o.color || o.icon))
    return has(selected) || options.some(has)
}

function useDebounced<T>(value: T, ms: number): T {
    const [debounced, setDebounced] = useState(value)
    useEffect(() => {
        const t = setTimeout(() => setDebounced(value), ms)
        return () => clearTimeout(t)
    }, [value, ms])
    return debounced
}

export interface DynamicSelectFieldProps {
    field: ActionFieldDef
    value: any
    onChange: (v: any) => void
    /**
     * Pre-resolved option for the CURRENT value (label + image/color/icon) the
     * caller already has — e.g. the relation sibling the table served. Lets the
     * trigger show the name + thumbnail for an existing value without waiting for
     * a lookup (which only loads once the popover opens). Matched by id == value.
     */
    seedOption?: ResolvedOption | null
    /**
     * Cascade scope: the current value of the field this picker `dependsOn`
     * (the caller resolves it from the form context). Forwarded as
     * `filter_value`. When the field declares a `dependsOn` and this is empty,
     * the picker is disabled with `dependsHint` and the current selection is
     * cleared. Changing it re-fetches and clears the selection.
     */
    dependsValue?: string
    /** Overrides the disabled-state hint shown while `dependsValue` is empty. */
    dependsHint?: string
}

export function DynamicSelectField({
    field,
    value,
    onChange,
    seedOption,
    dependsValue,
    dependsHint,
}: DynamicSelectFieldProps) {
    const [open, setOpen] = useState(false)
    const [search, setSearch] = useState('')
    const debounced = useDebounced(search, 250)
    // Remember the label of the option the user actually picked so the trigger
    // shows a name (not a UUID) without a round-trip.
    const [picked, setPicked] = useState<ResolvedOption | null>(null)

    // Tolerate the snake_case `source`/`relation` aliases the kernel may serve
    // for the FK target, not just camelCase `ref`.
    const fieldRef = getFieldRef(field)

    // Cascade: a `dependsOn` field whose value is still empty leaves this
    // picker disabled until the parent is set. `dependsValue` is the resolved
    // value the caller threaded from the form context.
    const dependsOn = getDependsOn(field)
    const scope = dependsValue ? String(dependsValue) : ''
    const blockedByDependency = !!dependsOn && scope === ''

    const { options, loading } = useOptionsResolver({
        modelKey: '',
        fieldKey: 'id',
        ref: fieldRef,
        // searchEndpoint only drives the URL when there's no ref — ref is the
        // canonical, kernel-derived path and wins.
        endpoint: fieldRef ? undefined : field.searchEndpoint,
        query: debounced,
        limit: 20,
        // Cascade scope forwarded as filter_value (only when this field
        // declares a dependency). Re-fetches when the parent value changes.
        filterValue: dependsOn ? scope : undefined,
        // Don't fetch until the popover opens (and keep fetching as the query
        // changes while open). A picker blocked by an unset dependency never
        // fetches.
        enabled: open && !blockedByDependency,
    })

    // When the depended-on value changes, the previously-picked option no longer
    // belongs to the new scope, so clear the selection (skip the initial mount).
    const prevScopeRef = useRef<string>(scope)
    useEffect(() => {
        if (!dependsOn) return
        if (prevScopeRef.current !== scope) {
            prevScopeRef.current = scope
            setPicked(null)
            if (value) onChange('')
        }
    }, [dependsOn, scope, value, onChange])

    // The currently-selected option, resolved either from what the user picked
    // (cached in `picked`) or from the loaded page. Drives both the trigger
    // label and its thumbnail.
    const selectedOption =
        (picked && String(picked.id) === String(value) ? picked : null) ??
        options.find((o) => String(o.id) === String(value)) ??
        (seedOption && String(seedOption.id) === String(value) ? seedOption : null) ??
        null

    const selectedLabel = selectedOption?.label ?? (value ? String(value) : '')

    // Only switch the picker into "with thumbnails" mode when the data actually
    // carries images — a relation whose options have no `image` keeps the plain
    // text list it had before (no empty placeholder column).
    const hasVisual = optionsHaveVisual(options, selectedOption)

    const handlePick = (opt: ResolvedOption) => {
        setPicked(opt)
        onChange(String(opt.id))
        setOpen(false)
        setSearch('')
    }

    // Inline-create: the "+" opens the REFERENCED model's own create modal (the
    // real one the host renders for that model — full fields, not a duplicate),
    // via a decoupled window event the host listens for. On success the host
    // hands back the new record and we select it immediately. No host import →
    // no circular dependency; works for ANY dynamic_select with a `ref`.
    const openCreate = () => {
        if (!fieldRef || typeof window === 'undefined') return
        window.dispatchEvent(
            new CustomEvent('metacore:create-record', {
                detail: {
                    model: fieldRef,
                    onCreated: (rec: any) => {
                        if (rec && rec.id != null) {
                            const id = String(rec.id)
                            const label = String(rec.name ?? rec.label ?? rec.title ?? rec.id)
                            handlePick({ id, value: id, label, name: label })
                        }
                    },
                },
            }),
        )
    }

    // w-full + min-w-0: as a grid cell child, the row must be allowed to shrink
    // to the cell. Without min-w-0 the combobox+button row sizes to its content
    // (the long empty-state placeholder) and overflows the column, pushing the
    // "+" off-screen — it only "fit" once a short value was selected.
    return (
        <div className="flex w-full min-w-0 items-center gap-1.5">
            <Popover open={open && !blockedByDependency} onOpenChange={(o: boolean) => { if (!blockedByDependency) setOpen(o) }}>
            <PopoverTrigger asChild>
                <Button
                    type="button"
                    variant="outline"
                    role="combobox"
                    aria-expanded={open}
                    id={field.key}
                    disabled={blockedByDependency}
                    className="min-w-0 flex-1 justify-between font-normal"
                    data-empty={!value}
                    data-depends-blocked={blockedByDependency ? '' : undefined}
                >
                    <span className="flex min-w-0 flex-1 items-center gap-2 text-left">
                        {hasVisual && value ? (
                            <OptionLead option={selectedOption} size={20} />
                        ) : null}
                        <span className={'min-w-0 flex-1 truncate ' + (selectedLabel ? '' : 'text-muted-foreground')}>
                            {blockedByDependency
                                ? (dependsHint || DEFAULT_DEPENDS_HINT)
                                : selectedLabel || field.placeholder || 'Buscar…'}
                        </span>
                    </span>
                    <ChevronsUpDown className="ml-2 size-4 shrink-0 opacity-50" />
                </Button>
            </PopoverTrigger>
            <PopoverContent
                className="p-0"
                align="start"
                // Match the trigger width without an arbitrary Tailwind class
                // (those don't always survive a consuming app's Tailwind scan).
                style={{ width: 'var(--radix-popover-trigger-width)' }}
            >
                <Command shouldFilter={false}>
                    <CommandInput
                        placeholder={field.placeholder || 'Buscar…'}
                        value={search}
                        onValueChange={setSearch}
                    />
                    <CommandList>
                        {loading && (
                            <div className="text-muted-foreground flex items-center justify-center gap-2 py-6 text-sm">
                                <Loader2 className="size-4 animate-spin" />
                                Buscando…
                            </div>
                        )}
                        {!loading && options.length === 0 && (
                            <CommandEmpty>
                                {debounced ? 'Sin resultados' : 'Escribí para buscar…'}
                            </CommandEmpty>
                        )}
                        {!loading && options.length > 0 && (
                            <CommandGroup className="max-h-64 overflow-auto">
                                {options.map((opt) => {
                                    const isSel = String(opt.id) === String(value)
                                    return (
                                        <CommandItem
                                            key={String(opt.id)}
                                            value={String(opt.id)}
                                            onSelect={() => handlePick(opt)}
                                        >
                                            <Check className={'mr-2 size-4 shrink-0 ' + (isSel ? 'opacity-100' : 'opacity-0')} />
                                            {hasVisual && (
                                                <OptionLead option={opt} size={24} />
                                            )}
                                            <div className="ml-2 flex min-w-0 flex-col">
                                                <span className="truncate">{opt.label}</span>
                                                {opt.description && (
                                                    <span className="text-muted-foreground truncate text-xs">
                                                        {opt.description}
                                                    </span>
                                                )}
                                            </div>
                                        </CommandItem>
                                    )
                                })}
                            </CommandGroup>
                        )}
                    </CommandList>
                </Command>
            </PopoverContent>
            </Popover>
            {fieldRef && (
                <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    className="size-9 shrink-0"
                    onClick={openCreate}
                    title={`Crear ${field.label ?? fieldRef}`}
                    aria-label={`Crear ${field.label ?? fieldRef}`}
                >
                    <Plus className="size-4" />
                </Button>
            )}
        </div>
    )
}

export default DynamicSelectField
