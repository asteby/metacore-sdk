// DynamicRecordDialog — renders a create/edit/view modal for a model based
// on metadata fetched from `/metadata/modal/:model`. This is the single,
// SDK-owned source of truth for declarative record rendering (the ops fork was
// consolidated back into here): tz-aware dates, FK image/label leads in both
// view and edit, resolved relation/user-object labels (never raw JSON), nil-UUID
// elision, pro option color/icon badges, and one_to_many child panels.
//
// Host-owned infra that was referenced by alias (axios client, branch store)
// flows through <ApiProvider> from runtime-react. Host-specific runtime values —
// the image-url resolver and the org IANA timezone — are passed as props so the
// SDK stays transport- and host-agnostic.
import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { ModelSchema } from './types'
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
    Calendar,
} from '@asteby/metacore-ui/primitives'
import { cn } from '@asteby/metacore-ui/lib'
import { toast } from 'sonner'
import { format, parseISO } from 'date-fns'
import { es } from 'date-fns/locale'
import { ExternalLink, Loader2, CalendarIcon, ChevronDown, Check, Upload, X as XIcon } from 'lucide-react'
import { useApi } from '../api-context'
import { DynamicSelectField, OptionLead, OptionThumb } from '../dynamic-select-field'
import { DynamicRelations } from '../dynamic-relations'
import { useOptionsResolver, type ResolvedOption } from '../use-options-resolver'
import { getFieldRef } from '../dynamic-form-schema'
import { isNilUuid, normalizeNilUuid } from '../nil-uuid'
import { DynamicIcon, isLucideIconName } from '../dynamic-icon'
import { humanizeToken } from '../dynamic-columns-helpers'
import { formatDateCell } from '../dynamic-columns'
import {
    OptionBadge,
    statusColorFor,
    useIsDarkTheme,
    type DisplayOption,
} from '../display-value'
import { generateBadgeStyles } from '@asteby/metacore-ui/lib'
import { CollectionCell, type ItemField } from '../collection-cell'
import type { ActionFieldDef, RelationMeta } from '../types'
import { ImageUrlContext, identityImageUrl, type GetImageUrl } from '../image-url-context'
import { TimeZoneContext, CurrencyContext } from '../org-runtime-context'

// Re-export the resolver type so `index.ts`'s
// `export type { … GetImageUrl } from './dialogs/dynamic-record'` keeps working.
export type { GetImageUrl }

export interface FieldOption {
    value: string
    label: string
    /**
     * Pro option metadata the backend serves for enum/option fields (e.g.
     * `product_type`) so the view renders a colored/iconed badge instead of the
     * raw value ("storable" → "Almacenable"). All optional and driven entirely
     * by the served metadata — plain options stay plain.
     */
    color?: string
    icon?: string
    image?: string
}

export interface FieldDef {
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
    /**
     * FK target model the kernel auto-derives for a belongs_to column (>=
     * v0.46.x serves it on modal fields, not just action fields). When present
     * the native form renders an async searchable picker (`DynamicSelectField`)
     * against `/api/options/<ref>?field=id` — with option thumbnails when the
     * remote rows carry an `image` — instead of a raw FK text input. View mode
     * shows the resolved thumbnail + label. Tolerates the snake_case
     * `source`/`relation` aliases the manifest may serve.
     */
    ref?: string
    source?: string
    relation?: string
    /**
     * Explicit renderer hint. Wins over the `type` switch: `dynamic_select`
     * forces the searchable picker, `upload` forces the file dropzone. Lets the
     * kernel opt a plain text/uuid column into a rich widget without changing
     * its SQL type. Unknown values fall through to the `type`-based default.
     */
    widget?: string
    /**
     * Declarative display hint the backend stamps on the column/modal field
     * (mirrors the table column's `cellStyle`). `'currency'` makes the view
     * renderer format the numeric value in the org currency. Optional —
     * absent, a money-key heuristic still detects obvious money fields.
     */
    cellStyle?: string
    /**
     * Per-field style overrides served alongside `cellStyle` (e.g.
     * `{ currency: 'MXN' }`). When it carries an explicit `currency` it wins
     * over the org fallback.
     */
    styleConfig?: Record<string, any>
    /**
     * Declared schema for a jsonb line-items field (kernel v3 `item_fields`).
     * The backend serves this on modal/detail fields the same way it does on
     * table columns. When present the read-only detail view renders the
     * `CollectionCell` mini-table with these (already-localized) headers in
     * order and resolves `ref` columns to the backend-injected sibling label.
     * Tolerates the snake_case `item_fields` the kernel serves.
     */
    itemFields?: ItemField[]
    /** snake_case alias served by the kernel for `itemFields`. */
    item_fields?: ItemField[]
}

// Permissive shape: the wire payload may omit some fields (e.g. `title` is
// optional on legacy backends). Keep field types loose so a host-supplied
// `ModelSchema` (see ./types.ts) is structurally assignable here.
interface ModalMetadata {
    title?: string
    /**
     * i18n key for the model name (e.g. "accounting.model.account"). The backend
     * can't always localize it (the addon bundle is only registered at install
     * time), so it ships the key and we translate here — the frontend loads each
     * addon's i18n live from the hub, so it resolves without a reinstall.
     */
    titleKey?: string
    createTitle?: string
    editTitle?: string
    fields?: FieldDef[]
    /**
     * Backend-localized CRUD success messages (modal metadata). Preferred over
     * the raw response message which is not localized.
     */
    messages?: { created?: string; updated?: string; deleted?: string }
}

type TFn = (key: string) => string

// localizedModelName resolves the (possibly addon-i18n) model name: prefer the
// translated titleKey, fall back to the backend-provided raw title.
function localizedModelName(meta: ModalMetadata, t: TFn): string {
    if (meta.titleKey && t(meta.titleKey) !== meta.titleKey) return t(meta.titleKey)
    return meta.title || ''
}

export interface DynamicRecordDialogProps {
    open: boolean
    onOpenChange: (open: boolean) => void
    mode: 'view' | 'edit' | 'create'
    model: string
    recordId?: string | null
    endpoint?: string
    /** Fired after a successful save; receives the persisted record (when the
     * backend returns it) so callers — e.g. the inline-create bridge behind a
     * dynamic_select "+" — can auto-select the new row. */
    onSaved?: (record?: any) => void
    /**
     * Optional override invoked instead of the default `POST` when the dialog
     * is in `create` mode. Hosts may use this to route writes through custom
     * mutations (optimistic updates, audit hooks, etc.). The dialog still
     * closes and fires `onSaved` on success.
     */
    onCreate?: (data: Record<string, any>) => Promise<{ id?: string | number } | void>
    /**
     * Optional override invoked instead of the default `PUT` when the dialog
     * is in `edit` mode. Receives the record id and the form payload.
     */
    onUpdate?: (recordId: string, data: Record<string, any>) => Promise<{ id?: string | number } | void>
    /**
     * Optional default values seeded into the form on `create`. Ignored when
     * `mode` is `'edit'` or `'view'` (those fetch from the record endpoint).
     */
    defaults?: Record<string, any>
    /**
     * Optional pre-fetched metadata. When provided the dialog skips the
     * `/metadata/modal/:model` request and uses this shape directly.
     */
    schema?: ModelSchema
    /**
     * Optional handler shown as a "Delete" action in `view` mode. The dialog
     * awaits the promise and closes on success. Omit to hide the action.
     */
    onDelete?: () => Promise<void>
    /**
     * Optional handler shown as an "Edit" action in `view` mode. Omit to hide
     * the action.
     */
    onEdit?: () => void
    /**
     * Deliberate escape hatch: open the full `/m/:model/:id` detail page (with
     * cross-module related records) for records too heavy for the modal.
     * Rendered as a footer link in view mode when provided.
     */
    onOpenFullPage?: () => void
    /**
     * The row object the table already loaded. When provided, the dialog renders
     * instantly from it (no spinner) and reuses the table's pro siblings — the
     * resolved relation (`row.category = {value,label}`), served option lists and
     * image urls. A background fetch only fills in fields the list row omitted.
     */
    initialRecord?: Record<string, any> | null
    /**
     * Host resolver turning a (possibly relative) storage path into a fetchable
     * URL for images/avatars/thumbnails. Defaults to identity. Pass the host's
     * `getImageUrl` so addon-served relative paths render.
     */
    getImageUrl?: GetImageUrl
    /**
     * Org IANA timezone (e.g. `America/Mexico_City`). Threaded into the tz-aware
     * `formatDateCell` so datetime/timestamp instants render in the org zone
     * regardless of the viewer's browser timezone. Pure `date` values pin to UTC.
     */
    timeZone?: string
    /**
     * Org ISO-4217 currency code (e.g. `MXN`) used as the fallback for money
     * fields (`cellStyle:'currency'` or the money-key heuristic) that lack an
     * explicit per-field currency. Optional — defaults to 'USD'.
     */
    currency?: string
    /**
     * Fired after a child relation row (line item, etc.) is created/updated/
     * deleted from within the dialog. The dialog ALREADY refetches its own
     * parent record so server-recomputed rollups (sub_total, tax_amount, total)
     * appear in place — this callback additionally lets the host invalidate its
     * own list/detail query so the parent row's totals refresh underneath.
     */
    onChange?: () => void
}

function resolvePath(obj: any, path: string): any {
    return path.split('.').reduce((acc, part) => acc?.[part], obj)
}

// objectLabel pulls a human label off a resolved relation/user object the
// backend serves: `{value,label}` (FK sibling), `{name,...}` (user object such
// as created_by), or `{title}`. Returns undefined for plain/empty objects.
function objectLabel(value: any): string | undefined {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined
    const label = value.label ?? value.name ?? value.title
    if (label != null && label !== '') return String(label)
    return undefined
}

// pickImage reads an image-ish path off a resolved object (FK sibling, user).
function pickImage(value: any): string | undefined {
    if (!value || typeof value !== 'object') return undefined
    const img = value.image ?? value.avatar ?? value.logo ?? value.thumbnail
    return typeof img === 'string' && img !== '' ? img : undefined
}

// relationSiblingValue reads the resolved relation the table served alongside an
// FK column. A field `category_id` (search/dynamic_select/ref) ships a sibling
// `record.category = {value,label,image?}` (or a bare string/{name}); returns
// the raw sibling (object or string) so the caller can extract label + image.
function relationSiblingValue(field: FieldDef, record: any): any {
    if (!record) return undefined
    const candidates: string[] = []
    const ref = getFieldRef(field as ActionFieldDef)
    if (ref) candidates.push(ref)
    if (typeof field.key === 'string' && field.key.endsWith('_id')) candidates.push(field.key.slice(0, -3))
    for (const key of candidates) {
        const sib = record[key]
        if (sib === undefined || sib === null) continue
        if (typeof sib === 'string') {
            if (sib === '' || isNilUuid(sib)) continue
            return sib
        }
        if (typeof sib === 'object') return sib
    }
    return undefined
}

// fieldItemFields reads the declared jsonb line-items schema off a field,
// tolerating the snake_case `item_fields` alias the kernel serves.
function fieldItemFields(field: FieldDef): ItemField[] | undefined {
    return field.itemFields ?? field.item_fields
}

// isLineItemsField — a jsonb line-items column (e.g. Transfer.items): it either
// declares an `item_fields` schema, or its value is a structured array/object.
// These are action-built documents; field-by-field editing of the array is out
// of scope, so the edit dialog renders them read-only (the inline table) rather
// than an input that would stringify to "[object Object]". Scalars and known
// editable widgets (media/upload, color, dates) are NOT line-items.
export function isLineItemsField(field: FieldDef, value: any): boolean {
    if (field.type === 'image' || field.widget === 'upload') return false
    if (fieldItemFields(field)?.length) return true
    if (Array.isArray(value)) return true
    return (
        value !== null &&
        typeof value === 'object' &&
        !(value instanceof Date)
    )
}

// fkSeedOption builds the pre-resolved option for a FK select's CURRENT value
// from the relation sibling the backend injected alongside the column
// (`source_warehouse_id` → `source_warehouse = {value,label,image?}`, the key
// without `_id`; same convention as the jsonb refs). Lets the edit picker show
// the related record's NAME instead of the raw uuid without waiting for a
// network lookup. Returns null when there is no usable sibling (the picker then
// falls back to its existing typeahead/lookup behaviour).
export function fkSeedOption(field: FieldDef, value: any, record: any): ResolvedOption | null {
    if (value === undefined || value === null || value === '') return null
    const sib = relationSiblingValue(field, record)
    const label = typeof sib === 'string' ? sib : objectLabel(sib)
    if (!label) return null
    const id = String(value)
    return {
        id,
        value: id,
        label,
        name: label,
        image: pickImage(sib) ?? null,
    }
}

// servedOption matches a field's served option list (enum/select with
// {value,label,color,icon,image}) against the current value.
function servedOption(field: FieldDef, value: any): FieldOption | undefined {
    if (!field.options?.length) return undefined
    return field.options.find(o => o.value === String(value ?? ''))
}

// createdBySibling reads the resolver object the backend serves for the
// auto-injected `created_by` avatar column: {name, avatar, email}.
function createdBySibling(value: any, record: any): { name?: string; avatar?: string; email?: string } | undefined {
    const obj = (value && typeof value === 'object' ? value : undefined) ?? record?.created_by
    if (obj && typeof obj === 'object' && (obj.name || obj.avatar || obj.email)) return obj
    return undefined
}

// isRelationField — a field that resolves to another row (so view renders a lead
// + label and edit renders the searchable picker).
function isRelationField(field: FieldDef): boolean {
    return (
        field.type === 'search' ||
        field.type === 'dynamic_select' ||
        field.widget === 'dynamic_select' ||
        !!getFieldRef(field as ActionFieldDef) ||
        !!field.searchEndpoint
    )
}

function formatDisplayValue(rawValue: any, field: FieldDef): string {
    // Unset nullable FK serialized as the nil UUID renders as empty, not zeros.
    const value = normalizeNilUuid(rawValue)
    if (value === null || value === undefined || value === '') return '—'
    const objLabel = objectLabel(value)
    if (objLabel !== undefined) return objLabel
    if (field.type === 'boolean' || typeof value === 'boolean') return value ? 'Sí' : 'No'

    if (field.type === 'select' && field.options?.length) {
        const match = field.options.find(o => o.value === String(value))
        // Matched option label wins (localized); humanize the raw token only
        // when no declared option matches the value.
        return match?.label ?? humanizeToken(value)
    }

    // Structured value with no label — JSON beats "[object Object]".
    if (typeof value === 'object') return JSON.stringify(value)

    return String(value)
}

const MODE_CONFIG = {
    create: {
        getTitle: (meta: ModalMetadata, t: TFn) => {
            const name = localizedModelName(meta, t)
            return name ? `Crear ${name}` : (meta.createTitle || meta.title || 'Nuevo registro')
        },
        description: 'Completa los campos para crear un nuevo registro.',
        submitLabel: 'Crear',
        submittingLabel: 'Creando...',
        cancelLabel: 'Cancelar',
    },
    edit: {
        getTitle: (meta: ModalMetadata, t: TFn) => {
            const name = localizedModelName(meta, t)
            return name ? `Editar ${name}` : (meta.editTitle || meta.title || 'Editar registro')
        },
        description: 'Modifica los campos y guarda los cambios.',
        submitLabel: 'Guardar cambios',
        submittingLabel: 'Guardando...',
        cancelLabel: 'Cancelar',
    },
    view: {
        getTitle: (meta: ModalMetadata, t: TFn) => localizedModelName(meta, t) || meta.title || 'Ver registro',
        description: 'Información detallada del registro.',
        submitLabel: '',
        submittingLabel: '',
        cancelLabel: 'Cerrar',
    },
}

// Context threading host runtime values to nested field components (uploads,
// image leads, tz-aware dates) without prop-drilling through every renderer.
const ModelContext = createContext('')

// Money-key heuristic mirroring the backend's `inferDisplayCellStyle`: lets the
// dialog format obvious money fields as currency even when the backend hasn't
// stamped `cellStyle:'currency'` yet. Case-insensitive; matches a key that
// equals one of these, or ends with `_<m>`, or starts with `<m>_`.
const MONEY_KEY_HEURISTIC = ['price', 'amount', 'total', 'cost', 'subtotal', 'balance', 'paid']

// isMoneyField decides whether a field should render as currency. The explicit
// `cellStyle:'currency'` stamp always wins; otherwise a numeric value whose key
// matches the money heuristic qualifies (robustness fallback).
export function isMoneyField(field: FieldDef, value: any): boolean {
    if (field.cellStyle === 'currency') return true
    if (value === null || value === undefined || value === '') return false
    const num = typeof value === 'number' ? value : Number(value)
    if (isNaN(num)) return false
    const key = String(field.key || '').toLowerCase()
    if (!key) return false
    return MONEY_KEY_HEURISTIC.some(
        m => key === m || key.endsWith(`_${m}`) || key.startsWith(`${m}_`),
    )
}

// filterVisibleFields decides which declared fields render in the form for a
// given mode. `hidden` fields never render. A `readonly` (server/system-
// generated) field is EXCLUDED on create — the user can't set a value the
// server will overwrite — but stays visible on edit/view (rendered disabled).
export function filterVisibleFields(
    fields: FieldDef[] | undefined,
    mode: 'view' | 'edit' | 'create',
): FieldDef[] {
    return (fields ?? []).filter(f => {
        if (f.hidden) return false
        if (mode === 'create' && f.readonly) return false
        return true
    })
}

export function DynamicRecordDialog({
    open,
    onOpenChange,
    mode,
    model,
    recordId,
    endpoint,
    onSaved,
    onCreate,
    onUpdate,
    defaults,
    schema,
    onDelete,
    onEdit,
    onOpenFullPage,
    initialRecord,
    getImageUrl = identityImageUrl,
    timeZone,
    currency,
    onChange,
}: DynamicRecordDialogProps) {
    const api = useApi()
    const { t } = useTranslation()
    const [modalMeta, setModalMeta] = useState<ModalMetadata | null>(
        schema ? (schema as ModalMetadata) : null,
    )
    const [relations, setRelations] = useState<RelationMeta[]>([])
    const [record, setRecord] = useState<any | null>(null)
    const [formValues, setFormValues] = useState<Record<string, any>>({})
    const [loading, setLoading] = useState(false)
    const [saving, setSaving] = useState(false)
    const [deleting, setDeleting] = useState(false)

    const isCreate = mode === 'create'
    const isView = mode === 'view'
    const isEditable = mode === 'create' || mode === 'edit'
    const config = MODE_CONFIG[mode]

    // ── Fetch metadata + record when dialog opens ──────────────────────────
    useEffect(() => {
        if (!open) return
        if (!isCreate && !recordId) return

        let cancelled = false

        // Seed instantly from the row the table already has so view/edit render
        // without a spinner. The list row carries the pro siblings (resolved
        // relation, served options, image url) the table cells used.
        const seed = !isCreate && initialRecord ? initialRecord : null
        if (seed) setRecord(seed)

        const seedForm = (meta: ModalMetadata, rec: any) => {
            const initial: Record<string, any> = {}
            for (const field of meta.fields ?? []) {
                initial[field.key] = resolvePath(rec, field.key) ?? field.defaultValue ?? ''
            }
            setFormValues(initial)
        }

        // A field value is "missing" from the seed row when the list omitted that
        // column. Sibling pro fields aren't form fields, so we only check the
        // declared field keys.
        const seedIsComplete = (meta: ModalMetadata, rec: any) =>
            (meta.fields ?? []).every(f => {
                if (f.hidden) return true
                const v = resolvePath(rec, f.key)
                return v !== undefined
            })

        const load = async () => {
            // Only show the skeleton when we have nothing to render yet.
            if (!seed) setLoading(true)
            try {
                let meta: ModalMetadata | null = schema ? (schema as ModalMetadata) : null
                if (!meta) {
                    const metaRes = await api.get(`/metadata/modal/${model}`)
                    if (cancelled) return
                    meta = metaRes.data?.data ?? metaRes.data
                }
                setModalMeta(meta)

                if (isCreate) {
                    const initial: Record<string, any> = {}
                    for (const field of meta?.fields ?? []) {
                        initial[field.key] =
                            (defaults && Object.prototype.hasOwnProperty.call(defaults, field.key)
                                ? defaults[field.key]
                                : field.defaultValue) ?? ''
                    }
                    setFormValues(initial)
                    return
                }

                // Render immediately from the seed row.
                if (seed && meta) seedForm(meta, seed)

                // Only hit the record endpoint if the seed is absent or missing
                // some declared field — keeps the modal instant for full rows.
                if (!seed || (meta && !seedIsComplete(meta, seed))) {
                    const recordEndpoint = endpoint
                        ? `${endpoint}/${recordId}`
                        : `/dynamic/${model}/${recordId}`

                    const recRes = await api.get(recordEndpoint)
                    if (cancelled) return

                    const rec = recRes.data?.data ?? recRes.data
                    // Merge so the fetched record fills gaps without dropping the
                    // table's pro siblings (the detail endpoint may omit them).
                    const merged = seed ? { ...seed, ...rec } : rec
                    setRecord(merged)
                    if (meta) seedForm(meta, merged)
                }
            } catch (err) {
                console.error('[DynamicRecordDialog] load error:', err)
                if (!seed) toast.error(t('dynamic.load_error', { defaultValue: 'No se pudieron cargar los datos' }))
            } finally {
                if (!cancelled) setLoading(false)
            }
        }

        load()
        return () => { cancelled = true }
    // initialRecord intentionally omitted: the row identity is captured per open
    // via recordId; re-seeding mid-open would clobber edits.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open, recordId, model, endpoint, isCreate, schema])

    // Reset when closed
    useEffect(() => {
        if (!open) {
            setModalMeta(null)
            setRelations([])
            setRecord(null)
            setFormValues({})
        }
    }, [open])

    // Fetch the model's declared one_to_many/many_to_many edges so view AND edit
    // show child records (e.g. a sales order's line items) below the scalar
    // fields. The modal form is driven by MODAL metadata (fields); relations live
    // on TABLE metadata, hence the separate fetch. Skipped on create (no parent
    // record yet). View renders them read-only; edit lets the user add/edit/delete.
    useEffect(() => {
        if (!open || mode === 'create' || !recordId) {
            setRelations([])
            return
        }
        let cancelled = false
        api.get(`/metadata/table/${model}`)
            .then(res => {
                if (cancelled) return
                const meta = res.data?.data ?? res.data
                const rels: RelationMeta[] = Array.isArray(meta?.relations) ? meta.relations : []
                // Localize each panel header: the backend serves `label` as an
                // i18n key (addon bundle, loaded live) and the SDK renders it verbatim.
                setRelations(
                    rels.map(rel => ({
                        ...rel,
                        label:
                            rel.label && t(rel.label) !== rel.label
                                ? t(rel.label)
                                : rel.label || rel.name,
                    })),
                )
            })
            .catch(() => {
                if (!cancelled) setRelations([])
            })
        return () => { cancelled = true }
    }, [open, mode, model, recordId, api, t])

    // After a child relation mutation (add/edit/delete line item) the server
    // recomputes the parent's declarative rollups (sub_total, tax_amount, total).
    // Refetch the parent record so those fresh totals render in place — view mode
    // reads `record`; edit mode also reseeds the form so derived fields update.
    // Then bubble onChange so the host can refresh its own list/detail query.
    const handleChildChange = useCallback(async () => {
        if (!isCreate && recordId) {
            try {
                const recordEndpoint = endpoint
                    ? `${endpoint}/${recordId}`
                    : `/dynamic/${model}/${recordId}`
                const recRes = await api.get(recordEndpoint)
                const rec = recRes.data?.data ?? recRes.data
                if (rec) {
                    setRecord((prev: any) => (prev ? { ...prev, ...rec } : rec))
                    setFormValues(prev => {
                        const next = { ...prev }
                        for (const field of modalMeta?.fields ?? []) {
                            const v = resolvePath(rec, field.key)
                            if (v !== undefined) next[field.key] = v
                        }
                        return next
                    })
                }
            } catch (err) {
                console.error('[DynamicRecordDialog] parent refetch error:', err)
            }
        }
        onChange?.()
    }, [api, endpoint, model, recordId, isCreate, modalMeta, onChange])

    const handleSubmit = async (e?: React.FormEvent) => {
        e?.preventDefault()
        if (!modalMeta) return

        if (isEditable) {
            for (const field of modalMeta.fields ?? []) {
                if (field.required && !formValues[field.key] && formValues[field.key] !== 0 && formValues[field.key] !== false) {
                    toast.error(`El campo "${field.label}" es obligatorio`)
                    return
                }
            }
        }

        setSaving(true)
        try {
            if (isCreate && onCreate) {
                const created = await onCreate(formValues)
                toast.success(modalMeta?.messages?.created || t('dynamic.create_success', { defaultValue: 'Registro creado correctamente' }))
                onSaved?.(created ?? undefined)
                onOpenChange(false)
                return
            }

            if (!isCreate && recordId && onUpdate) {
                const updated = await onUpdate(String(recordId), formValues)
                toast.success(modalMeta?.messages?.updated || t('dynamic.update_success', { defaultValue: 'Guardado correctamente' }))
                onSaved?.(updated ?? undefined)
                onOpenChange(false)
                return
            }

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
                // Prefer the addon's localized message (modal metadata), then a
                // localized fallback. NOT res.data.message — the dynamic CRUD
                // endpoint returns a raw English string that would leak into the toast.
                toast.success(
                    modalMeta?.messages?.[isCreate ? 'created' : 'updated']
                        || (isCreate
                            ? t('dynamic.create_success', { defaultValue: 'Registro creado correctamente' })
                            : t('dynamic.update_success', { defaultValue: 'Guardado correctamente' })),
                )
                // Hand the persisted record back so callers can auto-select it.
                onSaved?.(res.data?.data ?? res.data ?? undefined)
                onOpenChange(false)
            } else {
                toast.error(res.data?.message || t('dynamic.save_error', { defaultValue: 'No se pudo guardar' }))
            }
        } catch (err: any) {
            toast.error(err?.response?.data?.message || t('dynamic.save_error', { defaultValue: 'No se pudo guardar' }))
        } finally {
            setSaving(false)
        }
    }

    const handleDelete = async () => {
        if (!onDelete) return
        setDeleting(true)
        try {
            await onDelete()
            onOpenChange(false)
        } catch (err: any) {
            console.error('[DynamicRecordDialog] delete error:', err)
            toast.error(err?.response?.data?.message || err?.message || t('dynamic.delete_error', { defaultValue: 'No se pudo eliminar el registro' }))
        } finally {
            setDeleting(false)
        }
    }

    const title = modalMeta ? config.getTitle(modalMeta, t) : ''

    const visibleFields = filterVisibleFields(modalMeta?.fields, mode)

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
                        <ImageUrlContext.Provider value={getImageUrl}>
                        <TimeZoneContext.Provider value={timeZone}>
                        <CurrencyContext.Provider value={currency}>
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

                            {/* Child records (line items, etc.) for declared relations.
                                View = strictly read-only; edit = add/edit/delete. */}
                            {!isCreate && record && relations.length > 0 && (
                                <div className="mt-6">
                                    <DynamicRelations
                                        record={record}
                                        relations={relations}
                                        canCreate={mode === 'edit'}
                                        canEdit={mode === 'edit'}
                                        canDelete={mode === 'edit'}
                                        onChange={handleChildChange}
                                    />
                                </div>
                            )}
                        </CurrencyContext.Provider>
                        </TimeZoneContext.Provider>
                        </ImageUrlContext.Provider>
                        </ModelContext.Provider>
                    ) : null}
                </div>

                <DialogFooter className="p-4 border-t shrink-0 sm:justify-between">
                    {isView && onOpenFullPage ? (
                        <Button
                            variant="ghost"
                            size="sm"
                            className="text-muted-foreground"
                            onClick={() => { onOpenChange(false); onOpenFullPage() }}
                        >
                            <ExternalLink className="mr-1.5 h-3.5 w-3.5" />
                            Ver página completa
                        </Button>
                    ) : <span />}
                    <div className="flex items-center gap-2">
                        <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving || deleting}>
                            {config.cancelLabel}
                        </Button>
                        {isView && onDelete && (
                            <Button
                                variant="destructive"
                                onClick={handleDelete}
                                disabled={deleting || loading}
                            >
                                {deleting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                                {deleting ? 'Eliminando...' : 'Eliminar'}
                            </Button>
                        )}
                        {isView && onEdit && (
                            <Button onClick={onEdit} disabled={deleting || loading}>
                                Editar
                            </Button>
                        )}
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
                    </div>
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
    // A `readonly` field is server/system-generated (e.g. the GitHub addon's
    // `number`/`github_url`, filled by the API after the outbound create). On
    // CREATE it is excluded from the form entirely (see `visibleFields`); on EDIT
    // it stays visible but is NOT editable — rendered as a disabled, muted input
    // so the user sees its value without being able to change it. View mode keeps
    // the rich read-only renderer.
    const isEditReadonly = mode === 'edit' && !!field.readonly

    return (
        <div className="flex flex-col gap-1.5">
            <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                {field.label}
                {field.required && mode !== 'view' && !isEditReadonly && (
                    <span className="text-destructive ml-0.5">*</span>
                )}
            </Label>

            {mode === 'view' ? (
                <ViewValue field={field} value={value} record={record} />
            ) : isEditReadonly ? (
                <ReadonlyEditField field={field} value={value} />
            ) : (
                <EditField field={field} value={value} onChange={onChange} record={record} />
            )}
        </div>
    )
}

// ReadonlyEditField — the edit-mode rendering of a `readonly` (system-generated)
// field: a disabled, muted input that shows the current value without allowing
// edits. Booleans render as a disabled switch to match their editable
// counterpart; everything else renders the formatted display value in a disabled
// text input.
export function ReadonlyEditField({ field, value }: { field: FieldDef; value: any }) {
    if (field.type === 'boolean' || typeof value === 'boolean') {
        return (
            <div className="flex items-center gap-2 py-1">
                <Switch checked={!!value} disabled />
                <span className="text-sm text-muted-foreground">{value ? 'Sí' : 'No'}</span>
            </div>
        )
    }
    const display = formatDisplayValue(value, field)
    return <Input value={display === '—' ? '' : display} disabled readOnly className="text-muted-foreground" />
}

// RelationViewValue — read-only FK lead. Resolves the relation's label + image
// from (1) the sibling object the table served, then (2) the canonical options
// endpoint, and renders an OptionLead (thumbnail / icon / color dot) + label.
function RelationViewValue({ field, value, record }: { field: FieldDef; value: any; record: any }) {
    const getImageUrl = useContext(ImageUrlContext)
    const sib = relationSiblingValue(field, record)
    const sibLabel = typeof sib === 'string' ? sib : objectLabel(sib)
    const sibImage = pickImage(sib)
    // The raw FK id, tolerating an inline resolved object as the value itself.
    const rawVal = value && typeof value === 'object' ? (value.value ?? value.id) : value
    const inlineLabel = sibLabel ?? objectLabel(value)
    const inlineImage = sibImage ?? pickImage(value)

    const fieldRef = getFieldRef(field as ActionFieldDef)
    // Only resolve over the network when we still lack both label and image and
    // there is something to look up.
    const needResolve = !inlineLabel && !inlineImage && !!(fieldRef || field.searchEndpoint) && rawVal != null && rawVal !== ''
    const { options } = useOptionsResolver({
        modelKey: '',
        fieldKey: 'id',
        ref: fieldRef,
        endpoint: fieldRef ? undefined : field.searchEndpoint,
        query: '',
        limit: 50,
        enabled: needResolve,
    })
    const resolved = options.find(o => String(o.id) === String(rawVal))

    const label =
        inlineLabel ??
        resolved?.label ??
        (rawVal != null && rawVal !== '' && !isNilUuid(rawVal) ? String(rawVal) : undefined)
    const image = inlineImage ?? resolved?.image ?? undefined

    if (!label && !image) {
        return <p className="text-sm py-1 text-muted-foreground">—</p>
    }

    const lead: Pick<ResolvedOption, 'image' | 'color' | 'icon'> = {
        image: image ? getImageUrl(image) : null,
        color: resolved?.color ?? null,
        icon: resolved?.icon ?? null,
    }

    return (
        <div className="flex items-center gap-2 py-1">
            <OptionLead option={lead} size={24} />
            <span className="text-sm">{label ?? '—'}</span>
        </div>
    )
}

export function ViewValue({
    field,
    value: rawValue,
    record,
    getImageUrl: getImageUrlProp,
    timeZone: timeZoneProp,
    currency: currencyProp,
}: {
    field: FieldDef
    value: any
    record: any
    /** Optional override; when omitted falls back to the nearest provider/identity. */
    getImageUrl?: GetImageUrl
    /** Optional override; when omitted falls back to the nearest provider. */
    timeZone?: string
    /** Optional override; when omitted falls back to the nearest provider. */
    currency?: string
}) {
    const { t, i18n } = useTranslation()
    const ctxImageUrl = useContext(ImageUrlContext)
    const ctxTimeZone = useContext(TimeZoneContext)
    const ctxCurrency = useContext(CurrencyContext)
    const getImageUrl = getImageUrlProp ?? ctxImageUrl
    const timeZone = timeZoneProp ?? ctxTimeZone
    const currency = currencyProp ?? ctxCurrency

    // Declarative display hint the backend stamps (mirrors the table column's
    // `cellStyle`). The table renders each cell off `cellStyle ?? type`; the
    // detail view keys off the SAME resolved renderer so both stay in lock-step
    // (a `datetime` display on a numeric column, a `url` display on a text
    // column, a `status`/`badge` pill, …).
    const renderAs = field.cellStyle ?? field.type

    // created_by / avatar resolver sibling → name (+ avatar) instead of "—".
    if (
        field.type === 'avatar' ||
        renderAs === 'avatar' ||
        renderAs === 'creator' ||
        renderAs === 'user' ||
        field.key === 'created_by' ||
        field.key === 'created_by_id'
    ) {
        const user = createdBySibling(rawValue, record)
        if (user) {
            return (
                <div className="flex items-center gap-2 py-1">
                    {user.avatar ? (
                        <img src={getImageUrl(String(user.avatar))} alt={user.name ?? ''} className="h-6 w-6 rounded-full object-cover" />
                    ) : null}
                    <span className="text-sm">{user.name ?? user.email ?? '—'}</span>
                </div>
            )
        }
        return <p className="text-sm py-1 text-muted-foreground">—</p>
    }

    // Nil/zero UUID (unset nullable FK serialized as all-zeros) → empty marker.
    if (isNilUuid(rawValue)) {
        return <p className="text-sm py-1 text-muted-foreground">—</p>
    }

    const value = normalizeNilUuid(rawValue)

    // Relation (search / dynamic_select / ref / any *_id) → resolved thumbnail +
    // label. The *_id catch-all covers plain-typed FK columns not tagged as a
    // relation field.
    if (isRelationField(field) || (typeof field.key === 'string' && field.key.endsWith('_id'))) {
        return <RelationViewValue field={field} value={value} record={record} />
    }

    // The value is itself a resolved object the backend served inline — render
    // its label/name, never the raw JSON.
    const inlineLabel = objectLabel(value)
    if (inlineLabel !== undefined) {
        return <p className="text-sm py-1">{inlineLabel}</p>
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
        if (isLucideIconName(value)) {
            return <IconNameViewValue name={value} />
        }
        return value ? (
            <img src={getImageUrl(String(value))} alt={field.label} className="h-16 w-16 rounded-lg object-cover border" />
        ) : (
            <p className="text-sm py-1 text-muted-foreground">Sin imagen</p>
        )
    }

    // Icon-name column served as plain text (the table infers cellStyle image,
    // but the detail/modal field keeps the storage type): render the glyph.
    if (
        isLucideIconName(value) &&
        typeof field.key === 'string' &&
        (field.key === 'icon' || field.key.endsWith('_icon'))
    ) {
        return <IconNameViewValue name={value} />
    }

    // URL/link display (matches the table's `url`/`link` cell). Triggers on the
    // stamped display type — not just the storage `type` — so a text column
    // carrying `cellStyle:'url'` (e.g. `github_url`) renders as a clickable
    // external link, opening in a new tab, truncated.
    if ((renderAs === 'url' || renderAs === 'link') && value) {
        const urlStr = String(value)
        const href = /^https?:\/\//i.test(urlStr) ? urlStr : `https://${urlStr}`
        return (
            <a
                href={href}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline"
            >
                <ExternalLink className="h-3.5 w-3.5 shrink-0" />
                <span className="truncate max-w-[360px]">{urlStr}</span>
            </a>
        )
    }

    // Money → org-currency string. Detected by the backend `cellStyle:'currency'`
    // stamp or a numeric value whose key matches the money heuristic (fallback
    // mirroring the table cell + backend `inferDisplayCellStyle`).
    if (isMoneyField(field, value)) {
        const num = typeof value === 'number' ? value : Number(value)
        if (!isNaN(num)) {
            const resolvedCurrency = field.styleConfig?.currency || currency || 'USD'
            const localeTag = i18n.language || 'es'
            const formatted = new Intl.NumberFormat(localeTag, {
                style: 'currency',
                currency: resolvedCurrency,
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
            }).format(num)
            return <p className="text-sm py-1 tabular-nums">{formatted}</p>
        }
    }

    // Date/datetime/timestamp → tz-aware format. `date` pins to UTC (calendar
    // day); instants render in the org timezone with a full-precision tooltip.
    // Keys off the display type (`cellStyle ?? type`) so a numeric/epoch column
    // stamped `datetime` (e.g. `synced_at`) formats as a date, never raw digits.
    if (
        renderAs === 'date' ||
        renderAs === 'datetime' ||
        renderAs === 'timestamp' ||
        renderAs === 'timestamptz'
    ) {
        const dateRenderAs = renderAs === 'date' ? 'date' : renderAs
        const formatted = formatDateCell(value, dateRenderAs, es, timeZone)
        if (formatted) {
            return (
                <p className="text-sm py-1" title={formatted.title}>
                    {formatted.display}
                </p>
            )
        }
        return <p className="text-sm py-1 text-muted-foreground">—</p>
    }

    // Enum/option field with served options → the SAME colored/iconed pill the
    // table renders (shared `OptionBadge`): resolved color, thumbnail/icon and
    // the localized option label (e.g. "Almacenable" instead of "storable").
    const opt = servedOption(field, value)
    if (opt) {
        return (
            <div className="py-1">
                <OptionBadge
                    option={{
                        value: String(opt.value ?? value ?? ''),
                        label: opt.label,
                        color: opt.color ?? undefined,
                        icon: opt.icon ?? undefined,
                        image: opt.image ?? undefined,
                    }}
                    getImageUrl={getImageUrl}
                />
            </div>
        )
    }

    // Array of scalars / label objects (e.g. github `labels`, tags, a
    // group-badge list) → a row of pills, mirroring the table's `tags` /
    // `relation-badge-list` cells. Checked before the structured-object branch
    // so a flat label array never renders as a mini-table.
    if (
        Array.isArray(value) &&
        (renderAs === 'tags' ||
            renderAs === 'relation-badge-list' ||
            value.every((v) => v === null || typeof v !== 'object' || 'label' in v || 'name' in v))
    ) {
        return <BadgeListViewValue items={value} getImageUrl={getImageUrl} />
    }

    // Status / badge / select display with no served option list — a bare enum
    // token (e.g. a kanban `stage` like "backlog"). Render a colored pill with a
    // semantic/value-derived color and a localized-or-humanized label, matching
    // the table's `status`/`badge` cells.
    if (
        (renderAs === 'status' ||
            renderAs === 'badge' ||
            renderAs === 'select' ||
            renderAs === 'option') &&
        value !== null &&
        value !== undefined &&
        typeof value !== 'object'
    ) {
        return <StatusBadgeViewValue field={field} value={value} t={t} />
    }

    // Structured value (jsonb column, e.g. fiscal_data) with no label/name/title
    // to surface — render readable key/value pairs instead of falling through to
    // String(value) ("[object Object]").
    if (value !== null && typeof value === 'object') {
        return (
            <StructuredViewValue
                value={value}
                field={field}
                locale={i18n.language}
                t={t}
            />
        )
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

// IconNameViewValue — read view for a column whose value is a lucide icon name
// (an addon's `icon` column): the glyph plus the name, so the value stays
// copyable/recognizable next to its rendering.
function IconNameViewValue({ name }: { name: string }) {
    return (
        <div className="flex items-center gap-2 py-1">
            <div className="h-8 w-8 flex items-center justify-center rounded bg-muted">
                <DynamicIcon name={name} className="h-4 w-4" />
            </div>
            <span className="text-sm text-muted-foreground">{name}</span>
        </div>
    )
}

// StatusBadgeViewValue — a bare enum/status token (no served option list) as a
// colored pill: a semantic/value-derived color (same `statusColorFor` the table
// uses) plus a localized-or-humanized label. Mirrors the table's `status`/
// `badge` cell so a kanban `stage` ("backlog") reads as a colored, translated
// badge instead of the raw token.
function StatusBadgeViewValue({
    field,
    value,
    t,
}: {
    field: FieldDef
    value: any
    t: (key: string, options?: any) => string
}) {
    const isDark = useIsDarkTheme()
    const token = String(value)
    // Prefer an explicit per-option color served on the field (metadata.stages /
    // options), else derive a semantic color from the token.
    const declared = field.options?.find((o) => String(o.value) === token)
    const color = declared?.color || statusColorFor(token)
    // Localized label: the option's already-localized label wins, then a manifest
    // i18n key matching the raw token, then a humanized fallback.
    const label =
        declared?.label ?? t(token, { defaultValue: humanizeToken(token) })
    return (
        <div className="py-1">
            <Badge
                variant="outline"
                className="border-0 flex w-fit items-center gap-1"
                style={generateBadgeStyles(color, { isDark })}
            >
                {label}
            </Badge>
        </div>
    )
}

// BadgeListViewValue — an array of scalars / label objects as a row of pills
// (github `labels`, tags, a group-badge list). Objects carrying a `color` render
// as colored `OptionBadge`s; plain strings render as neutral secondary pills.
function BadgeListViewValue({
    items,
    getImageUrl,
}: {
    items: any[]
    getImageUrl: GetImageUrl
}) {
    if (!items || items.length === 0) {
        return <p className="text-sm py-1 text-muted-foreground">—</p>
    }
    return (
        <div className="flex flex-wrap gap-1 py-1">
            {items.map((item, i) => {
                if (item !== null && typeof item === 'object') {
                    const opt: DisplayOption = {
                        value: String(item.value ?? item.id ?? item.name ?? item.label ?? i),
                        label: String(item.label ?? item.name ?? item.value ?? ''),
                        color: item.color ?? undefined,
                        icon: item.icon ?? undefined,
                        image: item.image ?? item.avatar ?? undefined,
                    }
                    return <OptionBadge key={i} option={opt} getImageUrl={getImageUrl} />
                }
                return (
                    <Badge key={i} variant="secondary" className="w-fit">
                        {String(item)}
                    </Badge>
                )
            })}
        </div>
    )
}

// StructuredViewValue renders a jsonb object/array that has no resolvable label.
// It delegates to the shared `CollectionCell` in `'inline'` mode so the detail
// view gets the SAME pro rendering as the table: a declared `item_fields` schema
// drives localized headers + resolved ref labels (the injected `{value,label}`
// sibling) for line-items; without a schema it falls back to a localized
// key→value pair list / mini-table — never raw `JSON.stringify`. Empty arrays /
// empty objects keep the "—" marker (CollectionCell renders a muted dash, which
// we normalize to the em-dash the detail view uses elsewhere).
function StructuredViewValue({
    value,
    field,
    locale,
    t,
}: {
    value: any
    field?: FieldDef
    locale?: string
    t?: (key: string, options?: any) => string
}) {
    const getImageUrl = useContext(ImageUrlContext)
    const isEmpty =
        value === null ||
        value === undefined ||
        value === '' ||
        (Array.isArray(value) && value.length === 0) ||
        (typeof value === 'object' &&
            !Array.isArray(value) &&
            Object.keys(value).length === 0)
    if (isEmpty) {
        return <p className="text-sm py-1 text-muted-foreground">—</p>
    }
    return (
        <div className="text-sm py-1">
            <CollectionCell
                value={value}
                itemFields={field?.itemFields ?? field?.item_fields}
                variant="inline"
                locale={locale}
                t={t}
                getImageUrl={getImageUrl}
            />
        </div>
    )
}

export function EditField({ field, value, onChange, record }: {
    field: FieldDef
    value: any
    onChange: (val: any) => void
    /** The full record being edited — supplies FK relation siblings + line-items. */
    record?: any
}) {
    const { t, i18n } = useTranslation()
    const editFieldImageUrl = useContext(ImageUrlContext)

    // Jsonb line-items columns (e.g. Transfer.items) are action-built documents:
    // editing the array field-by-field is out of scope. Render them READ-ONLY
    // with the same inline table the detail view uses — a localized, ref-resolved
    // mini-table — instead of an input that stringifies to "[object Object]".
    if (isLineItemsField(field, value)) {
        return (
            <div className="space-y-1">
                <div className="rounded-md border bg-muted/30 p-2">
                    <CollectionCell
                        value={value}
                        itemFields={fieldItemFields(field)}
                        variant="inline"
                        locale={i18n.language}
                        t={t}
                        getImageUrl={editFieldImageUrl}
                    />
                </div>
                <p className="text-[11px] text-muted-foreground">
                    {t('datatable.readOnly', { defaultValue: 'Solo lectura' })}
                </p>
            </div>
        )
    }

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

    // Media widgets: the kernel may serve an explicit `widget: 'upload'` (or the
    // `image` type) for a file/photo column.
    if (field.type === 'image' || field.widget === 'upload') {
        return <ImageUploadField field={field} value={value} onChange={onChange} />
    }

    // FK columns: a `ref` (kernel-derived belongs_to target) or an explicit
    // `widget: 'dynamic_select'` renders the SDK's async searchable picker — with
    // option thumbnails and the inline-create "+" — against /api/options/<ref>.
    // Static inline `options` are handled by the enum <Select> branch below.
    if ((getFieldRef(field as ActionFieldDef) || field.widget === 'dynamic_select') && !field.options?.length) {
        return (
            <DynamicSelectField
                field={field as ActionFieldDef}
                value={value}
                onChange={onChange}
                // Seed the trigger with the related record's NAME (from the
                // backend-injected FK sibling, key without `_id`) so an existing
                // selection shows the label, not the raw uuid — without waiting
                // for the popover to open and fetch a page.
                seedOption={fkSeedOption(field, value, record)}
            />
        )
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
                <SelectTrigger className="w-full">
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

    if (field.type === 'date' || field.type === 'datetime' || field.type === 'timestamp' || field.type === 'timestamptz') {
        const dateValue = value ? (typeof value === 'string' ? parseISO(value) : new Date(value)) : undefined
        // Treat the Go zero-time (0001-01-01) as empty so an unset date shows the
        // placeholder instead of "31 de diciembre de 1".
        const validDate =
            dateValue && !isNaN(dateValue.getTime()) && dateValue.getFullYear() > 1
                ? dateValue
                : undefined

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
    const { t } = useTranslation()
    const api = useApi()
    const model = useContext(ModelContext)
    const getImageUrl = useContext(ImageUrlContext)
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
            toast.error(t('dynamic.image_upload_error', { defaultValue: 'No se pudo subir la imagen' }))
        } finally {
            setUploading(false)
            if (inputRef.current) inputRef.current.value = ''
        }
    }

    return (
        <div className="flex items-center gap-3">
            {value ? (
                <div className="relative">
                    <img src={getImageUrl(String(value))} alt="" className="h-16 w-16 rounded-lg object-cover border" />
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
    }, [value, field.searchEndpoint, api])

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
    }, [query, open, field.searchEndpoint, api])

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
                                                <OptionThumb image={item.image} size={20} />
                                            )}
                                            <div className="flex flex-col min-w-0 ml-2">
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
