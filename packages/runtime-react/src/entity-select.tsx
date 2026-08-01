// EntitySelect — the shared, permission-aware single-select for a related model.
//
// A searchable async combobox over a kernel model's records, plus the two
// affordances every "pick a related record" control should have, exactly like
// the dynamic create modal's relation fields (Categoría/Marca) do:
//
//   - nothing selected → a "+" that opens the model's CREATE dialog, and
//     auto-selects the record it creates;
//   - a record selected → a pencil that opens that record's EDIT dialog.
//
// Both affordances are gated by the kernel permissions (useCan): the "+" only
// shows when the user can create the model, the pencil only when they can edit
// it. Everything is DYNAMIC — the create/edit form comes from the model's
// `/metadata/modal/:model` schema via <CreateRecordDialog>, so no per-model form
// code is needed. This lives in the SDK so POS, purchases and any future addon
// share ONE implementation instead of each re-porting a bespoke picker.
import { useCallback, useEffect, useState } from 'react'
import { Search, X, Plus, Pencil, type LucideIcon } from 'lucide-react'
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
} from '@asteby/metacore-ui'
import { CreateRecordDialog } from './dialogs/create-record-dialog'
import { useCan } from './permissions-context'
import { useApi } from './api-context'

/** One searchable option: `value` is the id, `label` the display text. */
export interface EntitySelectOption {
    value: string
    label: string
    description?: string
}

export interface EntitySelectProps {
    /** Kernel model key (e.g. "Supplier", "Warehouse", "Category"). */
    model: string
    /** Currently selected id (or null). */
    value: string | null
    /** Label of the selected record (rendered without a re-fetch). */
    label: string | null
    /** Called with (id, label) on select/create/clear. */
    onSelect: (id: string | null, label: string | null) => void
    /** Async search over the model. Callers pass their `/api/options/<model>` fetcher. */
    fetcher: (q: string, signal: AbortSignal) => Promise<EntitySelectOption[]>

    icon?: LucideIcon
    placeholder?: string
    searchPlaceholder?: string
    emptyText?: string
    /** Preload first results on open and drop the 2-char gate. */
    preload?: boolean

    /**
     * Permission overrides. By default create/edit are gated by the kernel
     * permissions `<model>.create` / `<model>.update` (useCan). Pass explicit
     * booleans to force them (e.g. a read-only surface).
     */
    canCreate?: boolean
    canEdit?: boolean

    /**
     * CRUD endpoint base for the create/edit dialog. Defaults to the standard
     * org-scoped `/data/<model>/me`, with edit at `/data/<model>/me/<id>`.
     */
    endpoint?: string
    /** Record field used as the label after create/edit (default "name"). */
    labelField?: string
    /** Disable the whole control. */
    disabled?: boolean
}

/** Lowercase model → permission capability namespace (Supplier → supplier). */
function capabilityNamespace(model: string): string {
    return model.replace(/([a-z0-9])([A-Z])/g, '$1_$2').toLowerCase()
}

export function EntitySelect({
    model,
    value,
    label,
    onSelect,
    fetcher,
    icon: Icon,
    placeholder = 'Seleccionar…',
    searchPlaceholder = 'Buscar…',
    emptyText = 'Sin resultados',
    preload = false,
    canCreate,
    canEdit,
    endpoint,
    labelField = 'name',
    disabled = false,
}: EntitySelectProps) {
    const can = useCan()
    const api = useApi()

    const ns = capabilityNamespace(model)
    const mayCreate = canCreate ?? can(`${ns}.create`)
    const mayEdit = canEdit ?? can(`${ns}.update`)
    const base = endpoint ?? `/data/${model}/me`

    const [open, setOpen] = useState(false)
    const [dialogOpen, setDialogOpen] = useState(false)
    const [dialogRecordId, setDialogRecordId] = useState<string | undefined>(undefined)
    const [searchTerm, setSearchTerm] = useState('')
    const [results, setResults] = useState<EntitySelectOption[]>([])
    const [isLoading, setIsLoading] = useState(false)

    const minChars = preload ? 0 : 2

    const run = useCallback(
        async (q: string, signal: AbortSignal) => {
            if (q.length < minChars) {
                setResults([])
                return
            }
            setIsLoading(true)
            try {
                const rows = await fetcher(q, signal)
                if (!signal.aborted) setResults(rows)
            } catch {
                if (!signal.aborted) setResults([])
            } finally {
                if (!signal.aborted) setIsLoading(false)
            }
        },
        [fetcher, minChars],
    )

    useEffect(() => {
        if (!open) return
        const controller = new AbortController()
        const timeout = setTimeout(() => run(searchTerm, controller.signal), 250)
        return () => {
            clearTimeout(timeout)
            controller.abort()
        }
    }, [searchTerm, run, open])

    const pick = (row: EntitySelectOption) => {
        onSelect(row.value, row.label)
        setOpen(false)
        setSearchTerm('')
    }

    const clear = (e: React.MouseEvent) => {
        e.stopPropagation()
        onSelect(null, null)
    }

    const openCreate = (e: React.MouseEvent) => {
        e.stopPropagation()
        setDialogRecordId(undefined)
        setDialogOpen(true)
    }
    const openEdit = (e: React.MouseEvent) => {
        e.stopPropagation()
        if (!value) return
        setDialogRecordId(value)
        setDialogOpen(true)
    }

    // Read the {id,label} off a saved record and select it. The transport
    // matches the standard org-scoped CRUD the dynamic modal uses, so create/edit
    // stay consistent with the rest of the app.
    const selectSaved = (rec: Record<string, unknown> | undefined | null) => {
        if (!rec) return
        const id = rec.id != null ? String(rec.id) : value ?? ''
        const lbl =
            (rec[labelField] != null && String(rec[labelField])) ||
            (rec.name != null && String(rec.name)) ||
            label ||
            id
        onSelect(id, lbl)
    }

    return (
        <div className="flex items-center gap-1.5">
            <Popover open={open} onOpenChange={disabled ? undefined : setOpen}>
                <PopoverTrigger asChild>
                    <Button
                        variant="outline"
                        disabled={disabled}
                        className="w-full flex-1 justify-start gap-2 font-normal"
                    >
                        {Icon && <Icon className="text-muted-foreground size-4 shrink-0" />}
                        <span className="flex-1 truncate text-left">{label ?? placeholder}</span>
                        {value && (
                            <span
                                role="button"
                                tabIndex={0}
                                onClick={clear}
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter' || e.key === ' ')
                                        clear(e as unknown as React.MouseEvent)
                                }}
                                className="hover:bg-accent ml-auto shrink-0 rounded-sm p-0.5"
                            >
                                <X className="size-3.5" />
                            </span>
                        )}
                    </Button>
                </PopoverTrigger>
                <PopoverContent
                    className="p-0"
                    align="start"
                    style={{ width: 'var(--radix-popover-trigger-width)' }}
                >
                    <Command shouldFilter={false}>
                        <CommandInput
                            placeholder={searchPlaceholder}
                            value={searchTerm}
                            onValueChange={setSearchTerm}
                        />
                        <CommandList>
                            {isLoading && (
                                <div className="text-muted-foreground py-4 text-center text-sm">
                                    Buscando…
                                </div>
                            )}
                            {!isLoading &&
                                searchTerm.length >= minChars &&
                                results.length === 0 && <CommandEmpty>{emptyText}</CommandEmpty>}
                            {!isLoading && results.length > 0 && (
                                <CommandGroup className="max-h-64 overflow-auto">
                                    {results.map((row) => (
                                        <CommandItem
                                            key={row.value}
                                            value={row.value}
                                            onSelect={() => pick(row)}
                                            className="flex flex-col items-start gap-0.5"
                                        >
                                            <span className="text-sm font-medium">{row.label}</span>
                                            {row.description && (
                                                <span className="text-muted-foreground text-xs">
                                                    {row.description}
                                                </span>
                                            )}
                                        </CommandItem>
                                    ))}
                                </CommandGroup>
                            )}
                            {!isLoading && !preload && searchTerm.length < minChars && (
                                <div className="text-muted-foreground flex flex-col items-center gap-1 py-6">
                                    <Search className="size-5" />
                                    <span className="text-xs">Escribe al menos 2 caracteres</span>
                                </div>
                            )}
                        </CommandList>
                    </Command>
                </PopoverContent>
            </Popover>

            {/* Selected → edit (pencil); empty → create (+). Each gated by perms. */}
            {value
                ? mayEdit && (
                      <Button
                          type="button"
                          variant="outline"
                          size="icon"
                          disabled={disabled}
                          onClick={openEdit}
                          aria-label="Editar"
                          title="Editar"
                          className="shrink-0"
                      >
                          <Pencil className="size-4" />
                      </Button>
                  )
                : mayCreate && (
                      <Button
                          type="button"
                          variant="outline"
                          size="icon"
                          disabled={disabled}
                          onClick={openCreate}
                          aria-label="Crear"
                          title="Crear"
                          className="shrink-0"
                      >
                          <Plus className="size-4" />
                      </Button>
                  )}

            {dialogOpen && (
                <CreateRecordDialog
                    modelKey={model}
                    open={dialogOpen}
                    onOpenChange={setDialogOpen}
                    recordId={dialogRecordId}
                    endpoint={base}
                    onCreate={async (data) => {
                        const res = await api.post(base, data)
                        const rec = (res.data?.data ?? res.data) as Record<string, unknown>
                        selectSaved(rec)
                        return rec.id != null ? { id: String(rec.id) } : undefined
                    }}
                    onUpdate={async (id, data) => {
                        const res = await api.put(`${base}/${id}`, data)
                        const rec = (res.data?.data ?? res.data) as Record<string, unknown>
                        selectSaved({ id, ...rec })
                        return { id: String(id) }
                    }}
                />
            )}
        </div>
    )
}
