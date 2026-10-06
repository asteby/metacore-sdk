// DocumentFormDialog — alta guiada por tipo de documento (FAC-12, #1022).
//
// "Crear documento fiscal" era el mismo formulario genérico para factura, nota
// de crédito, REP, global y traslado: los campos los dictaba el modelo, no el
// tipo. Aquí el metadata (`document_forms`) o una prop declara los tipos; el
// diálogo muestra tarjetas de tipo y, al elegir uno, SUS campos y (si lo declara)
// el paso de renglones con el editor de renglones del SDK. Un solo tipo se salta
// el selector; sin manifest el alta genérica sigue igual (DynamicCRUDPage decide).
//
// El SDK no hardcodea catálogos SAT: campos, valores fijos y el valor del tipo
// vienen del manifest que sirve el kernel o el addon.
import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
    Button,
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@asteby/metacore-ui/primitives'
import { Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { useApi } from './api-context'
import { useOrgTaxRate } from './org-runtime-context'
import { DynamicIcon } from './dynamic-icon'
import { FieldCell, FieldGrid, FieldLabel } from './field-grid'
import { FormErrorBanner } from './business/feedback'
import {
    DocumentLinesGrid,
    type DocumentLinesGridProps,
    type LineItemsColumn,
} from './business/line-items-editor'
import { serializeLineItems, validateLineItems, type LineItem } from './business/line-items'
import {
    actionErrorBannerMessage,
    buildFieldDefaults,
    renderField,
} from './action-modal-dispatcher'
import { extractFieldErrors, localizeFieldErrorMap } from './server-error'
import { validateValues, bagHasErrors } from './validator'
import { clearFieldErrorTree } from './field-validation-ui'
import { emitRecordMutation } from './record-mutation-events'
import { isLineItemsField, resolveWidget, scopeValueFromFilterToken } from './dynamic-form-schema'
import { createCatalogProductSearch, withDefaultTaxRate } from './business/catalog-product-search'
import { DocumentEditor } from './business/document-editor'
import { editorLinesConfig, isEditorLayout } from './business/document-editor-model'
import type {
    ActionFieldDef,
    DocumentFormType,
    DocumentFormsManifest,
    TableMetadata,
} from './types'

export interface DocumentFormDialogProps {
    open: boolean
    onOpenChange: (open: boolean) => void
    /** Modelo en el que se da de alta (p. ej. `fiscal_documents`). */
    model: string
    /** Endpoint de alta. Default `/dynamic/<model>`. */
    endpoint?: string
    forms: DocumentFormsManifest
    /** Tipo preseleccionado (se salta el selector). */
    initialType?: string
    /** Se llama con el registro creado. */
    onSaved?: (record?: unknown) => void
    /**
     * Buscador de productos para el editor de renglones (mismo contrato que
     * ProductPicker). Sin él se busca en el catálogo (`productModel`) vía /data.
     */
    searchProducts?: DocumentLinesGridProps['search']
    /** Modelo de catálogo del buscador por defecto. Default `products.Product`. */
    productModel?: string
    /** Tasa de impuesto (0.16) si el producto no trae la suya. Default: la de la org (OrgRuntimeProvider). */
    defaultTaxRate?: number
    /** Moneda ISO para el editor de renglones (default: la de la org). */
    currency?: string
    /**
     * Registro desde el que se abre (acción de fila «Crear NC», «Registrar
     * cobro»…): siembra los campos con `default_from_record`.
     */
    record?: Record<string, any>
    /** Documento origen a precargar en el DocumentEditor (`sources[].key` + id). */
    initialSource?: { key: string; id: string }
    /**
     * Tipo con `create_model`: el alta vive en otro modelo. El host navega a la
     * página de ese modelo con su alta abierta; el diálogo se cierra sin pintar
     * formulario. Sin este callback un tipo delegado no se ofrece.
     */
    onDelegateCreate?: (target: DelegatedCreate) => void
}

/** Alta delegada a otro modelo (`document_forms.types[].create_model`). */
export interface DelegatedCreate {
    /** Clave del modelo destino tal como la declara el manifest (`customers.Invoice`). */
    model: string
    /** Tipo que la declaró. */
    type: DocumentFormType
}

/**
 * Si «Crear» de estos formularios es un alta delegada: un único tipo (p. ej.
 * ya acotado por el filtro de la vista) con `create_model`. Con varios tipos el
 * selector la ofrece como una tarjeta más.
 */
export function delegatedCreate(forms: DocumentFormsManifest | undefined): DelegatedCreate | undefined {
    const only = forms?.types.length === 1 ? forms.types[0] : undefined
    const model = only?.create_model?.trim()
    return only && model ? { model, type: only } : undefined
}

/** Quita los tipos delegados cuando el host no sabe navegar a otro modelo. */
export function withoutDelegatedTypes(forms: DocumentFormsManifest | undefined): DocumentFormsManifest | undefined {
    if (!forms) return forms
    const types = forms.types.filter((x) => !x.create_model?.trim())
    if (types.length === forms.types.length) return forms
    return types.length > 0 ? { ...forms, types } : undefined
}

/** Manifest efectivo: la prop gana sobre el metadata; sin tipos devuelve undefined. */
export function resolveDocumentForms(
    metadata?: Pick<TableMetadata, 'document_forms'> | null,
    override?: DocumentFormsManifest | null,
): DocumentFormsManifest | undefined {
    const m = override ?? metadata?.document_forms
    return m && Array.isArray(m.types) && m.types.length > 0 ? m : undefined
}

/**
 * Acota el alta guiada a la vista filtrada. Un nav que filtra por la columna
 * discriminadora (`type_field`) lista UN tipo de documento: «Crear» debe abrir
 * ese tipo directo y, si el manifest no trae formulario para él, no ofrecerse
 * (retest r3: «Documentos fiscales → Facturas → Crear» abría el REP, el único
 * tipo declarado). Sin manifest, sin `type_field` o sin filtro sobre él, todo
 * queda igual.
 */
export function scopeDocumentFormsToFilter(
    forms: DocumentFormsManifest | undefined,
    filter?: Record<string, unknown> | null,
): { forms: DocumentFormsManifest | undefined; hideCreate: boolean } {
    const field = forms?.type_field
    if (!forms || !field || !filter || !(field in filter)) return { forms, hideCreate: false }
    const want = scopeValueFromFilterToken(filter[field]).trim().toLowerCase()
    if (want === '') return { forms, hideCreate: false }
    const types = forms.types.filter((x) => String(x.value ?? x.key).trim().toLowerCase() === want)
    if (types.length === 0) return { forms: undefined, hideCreate: true }
    return { forms: types.length === forms.types.length ? forms : { ...forms, types }, hideCreate: false }
}

type Step = 'type' | 'fields' | 'lines'

export function DocumentFormDialog({
    open,
    onOpenChange,
    model,
    endpoint,
    forms,
    initialType,
    onSaved,
    searchProducts,
    productModel,
    defaultTaxRate,
    currency,
    record,
    initialSource,
    onDelegateCreate,
}: DocumentFormDialogProps) {
    const { t, i18n } = useTranslation()
    const api = useApi()
    const orgTaxRate = useOrgTaxRate()
    // Sin onDelegateCreate el host no sabe abrir otro modelo: sus tipos no se ofrecen.
    const types = useMemo(
        () => (onDelegateCreate ? forms.types : forms.types.filter((x) => !x.create_model?.trim())),
        [forms.types, onDelegateCreate],
    )
    const single = types.length === 1 ? types[0] : undefined

    const [typeKey, setTypeKey] = useState<string | null>(initialType ?? single?.key ?? null)
    const [step, setStep] = useState<Step>(initialType || single ? 'fields' : 'type')
    const [formData, setFormData] = useState<Record<string, any>>({})
    const [lines, setLines] = useState<LineItem[]>([])
    const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
    const [serverLineErrors, setServerLineErrors] = useState<Record<string, string>>({})
    const [formError, setFormError] = useState<string | undefined>()
    const [saving, setSaving] = useState(false)

    const type = useMemo(() => types.find((x) => x.key === typeKey) ?? null, [types, typeKey])
    const delegatedModel = type?.create_model?.trim() || undefined

    // Tipo con alta en otro modelo: no hay formulario aquí; el host navega.
    useEffect(() => {
        if (!open || !type || !delegatedModel) return
        onDelegateCreate?.({ model: delegatedModel, type })
        onOpenChange(false)
        // onDelegateCreate/onOpenChange: callbacks del host, no disparan de nuevo.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open, type, delegatedModel])
    // Sin buscador inyectado, el paso de renglones solo ofrecía «Renglón libre»
    // y la línea entraba sin precio (DynamicCRUDPage no pasa searchProducts).
    // Default: el catálogo de productos de la org. El buscador del host también
    // recibe el IVA de la org para los productos que no traen su tasa.
    const taxRate = defaultTaxRate ?? orgTaxRate
    const lineSearch = useMemo(
        () =>
            searchProducts
                ? withDefaultTaxRate(searchProducts, taxRate)
                : createCatalogProductSearch(api, { model: productModel, defaultTaxRate: taxRate }),
        [searchProducts, api, productModel, taxRate],
    )
    const lineCfg = type ? editorLinesConfig(type, forms) : undefined

    // Reset every time the dialog (re)opens.
    useEffect(() => {
        if (!open) return
        const start = initialType ?? single?.key ?? null
        setTypeKey(start)
        setStep(start ? 'fields' : 'type')
        setLines([])
        setFieldErrors({})
        setServerLineErrors({})
        setFormError(undefined)
    }, [open, initialType, single?.key])

    // Seed field defaults for the chosen type.
    useEffect(() => {
        if (!type) return
        setFormData({ ...buildFieldDefaults(type.fields, record), ...(type.defaults ?? {}) })
        setFieldErrors({})
        setFormError(undefined)
    }, [type, record])

    const updateField = (key: string, value: any) => {
        setFormData((prev) => ({ ...prev, [key]: value }))
        setFieldErrors((prev) => clearFieldErrorTree(prev, key))
    }

    const tl = (s: string) => t(s, { defaultValue: s })
    const lang = i18n?.language

    const chooseType = (k: string) => {
        setTypeKey(k)
        setStep('fields')
    }

    /** Validate the header fields; returns true when they pass. */
    const validateHeader = (): boolean => {
        if (!type) return false
        const bag = validateValues(type.fields, formData)
        if (!bagHasErrors(bag)) {
            setFieldErrors({})
            return true
        }
        const labels: Record<string, string> = {}
        for (const f of type.fields) labels[f.key] = tl(f.label)
        setFieldErrors(localizeFieldErrorMap(bag, t, { labels, language: lang }))
        return false
    }

    const goNext = () => {
        if (validateHeader()) setStep('lines')
    }

    const submit = async () => {
        if (!type) return
        if (!validateHeader()) {
            setStep('fields')
            return
        }
        if (lineCfg && (lineCfg.required ?? true)) {
            const v = validateLineItems(lines, { requireItems: true })
            if (!v.form && Object.keys(v.errors).length === 0) {
                /* ok */
            } else {
                setServerLineErrors(v.errors)
                setFormError(v.form ?? t('documentForm.lines_invalid', { defaultValue: 'Revisa los renglones del documento.' }))
                setStep('lines')
                return
            }
        }
        setSaving(true)
        setFormError(undefined)
        try {
            const payload: Record<string, unknown> = { ...(type.defaults ?? {}), ...formData }
            if (forms.type_field) payload[forms.type_field] = type.value ?? type.key
            if (lineCfg) payload[lineCfg.field] = serializeLineItems(lines)
            const url = type.endpoint ?? endpoint ?? `/dynamic/${model}`
            const res = await api.post(url, payload)
            if (res.data?.success === false) {
                handleError({ response: { data: res.data } })
                return
            }
            toast.success(t('dynamic.create_success', { defaultValue: 'Registro creado correctamente' }))
            emitRecordMutation(model, 'create')
            onSaved?.(res.data?.data ?? res.data ?? undefined)
            onOpenChange(false)
        } catch (err) {
            handleError(err)
        } finally {
            setSaving(false)
        }
    }

    /** 422 → marks the fields and shows the banner INSIDE the dialog; stays open. */
    const handleError = (err: unknown) => {
        setFormError(actionErrorBannerMessage(err, type?.fields, t, lang))
        const map = extractFieldErrors(err)
        if (map) {
            const labels: Record<string, string> = {}
            for (const f of type?.fields ?? []) labels[f.key] = tl(f.label)
            const localized = localizeFieldErrorMap(map, t, { labels, language: lang })
            const header: Record<string, string> = {}
            const lineErrs: Record<string, string> = {}
            const prefix = lineCfg ? `${lineCfg.field}.` : null
            for (const [k, v] of Object.entries(localized)) {
                if (prefix && k.startsWith(prefix)) lineErrs[k.slice(prefix.length)] = v
                else header[k] = v
            }
            setFieldErrors(header)
            setServerLineErrors(lineErrs)
        }
    }

    const canGoBackToTypes = types.length > 1 && !initialType
    const stepLabel = (s: Step) =>
        s === 'type'
            ? t('documentForm.step_type', { defaultValue: 'Tipo de documento' })
            : s === 'fields'
              ? t('documentForm.step_data', { defaultValue: 'Datos' })
              : tl(lineCfg?.title ?? 'Renglones')

    if (open && type && delegatedModel) return null

    // layout "editor": una sola pantalla por secciones (DocumentEditor). Sin él
    // sigue el wizard de siempre (retrocompatible).
    if (open && type && step !== 'type' && (isEditorLayout(type) || !!initialSource)) {
        return (
            <Dialog open={open} onOpenChange={onOpenChange}>
                <DialogContent
                    className="flex max-h-[92dvh] flex-col overflow-hidden"
                    style={{ maxHeight: '92dvh', maxWidth: '960px', width: '95vw' }}
                    data-slot="document-editor-dialog"
                >
                    <DialogHeader className="shrink-0">
                        <DialogTitle>{tl(type.label)}</DialogTitle>
                        {type.description && <DialogDescription>{tl(type.description)}</DialogDescription>}
                    </DialogHeader>
                    <DocumentEditor
                        key={type.key}
                        model={model}
                        endpoint={endpoint}
                        forms={forms}
                        type={type}
                        record={record}
                        initialSource={initialSource}
                        searchProducts={lineSearch}
                        currency={currency}
                        onCancel={() => (canGoBackToTypes ? setStep('type') : onOpenChange(false))}
                        onSaved={(rec) => {
                            onSaved?.(rec)
                            onOpenChange(false)
                        }}
                    />
                </DialogContent>
            </Dialog>
        )
    }

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent
                className="flex max-h-[90dvh] flex-col overflow-hidden sm:max-w-2xl"
                style={{ maxHeight: '90dvh', ...(step === 'lines' ? { maxWidth: '980px', width: '95vw' } : {}) }}
                data-slot="document-form-dialog"
            >
                <DialogHeader className="shrink-0">
                    <DialogTitle>
                        {type ? tl(type.label) : t('documentForm.title', { defaultValue: 'Nuevo documento' })}
                    </DialogTitle>
                    <DialogDescription>{stepLabel(step)}</DialogDescription>
                </DialogHeader>

                <div className="-mx-1 min-h-0 flex-1 space-y-3 overflow-y-auto px-1 py-3">
                    <FormErrorBanner message={formError} />

                    {step === 'type' && (
                        <div role="radiogroup" className="grid gap-3 sm:grid-cols-2">
                            {types.map((x) => (
                                <button
                                    key={x.key}
                                    type="button"
                                    role="radio"
                                    aria-checked={x.key === typeKey}
                                    data-type-card={x.key}
                                    onClick={() => chooseType(x.key)}
                                    className="flex items-start gap-3 rounded-lg border p-4 text-left transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                                >
                                    {x.icon && <DynamicIcon name={x.icon} className="mt-0.5 size-5 shrink-0 text-primary" />}
                                    <span>
                                        <span className="block text-sm font-medium">{tl(x.label)}</span>
                                        {x.description && (
                                            <span className="block text-xs text-muted-foreground">{tl(x.description)}</span>
                                        )}
                                    </span>
                                </button>
                            ))}
                        </div>
                    )}

                    {step === 'fields' && type && (
                        <FieldGrid>
                            {type.fields.map((field: ActionFieldDef) => {
                                const fullWidth =
                                    isLineItemsField(field) ||
                                    resolveWidget(field) === 'textarea' ||
                                    resolveWidget(field) === 'richtext'
                                return (
                                    <FieldCell key={field.key} fullWidth={fullWidth}>
                                        <FieldLabel htmlFor={field.key} required={field.required}>
                                            {tl(field.label)}
                                        </FieldLabel>
                                        {renderField(
                                            field,
                                            formData[field.key],
                                            (v: any) => updateField(field.key, v),
                                            formData,
                                            undefined,
                                            fieldErrors,
                                        )}
                                        {fieldErrors[field.key] && (
                                            <p className="mt-1 text-xs text-destructive">{fieldErrors[field.key]}</p>
                                        )}
                                    </FieldCell>
                                )
                            })}
                        </FieldGrid>
                    )}

                    {step === 'lines' && type && lineCfg && (
                        <DocumentLinesGrid
                            value={lines}
                            onChange={(next) => {
                                setLines(next)
                                setServerLineErrors({})
                            }}
                            columns={(lineCfg.columns as LineItemsColumn[] | undefined) ?? ['discount', 'tax']}
                            priceSource={lineCfg.price_source ?? 'sale'}
                            discountMode={lineCfg.discount_mode}
                            serverErrors={serverLineErrors}
                            search={lineSearch}
                            currency={currency}
                        />
                    )}
                </div>

                <DialogFooter className="shrink-0">
                    {step === 'type' ? (
                        <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                            {t('common.cancel', { defaultValue: 'Cancelar' })}
                        </Button>
                    ) : (
                        <Button
                            type="button"
                            variant="outline"
                            disabled={saving}
                            onClick={() => {
                                if (step === 'lines') setStep('fields')
                                else if (canGoBackToTypes) setStep('type')
                                else onOpenChange(false)
                            }}
                        >
                            {step === 'fields' && !canGoBackToTypes
                                ? t('common.cancel', { defaultValue: 'Cancelar' })
                                : t('common.back', { defaultValue: 'Atrás' })}
                        </Button>
                    )}
                    {step === 'fields' && type && lineCfg && (
                        <Button type="button" onClick={goNext}>
                            {t('common.next', { defaultValue: 'Siguiente' })}
                        </Button>
                    )}
                    {((step === 'fields' && type && !lineCfg) || step === 'lines') && (
                        <Button type="button" onClick={submit} disabled={saving}>
                            {saving && <Loader2 className="mr-2 size-4 animate-spin" aria-hidden />}
                            {type?.submit_label ? tl(type.submit_label) : t('common.create', { defaultValue: 'Crear' })}
                        </Button>
                    )}
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}
