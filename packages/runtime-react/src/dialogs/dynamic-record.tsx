// DynamicRecordDialog — renders a create/edit/view modal for a model based
// on metadata fetched from `/metadata/modal/:model`. Ported from the ops
// starter. Host-owned infra that was referenced by alias (axios client,
// branch store) now flows through <ApiProvider> from runtime-react.
import { createContext, useContext, useEffect, useRef, useState } from 'react'
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
    DialogFooter,
    Button,
    Input,
    Textarea,
    Label,
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
    Switch,
    Skeleton,
    Badge,
    Popover,
    PopoverContent,
    PopoverTrigger,
    Command,
    CommandEmpty,
    CommandGroup,
    CommandInput,
    CommandItem,
    CommandList,
} from '@asteby/metacore-ui/primitives'
import { cn } from '@asteby/metacore-ui/lib'
import { Calendar } from './_primitives'
import { toast } from 'sonner'
import { format, parseISO } from 'date-fns'
import { es } from 'date-fns/locale'
import { ExternalLink, Loader2, CalendarIcon, ChevronDown, Check, Upload, X as XIcon } from 'lucide-react'
import { useApi } from '../api-context'

interface FieldOption {
    value: string
    label: string
}

interface FieldDef {
    key: string
    label: string
    type: 'text' | 'textarea' | 'select' | 'search' | 'number' | 'date' | 'email' | 'url' | 'boolean' | 'image' | string
    required?: boolean
    options?: FieldOption[]
    defaultValue?: any
    placeholder?: string
    readonly?: boolean
    hidden?: boolean
    searchEndpoint?: string
    filterBy?: string
}

interface ModalMetadata {
    title: string
    createTitle: string
    editTitle: string
    fields: FieldDef[]
}

export interface DynamicRecordDialogProps {
    open: boolean
    onOpenChange: (open: boolean) => void
    mode: 'view' | 'edit' | 'create'
    model: string
    recordId?: string | null
    endpoint?: string
    onSaved?: () => void
}

function resolvePath(obj: any, path: string): any {
    return path.split('.').reduce((acc, part) => acc?.[part], obj)
}

function formatDisplayValue(value: any, field: FieldDef): string {
    if (value === null || value === undefined || value === '') return '—'
    if (field.type === 'boolean' || typeof value === 'boolean') return value ? 'Sí' : 'No'

    if (field.type === 'date') {
        try {
            return new Date(value).toLocaleDateString('es-MX', {
                day: 'numeric', month: 'long', year: 'numeric',
            })
        } catch {
            return String(value)
        }
    }

    if (field.type === 'select' && field.options?.length) {
        const match = field.options.find(o => o.value === String(value))
        return match?.label ?? String(value)
    }

    return String(value)
}

const MODE_CONFIG = {
    create: {
        getTitle: (meta: ModalMetadata) => meta.createTitle || meta.title || 'Nuevo registro',
        description: 'Completa los campos para crear un nuevo registro.',
        submitLabel: 'Crear',
        submittingLabel: 'Creando...',
        cancelLabel: 'Cancelar',
    },
    edit: {
        getTitle: (meta: ModalMetadata) => meta.editTitle || meta.title || 'Editar registro',
        description: 'Modifica los campos y guarda los cambios.',
        submitLabel: 'Guardar cambios',
        submittingLabel: 'Guardando...',
        cancelLabel: 'Cancelar',
    },
    view: {
        getTitle: (meta: ModalMetadata) => meta.title || 'Ver registro',
        description: 'Información detallada del registro.',
        submitLabel: '',
        submittingLabel: '',
        cancelLabel: 'Cerrar',
    },
}

const ModelContext = createContext('')

export function DynamicRecordDialog({
    open,
    onOpenChange,
    mode,
    model,
    recordId,
    endpoint,
    onSaved,
}: DynamicRecordDialogProps) {
    const api = useApi()
    const [modalMeta, setModalMeta] = useState<ModalMetadata | null>(null)
    const [record, setRecord] = useState<any | null>(null)
    const [formValues, setFormValues] = useState<Record<string, any>>({})
    const [loading, setLoading] = useState(false)
    const [saving, setSaving] = useState(false)

    const isCreate = mode === 'create'
    const isEditable = mode === 'create' || mode === 'edit'
    const config = MODE_CONFIG[mode]

    useEffect(() => {
        if (!open) return
        if (!isCreate && !recordId) return

        let cancelled = false

        const load = async () => {
            setLoading(true)
            try {
                const metaRes = await api.get(`/metadata/modal/${model}`)
                if (cancelled) return

                const meta: ModalMetadata = metaRes.data?.data ?? metaRes.data
                setModalMeta(meta)

                if (isCreate) {
                    const initial: Record<string, any> = {}
                    for (const field of meta.fields ?? []) {
                        initial[field.key] = field.defaultValue ?? ''
                    }
                    setFormValues(initial)
                } else {
                    const recordEndpoint = endpoint
                        ? `${endpoint}/${recordId}`
                        : `/dynamic/${model}/${recordId}`

                    const recRes = await api.get(recordEndpoint)
                    if (cancelled) return

                    const rec = recRes.data?.data ?? recRes.data
                    setRecord(rec)

                    const initial: Record<string, any> = {}
                    for (const field of meta.fields ?? []) {
                        initial[field.key] = resolvePath(rec, field.key) ?? field.defaultValue ?? ''
                    }
                    setFormValues(initial)
                }
            } catch (err) {
                console.error('[DynamicRecordDialog] load error:', err)
                toast.error('Error al cargar los datos')
            } finally {
                if (!cancelled) setLoading(false)
            }
        }

        load()
        return () => { cancelled = true }
    }, [open, recordId, model, endpoint, isCreate])

    useEffect(() => {
        if (!open) {
            setModalMeta(null)
            setRecord(null)
            setFormValues({})
        }
    }, [open])

    const handleSubmit = async (e?: React.FormEvent) => {
        e?.preventDefault()
        if (!modalMeta) return

        if (isEditable) {
            for (const field of modalMeta.fields) {
                if (field.required && !formValues[field.key] && formValues[field.key] !== 0 && formValues[field.key] !== false) {
                    toast.error(`El campo "${field.label}" es obligatorio`)
                    return
                }
            }
        }

        setSaving(true)
        try {
            let res
            if (isCreate) {
                const createEndpoint = endpoint || `/dynamic/${model}`
                res = await api.post(createEndpoint, formValues)
            } else {
                const updateEndpoint = endpoint
                    ? `${endpoint}/${recordId}`
                    : `/dynamic/${model}/${recordId}`
                res = await api.put(updateEndpoint, formValues)
            }

            if (res.data?.success !== false) {
                toast.success(res.data?.message || (isCreate ? 'Registro creado correctamente' : 'Guardado correctamente'))
                onSaved?.()
                onOpenChange(false)
            } else {
                toast.error(res.data?.message || 'Error al guardar')
            }
        } catch (err: any) {
            toast.error(err?.response?.data?.message || 'Error al guardar')
        } finally {
            setSaving(false)
        }
    }

    const title = modalMeta ? config.getTitle(modalMeta) : ''

    const visibleFields = modalMeta?.fields?.filter(f => {
        if (f.hidden) return false
        if (isCreate && f.readonly) return false
        return true
    }) ?? []

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-2xl max-h-[90vh] flex flex-col p-0 gap-0 overflow-hidden">
                <DialogHeader className="p-6 pb-4 border-b shrink-0">
                    <DialogTitle>{title}</DialogTitle>
                    <DialogDescription>{config.description}</DialogDescription>
                </DialogHeader>

                <div className="flex-1 overflow-y-auto p-6">
                    {loading ? (
                        <LoadingSkeleton />
                    ) : modalMeta ? (
                        <ModelContext.Provider value={model}>
                            <form
                                id="dynamic-record-form"
                                onSubmit={handleSubmit}
                                className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-4"
                            >
                                {visibleFields.map(field => {
                                    const isFullWidth = field.type === 'textarea'
                                    return (
                                        <div
                                            key={field.key}
                                            className={isFullWidth ? 'sm:col-span-2' : ''}
                                        >
                                            <FieldRow
                                                field={field}
                                                record={record}
                                                value={formValues[field.key] ?? ''}
                                                mode={mode}
                                                onChange={val =>
                                                    setFormValues((prev: Record<string, any>) => ({ ...prev, [field.key]: val }))
                                                }
                                            />
                                        </div>
                                    )
                                })}

                                {record?.external_url && (
                                    <div className="sm:col-span-2">
                                        <a
                                            href={record.external_url}
                                            target="_blank"
                                            rel="noreferrer"
                                            className="inline-flex items-center gap-1.5 text-sm text-primary hover:underline mt-1"
                                        >
                                            <ExternalLink className="h-3.5 w-3.5" />
                                            Ver en {record.external_provider ?? 'proveedor externo'}
                                        </a>
                                    </div>
                                )}
                            </form>
                        </ModelContext.Provider>
                    ) : null}
                </div>

                <DialogFooter className="p-4 border-t shrink-0">
                    <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
                        {config.cancelLabel}
                    </Button>
                    {isEditable && (
                        <Button
                            type="submit"
                            form="dynamic-record-form"
                            disabled={saving || loading}
                        >
                            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                            {saving ? config.submittingLabel : config.submitLabel}
                        </Button>
                    )}
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}

function LoadingSkeleton() {
    return (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-4">
            {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="flex flex-col gap-1.5">
                    <Skeleton className="h-3.5 w-24" />
                    <Skeleton className="h-9 w-full" />
                </div>
            ))}
        </div>
    )
}

interface FieldRowProps {
    field: FieldDef
    record: any
    value: any
    mode: 'view' | 'edit' | 'create'
    onChange: (val: any) => void
}

function FieldRow({ field, record, value, mode, onChange }: FieldRowProps) {
    const isReadonly = field.readonly || mode === 'view'

    return (
        <div className="flex flex-col gap-1.5">
            <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                {field.label}
                {field.required && mode !== 'view' && (
                    <span className="text-destructive ml-0.5">*</span>
                )}
            </Label>

            {isReadonly ? (
                <ViewValue field={field} value={value} record={record} />
            ) : (
                <EditField field={field} value={value} onChange={onChange} />
            )}
        </div>
    )
}

function ViewValue({ field, value }: { field: FieldDef; value: any; record: any }) {
    if (field.type === 'search' && value) {
        return <SearchViewValue field={field} value={value} />
    }

    if (field.type === 'boolean' || typeof value === 'boolean') {
        return (
            <div className="flex items-center gap-2 py-1">
                <Switch checked={!!value} disabled />
                <span className="text-sm text-muted-foreground">
                    {value ? 'Sí' : 'No'}
                </span>
            </div>
        )
    }

    if (field.type === 'color') {
        return value ? (
            <div className="flex items-center gap-2">
                <div className="h-5 w-5 rounded-full border shadow-sm" style={{ backgroundColor: value }} />
                <span className="text-sm">{value}</span>
            </div>
        ) : (
            <p className="text-sm py-1 text-muted-foreground">-</p>
        )
    }

    if (field.type === 'image') {
        return value ? (
            <img src={value} alt={field.label} className="h-16 w-16 rounded-lg object-cover border" />
        ) : (
            <p className="text-sm py-1 text-muted-foreground">Sin imagen</p>
        )
    }

    if (field.type === 'url' && value) {
        return (
            <a
                href={value}
                target="_blank"
                rel="noreferrer"
                className="text-sm text-primary hover:underline truncate"
            >
                {value}
            </a>
        )
    }

    if (field.type === 'select' && field.options?.length) {
        const match = field.options.find(o => o.value === String(value ?? ''))
        if (match) {
            return <Badge variant="secondary" className="w-fit">{match.label}</Badge>
        }
    }

    const display = formatDisplayValue(value, field)

    if (field.type === 'textarea') {
        return (
            <p className="text-sm whitespace-pre-wrap rounded-md bg-muted/40 p-3 min-h-[60px]">
                {display}
            </p>
        )
    }

    return <p className="text-sm py-1">{display}</p>
}

function EditField({ field, value, onChange }: {
    field: FieldDef
    value: any
    onChange: (val: any) => void
}) {
    if (field.type === 'boolean') {
        return (
            <div className="flex items-center gap-2 py-1">
                <Switch
                    checked={!!value}
                    onCheckedChange={onChange}
                />
                <span className="text-sm text-muted-foreground">
                    {value ? 'Sí' : 'No'}
                </span>
            </div>
        )
    }

    if (field.type === 'textarea') {
        return (
            <Textarea
                value={value ?? ''}
                onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => onChange(e.target.value)}
                placeholder={field.placeholder}
                rows={4}
            />
        )
    }

    if (field.type === 'image') {
        return <ImageUploadField field={field} value={value} onChange={onChange} />
    }

    if (field.type === 'search' && field.searchEndpoint) {
        return <SearchField field={field} value={value} onChange={onChange} />
    }

    if (field.type === 'select' && field.searchEndpoint && !field.options?.length) {
        return <SearchField field={{ ...field, type: 'search' }} value={value} onChange={onChange} />
    }

    if (field.type === 'select' && field.options?.length) {
        return (
            <Select value={String(value ?? '')} onValueChange={onChange}>
                <SelectTrigger>
                    <SelectValue placeholder="Seleccionar..." />
                </SelectTrigger>
                <SelectContent>
                    {field.options.map(opt => (
                        <SelectItem key={opt.value} value={opt.value}>
                            {opt.label}
                        </SelectItem>
                    ))}
                </SelectContent>
            </Select>
        )
    }

    if (field.type === 'color') {
        return (
            <div className="flex items-center gap-2">
                <input
                    type="color"
                    value={value || '#6366f1'}
                    onChange={(e) => onChange(e.target.value)}
                    className="h-9 w-14 cursor-pointer rounded-md border p-1"
                />
                <Input
                    value={value || ''}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => onChange(e.target.value)}
                    placeholder="#6366f1"
                    className="flex-1 h-9"
                />
            </div>
        )
    }

    if (field.type === 'date') {
        const dateValue = value ? (typeof value === 'string' ? parseISO(value) : new Date(value)) : undefined
        const validDate = dateValue && !isNaN(dateValue.getTime()) ? dateValue : undefined

        return (
            <Popover>
                <PopoverTrigger asChild>
                    <Button
                        variant="outline"
                        className={cn(
                            "w-full justify-start text-left font-normal h-9",
                            !validDate && "text-muted-foreground"
                        )}
                    >
                        <CalendarIcon className="mr-2 h-4 w-4" />
                        {validDate
                            ? format(validDate, 'PPP', { locale: es })
                            : "Seleccionar fecha"}
                    </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                        mode="single"
                        selected={validDate}
                        onSelect={(date) => onChange(date ? format(date, 'yyyy-MM-dd') : '')}
                        locale={es}
                    />
                </PopoverContent>
            </Popover>
        )
    }

    const inputType = field.type === 'number'
        ? 'number'
        : field.type === 'email'
            ? 'email'
            : 'text'

    return (
        <Input
            type={inputType}
            value={value ?? ''}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => onChange(
                field.type === 'number' ? (e.target.value === '' ? '' : Number(e.target.value)) : e.target.value
            )}
            placeholder={field.placeholder}
        />
    )
}

function ImageUploadField({ field: _field, value, onChange }: { field: FieldDef; value: any; onChange: (val: any) => void }) {
    const api = useApi()
    const model = useContext(ModelContext)
    const [uploading, setUploading] = useState(false)
    const inputRef = useRef<HTMLInputElement>(null)

    async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
        const file = e.target.files?.[0]
        if (!file) return

        setUploading(true)
        try {
            const formData = new FormData()
            formData.append('file', file)
            formData.append('folder', model || 'uploads')
            const res = await api.post('/upload', formData)
            const url = res.data?.data?.url || res.data?.url
            if (url) onChange(url)
        } catch {
            toast.error('Error al subir imagen')
        } finally {
            setUploading(false)
            if (inputRef.current) inputRef.current.value = ''
        }
    }

    return (
        <div className="flex items-center gap-3">
            {value ? (
                <div className="relative">
                    <img src={value} alt="" className="h-16 w-16 rounded-lg object-cover border" />
                    <button
                        type="button"
                        onClick={() => onChange('')}
                        className="absolute -top-1.5 -right-1.5 size-5 bg-destructive text-white rounded-full flex items-center justify-center hover:bg-destructive/90"
                    >
                        <XIcon className="size-3" />
                    </button>
                </div>
            ) : (
                <button
                    type="button"
                    onClick={() => inputRef.current?.click()}
                    disabled={uploading}
                    className="h-16 w-16 rounded-lg border-2 border-dashed border-muted-foreground/30 flex flex-col items-center justify-center gap-1 hover:border-primary/50 hover:bg-muted/50 transition-colors disabled:opacity-50"
                >
                    {uploading ? (
                        <Loader2 className="size-4 animate-spin text-muted-foreground" />
                    ) : (
                        <Upload className="size-4 text-muted-foreground" />
                    )}
                </button>
            )}
            <input ref={inputRef} type="file" accept="image/*" onChange={handleFile} className="hidden" />
            {!value && <span className="text-xs text-muted-foreground">PNG, JPG, WebP</span>}
        </div>
    )
}

function extractArray(res: any): any[] {
    const d = res.data
    if (Array.isArray(d)) return d
    if (d?.data && Array.isArray(d.data)) return d.data
    return []
}

const searchCache = new Map<string, any[]>()

function SearchViewValue({ field, value }: { field: FieldDef; value: any }) {
    const api = useApi()
    const [label, setLabel] = useState(String(value))

    useEffect(() => {
        if (!field.searchEndpoint || !value) return
        const cacheKey = field.searchEndpoint
        const cached = searchCache.get(cacheKey)
        if (cached) {
            const match = cached.find((item: any) => item.value === value || item.id === value)
            if (match) { setLabel(match.label || match.name || String(value)); return }
        }
        api.get(field.searchEndpoint, { params: { search: '', limit: 50 } }).then(res => {
            const items = extractArray(res)
            searchCache.set(cacheKey, items)
            const match = items.find((item: any) => item.value === value || item.id === value)
            if (match) setLabel(match.label || match.name || String(value))
        }).catch(() => {})
    }, [value, field.searchEndpoint])

    return <p className="text-sm py-1">{label}</p>
}

function SearchField({ field, value, onChange }: { field: FieldDef; value: any; onChange: (val: any) => void }) {
    const api = useApi()
    const [open, setOpen] = useState(false)
    const [query, setQuery] = useState('')
    const [results, setResults] = useState<any[]>([])
    const [loading, setLoading] = useState(false)
    const [selectedLabel, setSelectedLabel] = useState('')

    useEffect(() => {
        if (!value || !field.searchEndpoint) return
        const cached = searchCache.get(field.searchEndpoint)
        if (cached) {
            const match = cached.find((item: any) => item.value === value || item.id === value)
            if (match) { setSelectedLabel(match.label || match.name || ''); return }
        }
        api.get(field.searchEndpoint, { params: { search: '', limit: 50 } }).then(res => {
            const items = extractArray(res)
            searchCache.set(field.searchEndpoint!, items)
            const match = items.find((item: any) => item.value === value || item.id === value)
            if (match) setSelectedLabel(match.label || match.name || '')
        }).catch(() => {})
    }, [value, field.searchEndpoint])

    useEffect(() => {
        if (!open || !field.searchEndpoint) return
        if (!query) {
            const cached = searchCache.get(field.searchEndpoint)
            if (cached) { setResults(cached); return }
        }
        setLoading(true)
        const timer = setTimeout(() => {
            api.get(field.searchEndpoint!, { params: { search: query, limit: 20 } }).then(res => {
                const items = extractArray(res)
                if (!query) searchCache.set(field.searchEndpoint!, items)
                setResults(items)
            }).catch(() => setResults([]))
                .finally(() => setLoading(false))
        }, query ? 250 : 0)
        return () => clearTimeout(timer)
    }, [query, open, field.searchEndpoint])

    return (
        <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
                <Button
                    variant="outline"
                    role="combobox"
                    className={cn(
                        "w-full justify-between font-normal h-9",
                        !value && "text-muted-foreground"
                    )}
                >
                    <span className="truncate">{selectedLabel || `Seleccionar ${field.label?.toLowerCase() || ''}...`}</span>
                    <ChevronDown className="ml-auto h-4 w-4 shrink-0 opacity-50" />
                </Button>
            </PopoverTrigger>
            <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start" side="bottom" sideOffset={4}>
                <Command shouldFilter={false}>
                    <CommandInput
                        placeholder={`Buscar ${field.label?.toLowerCase() || ''}...`}
                        value={query}
                        onValueChange={setQuery}
                    />
                    <CommandList className="max-h-[200px]">
                        {loading ? (
                            <div className="py-6 text-center text-sm">
                                <Loader2 className="h-4 w-4 animate-spin mx-auto mb-1 text-muted-foreground" />
                                <span className="text-muted-foreground text-xs">Buscando...</span>
                            </div>
                        ) : results.length === 0 ? (
                            <CommandEmpty>Sin resultados.</CommandEmpty>
                        ) : (
                            <CommandGroup>
                                {results.map((item: any) => {
                                    const itemValue = item.value ?? item.id
                                    const itemLabel = item.label ?? item.name ?? ''
                                    const isSelected = value === itemValue
                                    return (
                                        <CommandItem
                                            key={itemValue}
                                            value={String(itemValue)}
                                            onSelect={() => {
                                                onChange(itemValue)
                                                setSelectedLabel(itemLabel)
                                                setOpen(false)
                                                setQuery('')
                                            }}
                                        >
                                            {isSelected && <Check className="mr-2 h-3.5 w-3.5 shrink-0 text-primary" />}
                                            {item.image && (
                                                <img src={item.image} className="h-5 w-5 rounded mr-2 object-cover shrink-0" alt="" />
                                            )}
                                            <div className="flex flex-col min-w-0">
                                                <span className="truncate">{itemLabel}</span>
                                                {item.description && (
                                                    <span className="text-[11px] text-muted-foreground truncate">{item.description}</span>
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
    )
}
