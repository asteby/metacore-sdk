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
import { Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { useApi } from '../api-context'
import { useOrgTaxRate, useTimeZone } from '../org-runtime-context'
import { FieldCell, FieldGrid, FieldLabel } from '../field-grid'
import { FormErrorBanner } from './feedback'
import { DocumentLinesGrid, type DocumentLinesGridProps, type LineItemsColumn } from './line-items-editor'
import { computeTotals, serializeLineItems, taxBreakdown, type LineItem } from './line-items'
import { roundMoney, toAmount, useFormatter } from './format'
import { createCatalogProductSearch } from './catalog-product-search'
import {
    allocationAmountField,
    allocationIssueMessages,
    allocationPayload,
    creditStatus,
    editorLinesConfig,
    linesFromSource,
    localIssues,
    sourceLoadSummary,
    sourceTracksRemaining,
    partyDefaults,
    partySummaryRows,
    splitEditorFields,
    toOpenDocuments,
    withFriendlyOptions,
    type EditorIssue,
} from './document-editor-model'
import {
    CollapsibleSection,
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
    /** Modelo de catálogo del buscador por defecto. Default `products.Product`. */
    productModel?: string
    defaultTaxRate?: number
    currency?: string
    /** Hoy (días de atraso del reparto; inyectable en tests). */
    today?: Date
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
    defaultTaxRate,
    currency,
    today,
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
    const relCache = useRef(new Map<string, Promise<any[]>>())

    const taxRate = defaultTaxRate ?? orgTaxRate
    const search = useMemo(
        () => searchProducts ?? createCatalogProductSearch(api, { model: productModel, defaultTaxRate: taxRate }),
        [searchProducts, api, productModel, taxRate],
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
            })
            .catch(() => !cancelled && setParty(null))
        return () => {
            cancelled = true
        }
    }, [api, type.party, partyId])

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
                } catch (err: any) {
                    if (err?.response?.status !== 404) throw err
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
                if (!isAllocation) {
                    const rows = await fetchSourceRows(src, id)
                    const loaded = linesFromSource(rows, src.map, { kind, discountMode: lineCfg.discount_mode })
                    const { covered } = sourceLoadSummary(rows)
                    setLines(loaded)
                    setLoadedSource(src)
                    setLinesFromSourceDoc(kind === 'credit')
                    setSourceNote(
                        loaded.length === 0 && covered > 0
                            ? t('documentEditor.source_all_covered', {
                                  defaultValue: 'Todo el documento ya está registrado en otros documentos; no queda nada pendiente.',
                              })
                            : covered > 0
                              ? t('documentEditor.source_loaded_partial', {
                                    defaultValue: '{{count}} renglones con lo pendiente · {{covered}} ya cubiertos se omitieron',
                                    count: loaded.length,
                                    covered,
                                })
                              : t('documentEditor.source_loaded', { defaultValue: '{{count}} renglones cargados', count: loaded.length }),
                    )
                }
                if (src.header || src.link_field) {
                    const h = await api.get(`/data/${src.model}`, { params: { f_id: `eq:${id}`, per_page: 1 } })
                    const rec = ((h?.data?.data ?? [])[0] ?? {}) as Record<string, any>
                    setHeader((prev) => {
                        const next = { ...prev }
                        for (const [to, from] of Object.entries(src.header ?? {})) if (rec[from] != null) next[to] = rec[from]
                        if (src.link_field) next[src.link_field] = id
                        return next
                    })
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
        [api, lineCfg, isAllocation, kind, t, fetchSourceRows],
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

    const fieldCell = (field: ActionFieldDef, fullWidth = false) =>
        visible(field) ? (
            <FieldCell key={field.key} fullWidth={fullWidth}>
                <FieldLabel htmlFor={field.key} required={field.required}>
                    {tl(field.label)}
                </FieldLabel>
                {renderField(withFriendlyOptions(field), header[field.key], (v: any) => updateField(field.key, v), header, undefined, fieldErrors)}
                {fieldErrors[field.key] && <p className="mt-1 text-xs text-destructive">{fieldErrors[field.key]}</p>}
            </FieldCell>
        ) : null

    const summaryRows = partySummaryRows(
        party,
        type.party?.summary,
        Object.fromEntries(allFields.map((f) => [f.key, tl(f.label)])),
    )
    const advancedSummary = groups.advanced
        .filter(visible)
        .map((f) => {
            const v = header[f.key]
            if (v == null || v === '') return null
            const opt = f.options?.find((o) => String(o.value) === String(v))
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

    const activeSource = sources.find((s) => s.key === sourceKey)
    const linesTitle = lineCfg?.title
        ? tl(lineCfg.title)
        : isAllocation
          ? t('documentEditor.allocation_title', { defaultValue: 'Documentos a pagar' })
          : t('documentEditor.lines_title', { defaultValue: 'Conceptos' })

    return (
        <div className="flex min-h-0 flex-1 flex-col" data-slot="document-editor" data-kind={kind}>
            <div className="-mx-1 min-h-0 flex-1 space-y-8 overflow-y-auto px-1 py-2">
                <FormErrorBanner message={formError} />

                <EditorSection slot="editor-essentials">
                    <FieldGrid>
                        {groups.party && fieldCell(groups.party)}
                        {groups.essential.map((f) => fieldCell(f))}
                    </FieldGrid>
                    {party && (
                        <PartyCard name={party.name ?? party.legal_name} rows={summaryRows} credit={credit} fmt={fmt}>
                            {partyContribs.map(({ id, component: C }) => (
                                <C key={id} {...contribProps} />
                            ))}
                        </PartyCard>
                    )}
                </EditorSection>

                {sources.length > 0 && !isAllocation && (
                    <EditorSection
                        slot="load-from-source"
                        title={t('documentEditor.load_from', { defaultValue: 'Cargar desde…' })}
                        hint={busy === 'source' ? t('documentEditor.loading_source', { defaultValue: 'Cargando…' }) : sourceNote}
                    >
                        <div className="flex flex-wrap items-center gap-2">
                            {sources.length > 1 && (
                                <select
                                    aria-label={t('documentEditor.source_kind', { defaultValue: 'Tipo de documento origen' })}
                                    className="h-9 rounded-md border bg-background px-2 text-sm"
                                    value={sourceKey}
                                    onChange={(e) => {
                                        setSourceKey(e.target.value)
                                        setSourceId('')
                                    }}
                                >
                                    <option value="">{t('documentEditor.choose_source', { defaultValue: 'Elige…' })}</option>
                                    {sources.map((s) => (
                                        <option key={s.key} value={s.key}>
                                            {tl(s.label)}
                                        </option>
                                    ))}
                                </select>
                            )}
                            {(activeSource ?? (sources.length === 1 ? sources[0] : undefined)) && (
                                <SourcePicker
                                    source={(activeSource ?? sources[0])!}
                                    value={sourceId}
                                    header={header}
                                    label={tl((activeSource ?? sources[0])!.label)}
                                    onPick={(id) => {
                                        if (!activeSource) setSourceKey(sources[0].key)
                                        setSourceId(id)
                                        const src = activeSource ?? sources[0]
                                        if (id) void loadFromSource(src, id)
                                    }}
                                />
                            )}
                        </div>
                    </EditorSection>
                )}

                {lineCfg && (
                    <EditorSection
                        slot={isAllocation ? 'editor-allocation' : 'editor-lines'}
                        title={linesTitle}
                        hint={
                            isAllocation && openBalance > 0 && amountKey ? (
                                <button
                                    type="button"
                                    className="underline-offset-2 hover:underline"
                                    onClick={() => updateField(amountKey, openBalance)}
                                >
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
                            />
                        )}
                        <TotalsPanel rows={totalsRows} />
                    </EditorSection>
                )}

                {(groups.advanced.length > 0 || headerContribs.length > 0) && (
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
                )}

                {[...bodyContribs, ...sideContribs].map(({ id, component: C }) => (
                    <section key={id} data-contribution={id}>
                        <C {...contribProps} />
                    </section>
                ))}

                {groups.notes.length > 0 && <FieldGrid>{groups.notes.map((f) => fieldCell(f, true))}</FieldGrid>}

                {previewEnabled && (
                    <CollapsibleSection
                        slot="preview"
                        title={tl(type.preview!.label ?? 'Vista previa')}
                        open={previewOpen}
                        onOpenChange={togglePreview}
                    >
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
                )}

                <ValidationChecklist issues={shownIssues} title={t('documentEditor.review', { defaultValue: 'Revisa antes de guardar' })} />
            </div>

            <footer className="flex shrink-0 flex-wrap items-center justify-end gap-2 border-t pt-4" data-slot="editor-actions">
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
    header,
    label,
    onPick,
}: {
    source: DocumentFormSource
    value: string
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
        <div className="min-w-[240px] flex-1" data-source={source.key}>
            {renderField(field, value, (v: any) => onPick(v == null || v === '' ? '' : String(v)), header)}
        </div>
    )
}
