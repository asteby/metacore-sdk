// DocumentEditor — alta de un documento comercial en UNA pantalla por
// secciones: factura, NC, cobro/REP, cotización, OC… Sustituye al wizard
// «Datos → Siguiente → Renglones» de DocumentFormDialog cuando el tipo declara
// `layout: "editor"` en `document_forms` (lo sirve el kernel ≥ v0.190.0).
//
//   Contraparte + lo esencial      (PartyCard: datos clave y crédito)
//   Cargar desde…                  (sources: el renglón/encabezado se precarga)
//   Renglones | Reparto del pago   (DocumentLinesGrid con catálogo | PaymentAllocator)
//   Totales
//   ▸ Opciones fiscales            (plegada: extensiones fiscal_data.*, catálogos
//                                   con default y contribuciones header.fields)
//   Secciones de otros addons      (body.sections / side.panels)
//   ▸ Vista previa                 (plegada; acción `preview` con analyze: true)
//   [Cancelar]            [Acción primaria única]
//
// Pensado para quien hace varios roles: a la vista solo lo que hay que decidir;
// lo fiscal trae defaults (de la contraparte y del manifest) y se revisa solo si
// hace falta. Genérico y sin país: fiscal_mexico aporta sus campos como
// extensiones o contribuciones; otra localización hace lo mismo.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '@asteby/metacore-ui/primitives'
import { Loader2, ReceiptText } from 'lucide-react'
import { toast } from 'sonner'
import { useApi } from '../api-context'
import { useOrgTaxRate, useTimeZone } from '../org-runtime-context'
import { FieldCell, FieldGrid, FieldLabel } from '../field-grid'
import { FormErrorBanner } from './feedback'
import { DocumentLinesGrid, type DocumentLinesGridProps, type LineItemsColumn } from './line-items-editor'
import { computeTotals, serializeLineItems, taxBreakdown, type LineItem } from './line-items'
import { roundMoney, toAmount, useFormatter } from './format'
import { catalogRecordToProduct, createCatalogProductSearch } from './catalog-product-search'
import { withOptionDisplays } from './product-display'
import type { ProductResult } from './product-search'
import { requestRecordCreate, requestRecordEdit, withSearchPrefill } from '../record-picker-actions'
import {
    allocationAmountField,
    allocationIssueMessages,
    allocationPayload,
    creditStatus,
    editorLinesConfig,
    fieldDisplayMeta,
    type FieldDisplayMeta,
    linesFromSource,
    localIssues,
    sourceLoadSummary,
    sourceTracksRemaining,
    partyDefaults,
    partySummaryRows,
    recordLabel,
    seedRecord,
    sourceHeaderSeeds,
    splitEditorFields,
    toOpenDocuments,
    friendlyOptionLabel,
    gatedOptionFixes,
    gatedOptions,
    withFriendlyOptions,
    type EditorIssue,
    type SeedLabel,
} from './document-editor-model'
import {
    CollapsibleSection,
    DraftPreview,
    EditorSection,
    PartyCard,
    PreviewPanel,
    TotalsPanel,
    ValidationChecklist,
    type PreviewContent,
    type TotalsRow,
} from './document-editor-panels'
import { PaymentAllocator, type PaymentAllocatorValue } from './payment-allocator'
import { actionErrorBannerMessage, buildFieldDefaults, prefillFromFieldRelationRequest, renderField } from '../action-modal-dispatcher'
import { extractFieldErrors, localizeFieldErrorMap } from '../server-error'
import { validateValues, bagHasErrors } from '../validator'
import { clearFieldErrorTree } from '../field-validation-ui'
import { emitRecordMutation } from '../record-mutation-events'
import { evaluateVisibleWhen, getVisibleWhen } from '../dynamic-form-schema'
import { useInstalledAddons } from '../installed-addons-context'
import { allocatePayment, validateAllocation, type OpenDocument } from '../primitives/allocation'
import { useDocumentContributions } from '../primitives/use-contributions'
import type { DocumentContributionProps, DocumentEditorContext } from '../primitives/contributions'
import type { ActionFieldDef, DocumentFormSource, DocumentFormType, DocumentFormsManifest } from '../types'

export interface DocumentEditorProps {
    model: string
    /** Endpoint de alta del modelo. Default `/dynamic/<model>`. */
    endpoint?: string
    forms: DocumentFormsManifest
    type: DocumentFormType
    /** Registro desde el que se abrió (acción de fila): siembra `default_from_record`. */
    record?: Record<string, any>
    /** Documento origen a precargar al abrir (`sources[].key` + id). */
    initialSource?: { key: string; id: string }
    onSaved?: (record?: unknown) => void
    onCancel: () => void
    searchProducts?: DocumentLinesGridProps['search']
    /**
     * Modelo de catálogo: buscador por defecto y alta/edición del producto
     * desde la celda del renglón. Default `products.Product`.
     */
    productModel?: string
    /** Columna del modelo de catálogo que recibe lo buscado al crear. Default `name`. */
    productLabelField?: string
    defaultTaxRate?: number
    currency?: string
    /** Hoy (días de atraso del reparto; inyectable en tests). */
    today?: Date
    /**
     * Pantalla completa (DocumentFormDialog la pide para documentos con
     * renglones): a dos columnas en pantallas anchas, con totales, revisión y
     * vista previa a la derecha; en una sola columna en móvil.
     */
    fullscreen?: boolean
}

type Busy = 'save' | 'preview' | 'source' | null

export function DocumentEditor({
    model,
    endpoint,
    forms,
    type,
    record,
    initialSource,
    onSaved,
    onCancel,
    searchProducts,
    productModel,
    productLabelField = 'name',
    defaultTaxRate,
    currency,
    today,
    fullscreen = false,
}: DocumentEditorProps) {
    const { t, i18n } = useTranslation()
    const lang = i18n?.language
    const api = useApi()
    const fmt = useFormatter({ currency })
    const installed = useInstalledAddons()
    const orgTaxRate = useOrgTaxRate()
    const orgTimeZone = useTimeZone()
    const tl = useCallback((s: string) => t(s, { defaultValue: s }), [t])

    const lineCfg = useMemo(() => editorLinesConfig(type, forms), [type, forms])
    const kind = lineCfg?.kind ?? 'sale'
    const isAllocation = kind === 'allocation' && !!lineCfg?.open_documents
    const amountKey = isAllocation ? allocationAmountField(type.fields) : undefined

    const [header, setHeader] = useState<Record<string, any>>(() => ({
        ...buildFieldDefaults(type.fields, record, undefined, { timeZone: orgTimeZone, now: today }),
        ...(type.defaults ?? {}),
    }))
    const [lines, setLines] = useState<LineItem[]>([])
    const [linesFromSourceDoc, setLinesFromSourceDoc] = useState(false)
    const [extFields, setExtFields] = useState<ActionFieldDef[]>([])
    const [party, setParty] = useState<Record<string, any> | null>(null)
    const [partyFieldLists, setPartyFieldLists] = useState<unknown[][]>([])
    const [catalogMeta, setCatalogMeta] = useState<Record<string, FieldDisplayMeta> | null>(null)
    // Etiquetas de los selectores que el editor llena por código (contraparte y
    // documento origen de «Cargar desde…»): sin ellas el selector cerrado pinta el UUID.
    const [seeds, setSeeds] = useState<Record<string, SeedLabel>>({})
    const [openDocs, setOpenDocs] = useState<OpenDocument[]>([])
    const [docsLoading, setDocsLoading] = useState(false)
    const [alloc, setAlloc] = useState<PaymentAllocatorValue>({ strategy: 'oldest_due_first', manual: {} })
    const [draftId, setDraftId] = useState<string | null>(null)
    const [serverIssues, setServerIssues] = useState<EditorIssue[]>([])
    const [contributed, setContributed] = useState<Record<string, EditorIssue>>({})
    const [preview, setPreview] = useState<PreviewContent | null>(null)
    const [previewOpen, setPreviewOpen] = useState(false)
    const [advancedOpen, setAdvancedOpen] = useState(false)
    const [busy, setBusy] = useState<Busy>(null)
    const [formError, setFormError] = useState<string | undefined>()
    const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
    const [attempted, setAttempted] = useState(false)
    const [sourceKey, setSourceKey] = useState<string>(initialSource?.key ?? '')
    const [sourceId, setSourceId] = useState<string>(initialSource?.id ?? '')
    // Fuente de la que salieron los renglones: su `line_link_field` viaja en cada
    // renglón para que el servidor descuente lo ya facturado/devuelto y valide.
    const [loadedSource, setLoadedSource] = useState<DocumentFormSource | null>(null)
    const [sourceNote, setSourceNote] = useState<string | undefined>()
    const [sourceSeed, setSourceSeed] = useState<SeedLabel | null>(null)
    const relCache = useRef(new Map<string, Promise<any[]>>())

    const taxRate = defaultTaxRate ?? orgTaxRate
    // The header's warehouse (when the document type declares one) scopes the
    // stock the catalog's option_display shows in the product rows.
    const headerWarehouse = typeof header.warehouse_id === 'string' ? header.warehouse_id : ''
    const search = useMemo(
        () =>
            withOptionDisplays(
                searchProducts ?? createCatalogProductSearch(api, { model: productModel, defaultTaxRate: taxRate }),
                api,
                { model: productModel ?? 'products.Product', context: { warehouse_id: headerWarehouse } },
            ),
        [searchProducts, api, productModel, taxRate, headerWarehouse],
    )

    const isInstalled = useCallback((k?: string) => !k || !installed || installed.addons.has(k), [installed])
    const sources = useMemo(() => (type.sources ?? []).filter((s) => isInstalled(s.requires_addon)), [type.sources, isInstalled])
    const previewEnabled = !!type.preview && !type.submit_action && isInstalled(type.preview.requires_addon)

    // Campos de extensión del modelo (fiscal_data.* que declaran otros addons): van plegados.
    useEffect(() => {
        let cancelled = false
        api.get(`/metadata/modal/${model}`)
            .then((res: any) => {
                const fields: any[] = res?.data?.data?.fields ?? res?.data?.fields ?? []
                const declared = new Set(type.fields.map((f) => f.key))
                const ext = fields.filter(
                    (f) => typeof f?.key === 'string' && f.key.startsWith('fiscal_data.') && !declared.has(f.key) && !f.readonly && !f.readOnly,
                )
                if (!cancelled) setExtFields(ext as ActionFieldDef[])
            })
            .catch(() => {})
        return () => {
            cancelled = true
        }
    }, [api, model, type.fields])

    const groups = useMemo(
        () =>
            splitEditorFields(type.fields, {
                partyField: type.party?.field,
                essentialKeys: [amountKey, ...sources.map((s) => s.link_field)].filter((k): k is string => !!k),
                extensionFields: extFields,
            }),
        [type.fields, type.party?.field, amountKey, sources, extFields],
    )
    const visible = useCallback((f: ActionFieldDef) => evaluateVisibleWhen(getVisibleWhen(f), header), [header])
    const allFields = useMemo(
        () => [...(groups.party ? [groups.party] : []), ...groups.essential, ...groups.advanced, ...groups.notes],
        [groups],
    )

    const fieldKeys = useRef<string[]>([])
    fieldKeys.current = allFields.map((f) => f.key)

    // Opciones condicionadas (`options[].when`): al cambiar el campo del que
    // dependen —a mano, por la contraparte o por «Cargar desde…»— el valor que
    // dejó de aplicar se ajusta solo (método PPD → forma de pago 99) y viaja así
    // en el alta, no solo en el diálogo de timbrado.
    useEffect(() => {
        const fixes = gatedOptionFixes(allFields, header)
        if (Object.keys(fixes).length > 0) setHeader((h) => ({ ...h, ...gatedOptionFixes(allFields, h) }))
    }, [allFields, header])

    // Contraparte: tarjeta + defaults de las extensiones con la misma clave.
    const partyId = type.party ? header[type.party.field] : undefined
    useEffect(() => {
        if (!type.party || !partyId) {
            setParty(null)
            return
        }
        let cancelled = false
        const ep = type.party.endpoint ?? `/data/${type.party.model}`
        api.get(ep, { params: { f_id: `eq:${partyId}`, per_page: 1 } })
            .then((res: any) => {
                const rows = res?.data?.data ?? []
                const rec = Array.isArray(rows) ? rows[0] ?? null : rows ?? null
                if (cancelled) return
                setParty(rec)
                setHeader((h) => ({ ...h, ...partyDefaults(rec, fieldKeys.current, h) }))
                const label = recordLabel(rec, 'name') ?? recordLabel(rec, 'legal_name')
                if (label && type.party) {
                    const key = type.party.field
                    setSeeds((s) => ({ ...s, [key]: { value: String(partyId), label } }))
                }
            })
            .catch(() => !cancelled && setParty(null))
        return () => {
            cancelled = true
        }
    }, [api, type.party, partyId])

    // Etiquetas de la tarjeta (RFC, régimen…) y texto de sus catálogos: la
    // metadata del modelo de la contraparte (formulario, con extensiones, y
    // tabla); sin ellas se veía la columna cruda (`tax_id`).
    const partyModel = type.party?.model
    useEffect(() => {
        if (!partyModel) return
        let cancelled = false
        void loadModelFieldLists(api, partyModel).then((lists) => {
            if (!cancelled) setPartyFieldLists(lists)
        })
        return () => {
            cancelled = true
        }
    }, [api, partyModel])

    // Modelo de catálogo del renglón: alta/edición desde la celda y etiquetas
    // de sus catálogos (unidad «unit» → «Pieza»).
    const catalogModel = productModel ?? 'products.Product'
    // Perezoso: solo cuando ya hay un renglón con producto (no compite con la
    // carga inicial del editor).
    const hasCatalogLine = lines.some((l) => l.kind === 'item' && !!l.product_id)
    const wantsCatalogMeta = !!lineCfg && !isAllocation && hasCatalogLine
    useEffect(() => {
        if (!wantsCatalogMeta) return
        let cancelled = false
        void loadModelFieldLists(api, catalogModel).then((lists) => {
            if (!cancelled) setCatalogMeta(fieldDisplayMeta(lists, tl))
        })
        return () => {
            cancelled = true
        }
    }, [api, catalogModel, tl, wantsCatalogMeta])

    /** Lee el producto guardado con la misma proyección del buscador (catalogRecordToProduct). */
    const loadCatalogProduct = useCallback(
        async (id: string, saved?: Record<string, any>): Promise<ProductResult | null> => {
            try {
                const res: any = await api.get(`/data/${catalogModel}`, { params: { f_id: `eq:${id}`, per_page: 1 } })
                const rows = res?.data?.data
                const row = Array.isArray(rows) ? rows[0] : null
                if (row) return catalogRecordToProduct({ ...(saved ?? {}), ...row }, taxRate)
            } catch {
                // Sin lectura, lo que devolvió el guardado.
            }
            return saved && saved.id != null ? catalogRecordToProduct(saved, taxRate) : null
        },
        [api, catalogModel, taxRate],
    )
    const createProduct = useCallback(
        (query: string) =>
            new Promise<ProductResult | null>((resolve) => {
                requestRecordCreate({
                    model: catalogModel,
                    defaults: withSearchPrefill(query, productLabelField),
                    onCreated: (rec: any) => {
                        if (rec?.id == null) return resolve(null)
                        void loadCatalogProduct(String(rec.id), rec).then(resolve)
                    },
                })
            }),
        [catalogModel, productLabelField, loadCatalogProduct],
    )
    const editProduct = useCallback(
        (line: LineItem) =>
            new Promise<ProductResult | null>((resolve) => {
                const id = line.catalog?.product_ref ?? line.product_id
                if (!id) return resolve(null)
                requestRecordEdit({
                    model: catalogModel,
                    recordId: id,
                    onSaved: (rec: any) => void loadCatalogProduct(id, rec && typeof rec === 'object' ? { id, ...rec } : undefined).then(resolve),
                })
            }),
        [catalogModel, loadCatalogProduct],
    )
    /** Unidad visible: la opción del catálogo; sin opciones declaradas, el valor tal cual. */
    const unitLabel = useCallback(
        (u: string) => {
            if (!catalogMeta) return undefined
            const opts = catalogMeta.unit_of_measure?.options ?? catalogMeta.unit?.options
            if (!opts) return u
            const o = opts.find((x) => String(x.value) === u)
            return typeof o?.label === 'string' && o.label && o.label !== u ? o.label : undefined
        },
        [catalogMeta],
    )

    // Cobro: documentos abiertos de la contraparte.
    const openCfg = lineCfg?.open_documents
    const allocPartyId = openCfg ? header[openCfg.party_field] ?? partyId : undefined
    useEffect(() => {
        if (!isAllocation || !openCfg || !allocPartyId) {
            setOpenDocs([])
            return
        }
        let cancelled = false
        setDocsLoading(true)
        api.get(`/data/${openCfg.model}`, { params: { [`f_${openCfg.party_field}`]: `eq:${allocPartyId}`, per_page: 200 } })
            .then((res: any) => {
                if (!cancelled) setOpenDocs(toOpenDocuments(res?.data?.data, openCfg, fmt.currency))
            })
            .catch(() => !cancelled && setOpenDocs([]))
            .finally(() => !cancelled && setDocsLoading(false))
        return () => {
            cancelled = true
        }
    }, [api, isAllocation, openCfg, allocPartyId, fmt.currency])

    const amount = amountKey ? toAmount(header[amountKey]) : 0
    const allocation = useMemo(() => allocatePayment(amount, openDocs, alloc.strategy, alloc.manual), [amount, openDocs, alloc])
    const openBalance = useMemo(() => roundMoney(openDocs.reduce((s, d) => s + d.balance, 0)), [openDocs])

    const totals = useMemo(() => computeTotals(lines), [lines])
    const taxes = useMemo(() => taxBreakdown(lines), [lines])
    const documentTotal = isAllocation ? amount : totals.total
    const credit = useMemo(
        () => (isAllocation ? null : creditStatus(party, type.party?.credit, documentTotal)),
        [isAllocation, party, type.party?.credit, documentTotal],
    )

    const issues = useMemo<EditorIssue[]>(() => {
        const out: EditorIssue[] = []
        if (isAllocation && openCfg) {
            const found = validateAllocation(amount, fmt.currency, openDocs, allocation.allocations, { allowUnapplied: true })
            out.push(...allocationIssueMessages(found, openDocs))
        } else if (lineCfg) {
            out.push(...localIssues(lines, { requireLines: lineCfg.required ?? true }))
        }
        if (credit?.level === 'block') {
            out.push({
                field: type.party?.field,
                severity: 'error',
                message: credit.holdReason
                    ? `${t('documentEditor.credit_hold', { defaultValue: 'Crédito retenido' })}: ${credit.holdReason}`
                    : t('documentEditor.credit_exceeded', { defaultValue: 'El total supera el crédito disponible.' }),
            })
        }
        out.push(...Object.values(contributed), ...serverIssues)
        return out
    }, [isAllocation, openCfg, amount, fmt.currency, openDocs, allocation, lineCfg, lines, credit, type.party?.field, contributed, serverIssues, t])
    const blocking = issues.some((i) => i.severity === 'error')
    const shownIssues = attempted ? issues : issues.filter((i) => i.severity === 'warning')

    const payload = useCallback(() => {
        const p: Record<string, unknown> = { ...(type.defaults ?? {}), ...header }
        if (forms.type_field && !type.submit_action) p[forms.type_field] = type.value ?? type.key
        if (lineCfg) {
            p[lineCfg.field] =
                isAllocation && openCfg
                    ? allocationPayload(allocation.allocations, openCfg)
                    : serializeLineItems(lines, { sourceLineField: loadedSource?.line_link_field })
        }
        return p
    }, [type, header, forms.type_field, lineCfg, isAllocation, openCfg, allocation, lines, loadedSource])

    const baseUrl = type.endpoint ?? endpoint ?? `/dynamic/${model}`

    /** Crea o actualiza el BORRADOR (idempotente por draftId). La vista previa lo necesita. */
    const saveDraft = useCallback(async (): Promise<Record<string, any>> => {
        const res = draftId ? await api.put(`${baseUrl}/${draftId}`, payload()) : await api.post(baseUrl, payload())
        if (res.data?.success === false) throw { response: { data: res.data } }
        const rec = (res.data?.data ?? res.data ?? {}) as Record<string, any>
        const id = draftId ?? (rec.id != null ? String(rec.id) : null)
        if (id) setDraftId(id)
        emitRecordMutation(model, draftId ? 'update' : 'create')
        return { ...rec, id: id ?? rec.id }
    }, [api, baseUrl, draftId, model, payload])

    const handleError = (err: unknown) => {
        setFormError(actionErrorBannerMessage(err, allFields, t, lang))
        const map = extractFieldErrors(err)
        if (map) {
            const labels: Record<string, string> = {}
            for (const f of allFields) labels[f.key] = tl(f.label)
            const localized = localizeFieldErrorMap(map, t, { labels, language: lang })
            setFieldErrors(localized)
            if (groups.advanced.some((f) => localized[f.key])) setAdvancedOpen(true)
        }
    }

    // ---- Cargar desde… --------------------------------------------------------
    /**
     * Renglones del origen. Con lo pendiente declarado (`line_link_field`,
     * `remaining_qty_field` o `remaining_endpoint`) los sirve el host ya con
     * `remaining_quantity` (cantidad − lo ya facturado/devuelto, calculado en el
     * servidor); si el host aún no tiene `source-lines` (404) o la fuente no lo
     * declara, se leen de la relación como antes.
     */
    const fetchSourceRows = useCallback(
        async (src: DocumentFormSource, id: string): Promise<unknown[]> => {
            if (src.remaining_endpoint) {
                const res = await api.get(src.remaining_endpoint, { params: { id } })
                return res?.data?.data ?? []
            }
            if (sourceTracksRemaining(src)) {
                try {
                    const res = await api.get(`${baseUrl}/source-lines`, {
                        params: { source: src.key, id, ...(draftId ? { exclude: draftId } : {}) },
                    })
                    return res?.data?.data ?? []
                } catch {
                    // Un host sin `source-lines` (404, o la ruta del registro
                    // contestando 400/500 a «source-lines» como id) o un origen que
                    // el host aún no sabe calcular: se precarga de la relación y el
                    // guardado del servidor sigue validando lo pendiente.
                }
            }
            let rels = relCache.current.get(src.model)
            if (!rels) {
                rels = api
                    .get(`/metadata/table/${src.model}`)
                    .then((r: any) => r?.data?.data?.relations ?? r?.data?.relations ?? [])
                relCache.current.set(src.model, rels)
            }
            const call = prefillFromFieldRelationRequest(
                { fieldKey: lineCfg?.field ?? 'lines', refModel: src.model, refId: id, spec: { $prefillFromRecord: src.lines } },
                await rels,
            )
            if (!call) throw new Error(`${src.model}: falta la relación «${src.lines}»`)
            const res = await api.get(call.endpoint, { params: call.params })
            return res?.data?.data ?? []
        },
        [api, baseUrl, draftId, lineCfg?.field],
    )

    const loadFromSource = useCallback(
        async (src: DocumentFormSource, id: string) => {
            if (!lineCfg || !id) return
            setBusy('source')
            try {
                // Cabecera primero (cliente, moneda, vínculo): llega aunque los
                // renglones del origen fallen, y la tarjeta del cliente se carga.
                if (src.header || src.link_field) {
                    const h = await api.get(`/data/${src.model}`, { params: { f_id: `eq:${id}`, per_page: 1 } })
                    const rec = ((h?.data?.data ?? [])[0] ?? {}) as Record<string, any>
                    setHeader((prev) => {
                        const next = { ...prev }
                        for (const [to, from] of Object.entries(src.header ?? {})) {
                            const v = rec[from]
                            if (v == null || v === '') continue
                            next[to] = typeof v === 'object' && !Array.isArray(v) ? v.value ?? v.id ?? v : v
                        }
                        if (src.link_field) next[src.link_field] = id
                        return next
                    })
                    const seeded = sourceHeaderSeeds(src, rec, id, type.fields)
                    setSeeds((s) => ({ ...s, ...seeded }))
                    const label = src.link_field ? seeded[src.link_field]?.label : recordLabel(rec)
                    setSourceSeed(label ? { value: id, label } : null)
                }
                if (!isAllocation) {
                    const rows = await fetchSourceRows(src, id)
                    const loaded = linesFromSource(rows, src.map, { kind, discountMode: lineCfg.discount_mode, defaultTaxRate: taxRate })
                    const { covered } = sourceLoadSummary(rows)
                    setLines(loaded)
                    setLoadedSource(src)
                    setLinesFromSourceDoc(kind === 'credit')
                    setSourceNote(
                        loaded.length === 0 && covered > 0
                            ? t('documentEditor.source_all_covered', {
                                  defaultValue: 'Ese documento ya se registró completo; no queda nada pendiente.',
                              })
                            : covered > 0
                              ? t('documentEditor.source_loaded_partial', {
                                    defaultValue: '{{count}} renglones con lo que falta · {{covered}} ya completos (omitidos)',
                                    count: loaded.length,
                                    covered,
                                })
                              : t('documentEditor.source_loaded', { defaultValue: '{{count}} renglones cargados', count: loaded.length }),
                    )
                }
                setServerIssues([])
            } catch (err) {
                toast.error(t('documentEditor.source_failed', { defaultValue: 'No se pudo cargar el documento' }), {
                    description: err instanceof Error ? err.message : undefined,
                })
            } finally {
                setBusy(null)
            }
        },
        [api, lineCfg, isAllocation, kind, t, fetchSourceRows, taxRate, type.fields],
    )

    // Prefill al abrir desde un documento origen (acción de fila «Crear NC», «Facturar venta»…).
    const autoLoaded = useRef(false)
    useEffect(() => {
        if (autoLoaded.current || !initialSource) return
        const src = sources.find((s) => s.key === initialSource.key)
        if (!src) return
        autoLoaded.current = true
        void loadFromSource(src, initialSource.id)
    }, [initialSource, sources, loadFromSource])

    // ---- Vista previa -----------------------------------------------------------
    const runPreview = async () => {
        if (!type.preview) return
        setBusy('preview')
        setFormError(undefined)
        try {
            const rec = await saveDraft()
            if (!rec.id) return
            const res = await api.post(`${baseUrl}/${rec.id}/action/${type.preview.action}`, { analyze: true })
            const d = res.data?.data ?? res.data ?? {}
            const checks: any[] = Array.isArray(d.checks) ? d.checks : Array.isArray(d.issues) ? d.issues : []
            setServerIssues(
                checks
                    .filter((c) => c && c.severity !== 'ok' && c.message)
                    .map((c) => ({ field: c.field, severity: c.severity === 'error' ? 'error' : 'warning', message: String(c.message) })),
            )
            setPreview({ xml: d.xml, html: d.html, pdf_url: d.pdf_url, pdf_base64: d.pdf_base64 })
        } catch (err) {
            handleError(err)
        } finally {
            setBusy(null)
        }
    }

    const togglePreview = (open: boolean) => {
        setPreviewOpen(open)
        if (open && !preview && busy === null) void runPreview()
    }

    // ---- Guardar (acción primaria única) ----------------------------------------
    const validateHeader = (): boolean => {
        const fields = allFields.filter(visible)
        const bag = validateValues(fields, header)
        if (!bagHasErrors(bag)) {
            setFieldErrors({})
            return true
        }
        const labels: Record<string, string> = {}
        for (const f of fields) labels[f.key] = tl(f.label)
        const localized = localizeFieldErrorMap(bag, t, { labels, language: lang })
        setFieldErrors(localized)
        if (groups.advanced.some((f) => localized[f.key])) setAdvancedOpen(true)
        return false
    }

    const submit = async () => {
        setAttempted(true)
        const headerOk = validateHeader()
        if (!headerOk || blocking) {
            setFormError(t('documentEditor.fix_issues', { defaultValue: 'Corrige los puntos marcados antes de guardar.' }))
            return
        }
        setBusy('save')
        setFormError(undefined)
        try {
            let saved: Record<string, any> | undefined
            if (type.submit_action) {
                const res = await api.post(`${baseUrl}/action/${type.submit_action}`, payload())
                if (res.data?.success === false) throw { response: { data: res.data } }
                saved = res.data?.data ?? res.data ?? undefined
                emitRecordMutation(model, 'create')
            } else {
                saved = await saveDraft()
            }
            toast.success(t('dynamic.create_success', { defaultValue: 'Registro creado correctamente' }))
            onSaved?.(saved)
        } catch (err) {
            handleError(err)
        } finally {
            setBusy(null)
        }
    }

    // ---- Contribuciones de otros addons -----------------------------------------
    const ctx = useMemo<DocumentEditorContext>(() => ({ kind: type.key, model, values: header, mode: 'create' }), [type.key, model, header])
    const setValue = useCallback((key: string, value: unknown) => setHeader((h) => (h[key] === value ? h : { ...h, [key]: value })), [])
    const report = useCallback((key: string, issue: { severity: 'error' | 'warning'; message: string } | null) => {
        setContributed((prev) => {
            const cur = prev[key]
            if (!issue) {
                if (!cur) return prev
                const { [key]: _drop, ...rest } = prev
                return rest
            }
            if (cur && cur.severity === issue.severity && cur.message === issue.message) return prev
            return { ...prev, [key]: { ...issue, field: key } }
        })
    }, [])
    const contribProps = useMemo<DocumentContributionProps>(
        () => ({ ctx, setValue, issues: { report: report as DocumentContributionProps['issues']['report'] } }),
        [ctx, setValue, report],
    )
    const headerContribs = useDocumentContributions(ctx, 'header.fields')
    const partyContribs = useDocumentContributions(ctx, 'party.card')
    const bodyContribs = useDocumentContributions(ctx, 'body.sections')
    const sideContribs = useDocumentContributions(ctx, 'side.panels')
    const footerContribs = useDocumentContributions(ctx, 'footer.actions')

    // ---- Render -------------------------------------------------------------------
    const updateField = (key: string, value: any) => {
        setHeader((h) => ({ ...h, [key]: value }))
        setFieldErrors((prev) => clearFieldErrorTree(prev, key))
    }

    const fieldRecord = useMemo(() => seedRecord(seeds, record), [seeds, record])
    const fieldCell = (field: ActionFieldDef, fullWidth = false, className?: string) =>
        visible(field) ? (
            <FieldCell key={field.key} fullWidth={fullWidth} className={className}>
                <FieldLabel htmlFor={field.key} required={field.required} tone="sentence">
                    {tl(field.label)}
                </FieldLabel>
                {renderField(withFriendlyOptions(gatedOptions(field, header)), header[field.key], (v: any) => updateField(field.key, v), header, fieldRecord, fieldErrors)}
                {fieldErrors[field.key] && <p className="mt-1 text-xs text-destructive">{fieldErrors[field.key]}</p>}
            </FieldCell>
        ) : null

    // Etiquetas y catálogos: la metadata de la contraparte y, para las
    // extensiones compartidas (`fiscal_data.uso_cfdi`), los campos del propio documento.
    const summaryMeta = useMemo(() => fieldDisplayMeta([...partyFieldLists, allFields], tl), [partyFieldLists, allFields, tl])
    const summaryRows = partySummaryRows(party, type.party?.summary, {}, 6, summaryMeta)
    const advancedSummary = groups.advanced
        .filter(visible)
        .map((f) => {
            const v = header[f.key]
            if (v == null || v === '') return null
            const opt = Array.isArray(f.options) ? f.options.find((o) => String(o.value) === String(v)) : undefined
            return opt ? String(opt.value) : String(v)
        })
        .filter(Boolean)
        .slice(0, 4)
        .join(' · ')

    const totalsRows: TotalsRow[] = isAllocation
        ? [
              { label: t('documentEditor.received', { defaultValue: 'Recibido' }), value: fmt.money(amount) },
              { label: t('documentEditor.applied', { defaultValue: 'Aplicado' }), value: fmt.money(allocation.applied) },
              ...(allocation.unapplied > 0
                  ? [{ label: t('documentEditor.unapplied', { defaultValue: 'Sin aplicar (saldo a favor)' }), value: fmt.money(allocation.unapplied) }]
                  : []),
          ]
        : [
              { label: t('documentEditor.subtotal', { defaultValue: 'Subtotal' }), value: fmt.money(totals.subtotal) },
              ...(totals.discount > 0 ? [{ label: t('documentEditor.discount', { defaultValue: 'Descuento' }), value: `− ${fmt.money(totals.discount)}` }] : []),
              ...taxes.map((x) => ({
                  label: `${t('documentEditor.tax', { defaultValue: 'Impuesto' })} ${roundMoney(x.rate * 100)} %`,
                  value: fmt.money(x.tax),
              })),
              { label: t('documentEditor.total', { defaultValue: 'Total' }), value: fmt.money(totals.total), emphasis: true },
          ]

    const activeSource = sources.find((s) => s.key === sourceKey) ?? (sources.length === 1 ? sources[0] : undefined)
    const linesTitle = lineCfg?.title
        ? tl(lineCfg.title)
        : isAllocation
          ? t('documentEditor.allocation_title', { defaultValue: 'Documentos a pagar' })
          : t('documentEditor.lines_title', { defaultValue: 'Conceptos' })
    // Sin acción de vista previa del servidor, un documento con renglones ofrece
    // la suya local (encabezado, renglones y totales): sin borrador ni red.
    const localPreview = !previewEnabled && !type.preview && !!lineCfg && !isAllocation && kind !== 'credit'

    const essentials = (
        <EditorSection slot="editor-essentials">
            {/* Contraparte + fechas + condiciones en un bloque: tres columnas cuando
                el contenedor lo permite (la contraparte ocupa dos), una en móvil. */}
            <div className="@container rounded-xl border bg-card/40 p-4">
                <FieldGrid className="gap-x-4 @2xl:grid-cols-3">
                    {groups.party && fieldCell(groups.party, false, '@2xl:col-span-2')}
                    {groups.essential.map((f) => fieldCell(f))}
                </FieldGrid>
            </div>
            {party && (
                <PartyCard name={party.name ?? party.legal_name} rows={summaryRows} credit={credit} fmt={fmt}>
                    {partyContribs.map(({ id, component: C }) => (
                        <C key={id} {...contribProps} />
                    ))}
                </PartyCard>
            )}
        </EditorSection>
    )

    const loadFrom = sources.length > 0 && !isAllocation && (
        <EditorSection
            slot="load-from-source"
            title={t('documentEditor.load_from', { defaultValue: 'Cargar desde…' })}
            hint={
                busy === 'source'
                    ? t('documentEditor.loading_source', { defaultValue: 'Cargando…' })
                    : sourceNote ?? (sourceId ? undefined : t('documentEditor.load_from_hint', { defaultValue: 'Opcional · precarga contraparte y renglones' }))
            }
        >
            <div className="flex flex-wrap items-center gap-2">
                {sources.length > 1 && (
                    <div
                        role="radiogroup"
                        aria-label={t('documentEditor.source_kind', { defaultValue: 'Documento de origen' })}
                        className="inline-flex h-9 shrink-0 items-center gap-0.5 rounded-md border bg-muted/40 p-0.5"
                    >
                        {sources.map((s) => (
                            <button
                                key={s.key}
                                type="button"
                                role="radio"
                                aria-checked={s.key === sourceKey}
                                data-source-kind={s.key}
                                onClick={() => {
                                    setSourceKey(s.key)
                                    setSourceId('')
                                }}
                                className={`h-full rounded-sm px-3 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 ${
                                    s.key === sourceKey
                                        ? 'bg-background font-medium text-foreground shadow-xs dark:bg-input/60'
                                        : 'text-muted-foreground hover:text-foreground'
                                }`}
                            >
                                {tl(s.label)}
                            </button>
                        ))}
                    </div>
                )}
                {!activeSource && (
                    <div
                        className="flex h-9 min-w-60 flex-1 items-center rounded-md border border-dashed px-3 text-sm text-muted-foreground"
                        data-slot="source-picker-empty"
                    >
                        {t('documentEditor.pick_source_kind', { defaultValue: 'Elige el tipo de documento para buscarlo' })}
                    </div>
                )}
                {activeSource && (
                    <SourcePicker
                        key={activeSource.key}
                        source={activeSource}
                        value={sourceId}
                        seed={sourceSeed}
                        header={header}
                        label={tl(activeSource.label)}
                        onPick={(id) => {
                            setSourceKey(activeSource.key)
                            setSourceId(id)
                            if (id) void loadFromSource(activeSource, id)
                        }}
                    />
                )}
            </div>
        </EditorSection>
    )

    // Sin renglones todavía: un estado vacío amable en vez de $0.00 en cada fila.
    const noLines = !isAllocation && !!lineCfg && lines.length === 0
    const totalsPanel = noLines ? (
        <TotalsPanel rows={totalsRows.filter((r) => r.emphasis)} muted />
    ) : (
        <TotalsPanel rows={totalsRows} />
    )
    const totalsEmpty = noLines && (
        <div className="flex items-start gap-3 text-sm text-muted-foreground" data-slot="totals-empty">
            <ReceiptText className="mt-0.5 size-4 shrink-0" aria-hidden />
            <p>{t('documentEditor.totals_empty', { defaultValue: 'Aún no hay renglones. Busca un producto en la tabla para ver el desglose.' })}</p>
        </div>
    )

    const linesSection = lineCfg && (
        <EditorSection
            slot={isAllocation ? 'editor-allocation' : 'editor-lines'}
            title={linesTitle}
            hint={
                isAllocation && openBalance > 0 && amountKey ? (
                    <button type="button" className="underline-offset-2 hover:underline" onClick={() => updateField(amountKey, openBalance)}>
                        {t('documentEditor.pay_all', { defaultValue: 'Cobrar todo ({{amount}})', amount: fmt.money(openBalance) })}
                    </button>
                ) : undefined
            }
        >
            {isAllocation ? (
                allocPartyId ? (
                    <PaymentAllocator
                        documents={openDocs}
                        result={allocation}
                        value={alloc}
                        onChange={setAlloc}
                        currency={currency}
                        loading={docsLoading}
                        today={today}
                    />
                ) : (
                    <p className="text-sm text-muted-foreground">
                        {t('documentEditor.pick_party_first', { defaultValue: 'Elige el cliente para ver sus documentos con saldo.' })}
                    </p>
                )
            ) : (
                <DocumentLinesGrid
                    value={lines}
                    onChange={(next) => {
                        setLines(next)
                        setServerIssues([])
                    }}
                    columns={(lineCfg.columns as LineItemsColumn[] | undefined) ?? ['discount', 'tax']}
                    priceSource={lineCfg.price_source ?? (kind === 'purchase' ? 'cost' : 'sale')}
                    discountMode={lineCfg.discount_mode}
                    mode={linesFromSourceDoc ? 'from_source' : 'free'}
                    policy={kind === 'credit' ? { allowZeroQuantity: linesFromSourceDoc } : undefined}
                    search={search}
                    currency={currency}
                    showTotals={false}
                    onCreateProduct={kind === 'credit' ? undefined : createProduct}
                    onEditProduct={editProduct}
                    unitLabel={unitLabel}
                />
            )}
            {!fullscreen && totalsPanel}
        </EditorSection>
    )

    const advanced = (groups.advanced.length > 0 || headerContribs.length > 0) && (
        <CollapsibleSection
            slot="advanced-options"
            title={t('documentEditor.advanced', { defaultValue: 'Opciones fiscales' })}
            summary={advancedSummary || t('documentEditor.advanced_defaults', { defaultValue: 'Valores sugeridos' })}
            open={advancedOpen}
            onOpenChange={setAdvancedOpen}
        >
            {groups.advanced.length > 0 && <FieldGrid>{groups.advanced.map((f) => fieldCell(f))}</FieldGrid>}
            {headerContribs.map(({ id, component: C }) => (
                <C key={id} {...contribProps} />
            ))}
        </CollapsibleSection>
    )

    const contributedSections = [...bodyContribs, ...sideContribs].map(({ id, component: C }) => (
        <section key={id} data-contribution={id}>
            <C {...contribProps} />
        </section>
    ))

    const notes = groups.notes.length > 0 && <FieldGrid>{groups.notes.map((f) => fieldCell(f, true))}</FieldGrid>

    const previewSection = previewEnabled ? (
        <CollapsibleSection slot="preview" title={tl(type.preview!.label ?? 'Vista previa')} open={previewOpen} onOpenChange={togglePreview}>
            {busy === 'preview' ? (
                <p className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Loader2 className="size-4 animate-spin" aria-hidden />
                    {t('documentEditor.preview_loading', { defaultValue: 'Generando vista previa…' })}
                </p>
            ) : (
                <>
                    <PreviewPanel preview={preview} />
                    <Button type="button" variant="ghost" size="sm" onClick={() => void runPreview()} disabled={busy !== null}>
                        {t('documentEditor.preview_refresh', { defaultValue: 'Actualizar vista previa' })}
                    </Button>
                </>
            )}
        </CollapsibleSection>
    ) : localPreview ? (
        <CollapsibleSection slot="preview" title={t('documentEditor.preview', { defaultValue: 'Vista previa' })} open={previewOpen} onOpenChange={setPreviewOpen}>
            <DraftPreview
                title={tl(type.label)}
                party={party ? String(party.name ?? party.legal_name ?? '') : undefined}
                header={[...groups.essential, ...groups.advanced]
                    .filter(visible)
                    .map((f) => {
                        const v = header[f.key]
                        const opt = Array.isArray(f.options) ? f.options.find((o) => String(o.value) === String(v)) : undefined
                        const seeded = seeds[f.key] && String(seeds[f.key].value) === String(v) ? seeds[f.key].label : undefined
                        return { label: tl(f.label), value: v == null || v === '' ? '' : opt ? friendlyOptionLabel(tl(String(opt.label ?? v))) : seeded ?? String(v) }
                    })
                    .filter((r) => r.value)}
                lines={lines}
                totals={totalsRows}
                fmt={fmt}
            />
        </CollapsibleSection>
    ) : null

    const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent || '')
    const checklist = <ValidationChecklist issues={shownIssues} title={t('documentEditor.review', { defaultValue: 'Revisa antes de guardar' })} />

    return (
        <div
            className="flex min-h-0 flex-1 flex-col"
            data-slot="document-editor"
            data-kind={kind}
            data-layout={fullscreen ? 'fullscreen' : 'dialog'}
            onKeyDown={(e) => {
                // ⌘/Ctrl+Enter guarda desde cualquier campo del editor.
                if (e.key === 'Enter' && (e.metaKey || e.ctrlKey) && busy === null) {
                    e.preventDefault()
                    void submit()
                }
            }}
        >
            {fullscreen ? (
                <div className="-mx-1 min-h-0 flex-1 overflow-y-auto px-1 py-2 lg:grid lg:grid-cols-[minmax(0,1fr)_320px] lg:gap-6">
                    <div className="min-w-0 space-y-6" data-slot="editor-main">
                        <FormErrorBanner message={formError} />
                        {essentials}
                        {loadFrom}
                        {linesSection}
                        {advanced}
                        {contributedSections}
                        {notes}
                    </div>
                    <aside className="mt-6 space-y-4 lg:sticky lg:top-0 lg:mt-0 lg:self-start" data-slot="editor-aside">
                        <div className="space-y-3 rounded-xl border bg-card/40 p-4">
                            {totalsEmpty}
                            {totalsPanel}
                        </div>
                        {checklist}
                        {previewSection}
                    </aside>
                </div>
            ) : (
                <div className="-mx-1 min-h-0 flex-1 space-y-6 overflow-y-auto px-1 py-2">
                    <FormErrorBanner message={formError} />
                    {essentials}
                    {loadFrom}
                    {linesSection}
                    {advanced}
                    {contributedSections}
                    {notes}
                    {previewSection}
                    {checklist}
                </div>
            )}

            <footer className="flex shrink-0 flex-wrap items-center justify-end gap-2 border-t pt-4" data-slot="editor-actions">
                <span className="mr-auto hidden items-center gap-1 text-xs text-muted-foreground sm:inline-flex" data-slot="editor-shortcut">
                    <kbd className="rounded border bg-muted px-1.5 py-0.5 font-mono text-[0.7rem]">{isMac ? '⌘' : 'Ctrl'}</kbd>
                    <kbd className="rounded border bg-muted px-1.5 py-0.5 font-mono text-[0.7rem]">Enter</kbd>
                    <span>{t('documentEditor.shortcut_save', { defaultValue: 'para guardar' })}</span>
                </span>
                {footerContribs.map(({ id, component: C }) => (
                    <C key={id} {...contribProps} />
                ))}
                <Button type="button" variant="ghost" onClick={onCancel} disabled={busy === 'save'}>
                    {t('common.cancel', { defaultValue: 'Cancelar' })}
                </Button>
                <Button type="button" data-primary="true" onClick={() => void submit()} disabled={busy !== null}>
                    {busy === 'save' && <Loader2 className="mr-2 size-4 animate-spin" aria-hidden />}
                    {type.submit_label ? tl(type.submit_label) : t('common.save', { defaultValue: 'Guardar' })}
                </Button>
            </footer>
        </div>
    )
}

/** Selector del documento origen (mismo widget de relación que el resto de formularios). */
function SourcePicker({
    source,
    value,
    seed,
    header,
    label,
    onPick,
}: {
    source: DocumentFormSource
    value: string
    /** Folio del origen ya cargado: el selector cerrado lo muestra en vez del UUID. */
    seed?: SeedLabel | null
    header: Record<string, any>
    label: string
    onPick: (id: string) => void
}) {
    const field = useMemo(
        () =>
            ({
                key: `__source_${source.key}`,
                label,
                type: 'dynamic_select',
                ref: source.model,
                option_filter: source.option_filter,
            }) as ActionFieldDef,
        [source, label],
    )
    return (
        <div className="min-w-60 flex-1" data-source={source.key}>
            {renderField(field, value, (v: any) => onPick(v == null || v === '' ? '' : String(v)), header, seed ? { id: seed.value, label: seed.label } : undefined)}
        </div>
    )
}

/**
 * Campos y columnas de un modelo para etiquetar sus valores: formulario
 * (`/metadata/modal`, con extensiones) y tabla (`/metadata/table`). Si la
 * clave con módulo (`customers.Customer`) no resuelve en el host, prueba la
 * corta (`Customer`), como el puente de alta del host. Nunca lanza.
 */
async function loadModelFieldLists(api: { get: (url: string, cfg?: any) => Promise<any> }, model: string): Promise<unknown[][]> {
    const short = model.includes('.') ? model.slice(model.lastIndexOf('.') + 1) : undefined
    // `undefined` = la petición falló (el host no conoce esa clave); `[]` = respondió sin campos.
    const read = async (url: string, key: 'fields' | 'columns'): Promise<unknown[] | undefined> => {
        try {
            const res = await api.get(url)
            const list = res?.data?.data?.[key] ?? res?.data?.[key]
            return Array.isArray(list) ? list : []
        } catch {
            return undefined
        }
    }
    // En serie y solo lo necesario (una lectura en el caso normal): el
    // formulario; la clave corta solo si la larga falló; la tabla solo si
    // ningún formulario respondió con campos.
    const candidates = short ? [model, short] : [model]
    for (const kind of ['modal', 'table'] as const) {
        for (const m of candidates) {
            const list = await read(`/metadata/${kind}/${m}`, kind === 'modal' ? 'fields' : 'columns')
            if (list === undefined) continue
            if (list.length > 0) return [list]
            break
        }
    }
    return []
}
