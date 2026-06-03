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
import { useEffect, useState } from 'react'
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
import { Check, ChevronsUpDown, Loader2, Plus } from 'lucide-react'
import { useOptionsResolver, type ResolvedOption } from './use-options-resolver'
import type { ActionFieldDef } from './types'

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
}

export function DynamicSelectField({ field, value, onChange }: DynamicSelectFieldProps) {
    const [open, setOpen] = useState(false)
    const [search, setSearch] = useState('')
    const debounced = useDebounced(search, 250)
    // Remember the label of the option the user actually picked so the trigger
    // shows a name (not a UUID) without a round-trip.
    const [picked, setPicked] = useState<ResolvedOption | null>(null)

    const { options, loading } = useOptionsResolver({
        modelKey: '',
        fieldKey: 'id',
        ref: field.ref,
        // searchEndpoint only drives the URL when there's no ref — ref is the
        // canonical, kernel-derived path and wins.
        endpoint: field.ref ? undefined : field.searchEndpoint,
        query: debounced,
        limit: 20,
        // Don't fetch until the popover opens (and keep fetching as the query
        // changes while open).
        enabled: open,
    })

    const selectedLabel =
        (picked && String(picked.id) === String(value) ? picked.label : null) ??
        options.find((o) => String(o.id) === String(value))?.label ??
        (value ? String(value) : '')

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
        if (!field.ref || typeof window === 'undefined') return
        window.dispatchEvent(
            new CustomEvent('metacore:create-record', {
                detail: {
                    model: field.ref,
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

    return (
        <div className="flex items-center gap-1.5">
            <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
                <Button
                    type="button"
                    variant="outline"
                    role="combobox"
                    aria-expanded={open}
                    id={field.key}
                    className="min-w-0 flex-1 justify-between font-normal"
                    data-empty={!value}
                >
                    <span className={'min-w-0 flex-1 truncate text-left ' + (selectedLabel ? '' : 'text-muted-foreground')}>
                        {selectedLabel || field.placeholder || 'Buscar…'}
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
                                            <Check className={'mr-2 size-4 ' + (isSel ? 'opacity-100' : 'opacity-0')} />
                                            <div className="flex min-w-0 flex-col">
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
            {field.ref && (
                <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    className="size-9 shrink-0"
                    onClick={openCreate}
                    title={`Crear ${field.label ?? field.ref}`}
                    aria-label={`Crear ${field.label ?? field.ref}`}
                >
                    <Plus className="size-4" />
                </Button>
            )}
        </div>
    )
}

export default DynamicSelectField
