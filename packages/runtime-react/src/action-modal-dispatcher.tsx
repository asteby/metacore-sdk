// ActionModalDispatcher — renders the right modal for a custom action:
// 1) Custom component from the SDK registry → use it
// 2) action.fields[] → GenericActionModal (form)
// 3) action.confirm → ConfirmActionDialog
// 4) otherwise → nothing (caller executes immediately)
//
// The host injects its axios-like client via <ApiProvider>; we no longer
// depend on a bundler alias to `@/lib/api`.
import { useState, useEffect, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
    DialogFooter,
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
    Button,
    Input,
    Textarea,
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
    Switch,
} from '@asteby/metacore-ui/primitives'
import { Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { useApi } from './api-context'
import { DynamicIcon } from './dynamic-icon'
import { DynamicLineItems } from './dynamic-line-items'
import { DynamicRelations } from './dynamic-relations'
import { DynamicSelectField } from './dynamic-select-field'
import { DynamicDateField } from './dynamic-date-field'
import { UploadField } from './upload-field'
import { isLineItemsField, resolveWidget, resolveDependsValue, getDependsOn } from './dynamic-form-schema'
import { FieldGrid, FieldCell, FieldLabel } from './field-grid'
import type { ActionFieldDef } from './types'
// Canonical registry lives in @asteby/metacore-sdk
import {
    type ActionMetadata,
    type ActionModalProps,
    getActionComponent,
} from '@asteby/metacore-sdk'

export type { ActionMetadata, ActionModalProps }

// ---- line-items prefill from the acted-on record ----------------------------
//
// A line-items action field can seed its rows from the record being acted on,
// instead of opening empty. The manifest declares this by setting the field's
// `default`/`defaultValue` to a PrefillSpec object: the modal reads the record's
// `$prefillFromRecord` array, copies the mapped keys, and (for a receive-style
// flow) computes a `remaining` quantity = of - minus, dropping fully-satisfied
// rows. Decoupled + generic: the SDK knows nothing about transfers, only how to
// project a record array into the field's item_fields. Example (receive goods):
//
//   "default": {
//     "$prefillFromRecord": "items",
//     "map": { "product_id": "product_id" },
//     "remaining": { "target": "qty_received", "of": "quantity", "minus": "received" }
//   }
interface PrefillSpec {
    $prefillFromRecord: string
    map?: Record<string, string>
    remaining?: { target: string; of: string; minus?: string }
    /**
     * Item-field keys to lock (render read-only) in the prefilled rows — e.g. the
     * product of a receive-goods line is dictated by the source document, so it
     * is shown as a resolved name but cannot be changed. Editable in the create
     * flow (which carries no prefill spec); only the prefilled action locks them.
     */
    lock?: string[]
}

function isPrefillSpec(v: unknown): v is PrefillSpec {
    return (
        typeof v === 'object' &&
        v !== null &&
        typeof (v as { $prefillFromRecord?: unknown }).$prefillFromRecord === 'string'
    )
}

// lineItemsDefault reads the field's declared default tolerating BOTH the
// camelCase `defaultValue` the host serves and the snake/legacy `default` the
// raw manifest carries (the kernel maps action-field `default` through without
// renaming it to `defaultValue`).
function lineItemsDefault(field: ActionFieldDef): unknown {
    const f = field as { defaultValue?: unknown; default?: unknown }
    return f.defaultValue ?? f.default
}

function toNum(v: unknown): number {
    const n = typeof v === 'number' ? v : parseFloat(String(v ?? ''))
    return Number.isFinite(n) ? n : 0
}

// applyPrefillLock marks the item-field columns named in a line-items field's
// PrefillSpec.lock as read-only, so the prefilled cells (e.g. the product of a
// receive line) render as a resolved, non-editable name. Returns the field
// untouched when there is no prefill spec or no lock list (the create flow,
// which carries no prefill, stays fully editable). The readonly flag is set on
// BOTH itemFields aliases the renderers tolerate.
function applyPrefillLock(field: ActionFieldDef): ActionFieldDef {
    const spec = lineItemsDefault(field)
    if (!isPrefillSpec(spec) || !spec.lock || spec.lock.length === 0) return field
    const lock = new Set(spec.lock)
    const f = field as ActionFieldDef & { itemFields?: any[]; item_fields?: any[] }
    const items: any[] | undefined = f.itemFields ?? f.item_fields
    if (!Array.isArray(items)) return field
    const patched: any[] = items.map((c) => (c && c.key && lock.has(c.key) ? { ...c, readonly: true } : c))
    return { ...(field as any), itemFields: patched, item_fields: patched } as ActionFieldDef
}

// buildPrefillRows projects record[spec.$prefillFromRecord] into modal rows.
function buildPrefillRows(spec: PrefillSpec, record: any): Array<Record<string, any>> {
    const src = record?.[spec.$prefillFromRecord]
    if (!Array.isArray(src)) return []
    const rows: Array<Record<string, any>> = []
    for (const item of src) {
        if (!item || typeof item !== 'object') continue
        const row: Record<string, any> = {}
        if (spec.map) {
            for (const [target, from] of Object.entries(spec.map)) row[target] = item[from]
        }
        if (spec.remaining) {
            const remaining = toNum(item[spec.remaining.of]) - (spec.remaining.minus ? toNum(item[spec.remaining.minus]) : 0)
            if (remaining <= 0) continue // line already fully satisfied → omit
            row[spec.remaining.target] = remaining
        }
        rows.push(row)
    }
    return rows
}

export function ActionModalDispatcher({
    open,
    onOpenChange,
    action,
    model,
    record,
    endpoint,
    onSuccess,
}: ActionModalProps) {
    const CustomComponent = useMemo(
        () => getActionComponent(model, action.key),
        [model, action.key],
    )

    if (CustomComponent) {
        return (
            <CustomComponent
                open={open}
                onOpenChange={onOpenChange}
                action={action}
                model={model}
                record={record}
                endpoint={endpoint}
                onSuccess={onSuccess}
            />
        )
    }

    if (action.steps && action.steps.length > 0) {
        return (
            <WizardActionModal
                open={open}
                onOpenChange={onOpenChange}
                action={action}
                model={model}
                record={record}
                endpoint={endpoint}
                onSuccess={onSuccess}
            />
        )
    }

    if (action.fields && action.fields.length > 0) {
        return (
            <GenericActionModal
                open={open}
                onOpenChange={onOpenChange}
                action={action}
                model={model}
                record={record}
                endpoint={endpoint}
                onSuccess={onSuccess}
            />
        )
    }

    if (action.confirm) {
        return (
            <ConfirmActionDialog
                open={open}
                onOpenChange={onOpenChange}
                action={action}
                model={model}
                record={record}
                endpoint={endpoint}
                onSuccess={onSuccess}
            />
        )
    }

    return null
}

function buildActionUrl(endpoint: string | undefined, model: string, recordId: string | undefined, actionKey: string) {
    // A create-placement (collection) action has no record yet, so `recordId`
    // is undefined. Omit the `/{id}` segment so the request hits the collection
    // route (`/data/:model/me/action/:action`) instead of the per-record route
    // (`/data/:model/me/:id/action/:action`), which would reject the literal
    // "undefined" as an invalid record ID (ops dynamic.go ExecuteAction → 400).
    const hasRecord = recordId != null && recordId !== '' && recordId !== 'undefined'
    if (endpoint) {
        return hasRecord ? `${endpoint}/${recordId}/action/${actionKey}` : `${endpoint}/action/${actionKey}`
    }
    return hasRecord ? `/data/${model}/me/${recordId}/action/${actionKey}` : `/data/${model}/me/action/${actionKey}`
}

function ConfirmActionDialog({ open, onOpenChange, action, model, record, endpoint, onSuccess }: ActionModalProps) {
    const { t } = useTranslation()
    const api = useApi()
    const [executing, setExecuting] = useState(false)
    // `action.label` is an addon-contributed i18n key; its locale bundle loads
    // asynchronously, so translate at render (defaultValue keeps an already
    // localized label unchanged).
    const label = t(action.label, { defaultValue: action.label })

    const execute = async () => {
        setExecuting(true)
        try {
            const url = buildActionUrl(endpoint, model, record.id, action.key)
            const res = await api.post(url, {})
            if (res.data.success) {
                toast.success(res.data.message ? t(res.data.message, { defaultValue: res.data.message }) : t('common.success'))
                onOpenChange(false)
                onSuccess()
            } else {
                toast.error(res.data.message ? t(res.data.message, { defaultValue: res.data.message }) : t('common.error'))
            }
        } catch (err: any) {
            toast.error(err?.response?.data?.message || t('common.error'))
        } finally {
            setExecuting(false)
        }
    }

    return (
        <AlertDialog open={open} onOpenChange={onOpenChange}>
            <AlertDialogContent>
                <AlertDialogHeader>
                    <AlertDialogTitle className="flex items-center gap-2">
                        <DynamicIcon name={action.icon} className="h-5 w-5" />
                        {label}
                    </AlertDialogTitle>
                    <AlertDialogDescription>
                        {action.confirmMessage || `${label}?`}
                    </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                    <AlertDialogCancel disabled={executing}>{t('common.cancel')}</AlertDialogCancel>
                    <AlertDialogAction
                        onClick={(e: React.MouseEvent) => { e.preventDefault(); execute() }}
                        disabled={executing}
                        style={action.color ? { backgroundColor: action.color } : undefined}
                    >
                        {executing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <DynamicIcon name={action.icon} className="mr-2 h-4 w-4" />}
                        {label}
                    </AlertDialogAction>
                </AlertDialogFooter>
            </AlertDialogContent>
        </AlertDialog>
    )
}

function GenericActionModal({ open, onOpenChange, action, model, record, endpoint, onSuccess }: ActionModalProps) {
    const { t } = useTranslation()
    // Addon-contributed labels (action + fields) are i18n keys whose locale
    // bundle loads asynchronously; translate at render so they don't render raw.
    // defaultValue keeps an already-localized string unchanged.
    const tl = (s: string) => t(s, { defaultValue: s })
    const api = useApi()
    const [formData, setFormData] = useState<Record<string, any>>({})
    const [executing, setExecuting] = useState(false)
    // Related records to surface BELOW the form, as read-only context for the
    // record being acted on — e.g. the reception history of a transfer while
    // receiving against it. Sourced from the model's metadata.relations (the
    // same declarative relations the detail view renders). Only row actions on a
    // real record show them; create actions (no record.id) render nothing.
    const [relations, setRelations] = useState<any[]>([])
    const recordId = record?.id
    useEffect(() => {
        let cancelled = false
        if (!open || recordId == null) {
            setRelations([])
            return
        }
        api.get(`/metadata/table/${model}`)
            .then((res) => {
                if (cancelled) return
                const rels = res?.data?.relations ?? res?.data?.data?.relations ?? []
                setRelations(Array.isArray(rels) ? rels : [])
            })
            .catch(() => {
                if (!cancelled) setRelations([])
            })
        return () => {
            cancelled = true
        }
    }, [open, model, recordId, api])

    useEffect(() => {
        if (open && action.fields) {
            const defaults: Record<string, any> = {}
            for (const field of action.fields) {
                if (isLineItemsField(field)) {
                    const dv = lineItemsDefault(field)
                    defaults[field.key] = isPrefillSpec(dv)
                        ? buildPrefillRows(dv, record)
                        : Array.isArray(dv)
                          ? dv
                          : []
                    continue
                }
                defaults[field.key] = field.defaultValue ?? (field.type === 'boolean' ? false : '')
            }
            setFormData(defaults)
        }
    }, [open, action.fields, record])

    const updateField = (key: string, value: any) => setFormData((prev: Record<string, any>) => ({ ...prev, [key]: value }))

    const execute = async () => {
        if (action.fields) {
            for (const field of action.fields) {
                if (!field.required) continue
                if (isLineItemsField(field)) {
                    const rows = formData[field.key]
                    if (!Array.isArray(rows) || rows.length === 0) {
                        toast.error(`${tl(field.label)} requiere al menos un renglón`)
                        return
                    }
                    continue
                }
                if (!formData[field.key] && formData[field.key] !== false) {
                    toast.error(`${tl(field.label)} es requerido`)
                    return
                }
            }
        }
        setExecuting(true)
        try {
            const url = buildActionUrl(endpoint, model, record.id, action.key)
            const res = await api.post(url, formData)
            if (res.data.success) {
                toast.success(res.data.message ? t(res.data.message, { defaultValue: res.data.message }) : t('common.success'))
                onOpenChange(false)
                onSuccess()
            } else {
                toast.error(res.data.message ? t(res.data.message, { defaultValue: res.data.message }) : t('common.error'))
            }
        } catch (err: any) {
            toast.error(err?.response?.data?.message || t('common.error'))
        } finally {
            setExecuting(false)
        }
    }

    // Size the modal to the form. A line-items form (the debit/credit grid of a
    // journal entry, a "receive goods" modal) needs room for its columns, so it
    // gets a roomy width; a plain field form stays compact. An explicit
    // `action.modalWidth` (number px or CSS length) overrides — the declarative
    // escape hatch. Width is applied as an inline style (guaranteed to apply,
    // unlike an arbitrary Tailwind class that the host's scan may drop), capped
    // to the viewport so it stays responsive on phones.
    const hasLineItems = useMemo(
        () => (action.fields ?? []).some(isLineItemsField),
        [action.fields],
    )
    const explicitWidth = (action as unknown as { modalWidth?: number | string }).modalWidth
    const widthPx =
        explicitWidth != null
            ? (typeof explicitWidth === 'number' ? `${explicitWidth}px` : explicitWidth)
            : hasLineItems
              ? '820px'
              : undefined

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            {/* Sticky header + footer, scrollable body: the form can grow tall
                (many line-items rows) past the viewport, so cap the dialog at
                90vh and let ONLY the field area scroll — the title and the
                Cancel/Submit actions stay pinned and always reachable. maxHeight
                is inline (guaranteed) since an arbitrary max-h-[90vh] class may be
                dropped by a consuming app's Tailwind scan. */}
            <DialogContent
                className={'flex max-h-[90vh] flex-col overflow-hidden ' + (widthPx ? '' : 'sm:max-w-xl')}
                style={{ maxHeight: '90vh', ...(widthPx ? { maxWidth: widthPx, width: '95vw' } : {}) }}
            >
                <DialogHeader className="shrink-0">
                    <DialogTitle className="flex items-center gap-2">
                        <DynamicIcon name={action.icon} className="h-5 w-5" />
                        {tl(action.label)}
                    </DialogTitle>
                    {action.confirmMessage && <DialogDescription>{action.confirmMessage}</DialogDescription>}
                </DialogHeader>
                {/* Scrollable body. The shared FieldGrid lays scalar fields out
                    in two responsive columns (single column on phones); line-items
                    grids and textareas span the full width. `min-w-0` on each cell
                    (in FieldCell) keeps a long select/input value from blowing the
                    grid past the dialog and spawning a horizontal scrollbar. */}
                <div className="-mx-1 min-h-0 flex-1 overflow-y-auto px-1 py-4">
                    <FieldGrid>
                        {action.fields?.map((field) => {
                            const fullWidth =
                                isLineItemsField(field) ||
                                resolveWidget(field) === 'textarea' ||
                                resolveWidget(field) === 'richtext'
                            return (
                                <FieldCell key={field.key} fullWidth={fullWidth}>
                                    <FieldLabel htmlFor={field.key} required={field.required}>
                                        {tl(field.label)}
                                    </FieldLabel>
                                    {renderField(field, formData[field.key], (v: any) => updateField(field.key, v), formData)}
                                </FieldCell>
                            )
                        })}
                        {relations.length > 0 && (
                            <FieldCell fullWidth>
                                <DynamicRelations record={record} relations={relations} />
                            </FieldCell>
                        )}
                    </FieldGrid>
                </div>
                <DialogFooter className="shrink-0">
                    <Button variant="outline" onClick={() => onOpenChange(false)} disabled={executing}>
                        {t('common.cancel')}
                    </Button>
                    <Button
                        onClick={execute}
                        disabled={executing}
                        style={action.color ? { backgroundColor: action.color, color: 'white' } : undefined}
                    >
                        {executing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <DynamicIcon name={action.icon} className="mr-2 h-4 w-4" />}
                        {tl(action.label)}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}

// buildFieldDefaults seeds formData for a set of action fields, honoring the
// same line-items prefill spec + boolean/empty rules GenericActionModal uses, so
// wizard steps and single-page forms initialize identically.
function buildFieldDefaults(fields: ActionFieldDef[], record: any): Record<string, any> {
    const defaults: Record<string, any> = {}
    for (const field of fields) {
        if (isLineItemsField(field)) {
            const dv = lineItemsDefault(field)
            defaults[field.key] = isPrefillSpec(dv)
                ? buildPrefillRows(dv, record)
                : Array.isArray(dv)
                  ? dv
                  : []
            continue
        }
        defaults[field.key] = field.defaultValue ?? (field.type === 'boolean' ? false : '')
    }
    return defaults
}

// validateFields returns the first validation error for a set of required
// fields, or null when they all pass. Shared by the wizard (per-step gate) and
// mirrors GenericActionModal's inline checks. `tl` localizes the field label.
function validateFields(
    fields: ActionFieldDef[],
    formData: Record<string, any>,
    tl: (s: string) => string,
): string | null {
    for (const field of fields) {
        if (!field.required) continue
        if (isLineItemsField(field)) {
            const rows = formData[field.key]
            if (!Array.isArray(rows) || rows.length === 0) {
                return `${tl(field.label)} requiere al menos un renglón`
            }
            continue
        }
        if (!formData[field.key] && formData[field.key] !== false) {
            return `${tl(field.label)} es requerido`
        }
    }
    return null
}

// WizardActionModal — the third render-path: a multi-step form. It accumulates
// every step's fields into ONE formData object and, on the final step, POSTs all
// of them to the same endpoint GenericActionModal uses (buildActionUrl). Each
// step is validated before "Siguiente" advances; a progress/step bar shows where
// the user is. Widgets are rendered by the same renderField/resolveWidget path,
// so line-items, dynamic_select, uploads and dates behave identically to a
// single-page action form — no widget is duplicated.
function WizardActionModal({ open, onOpenChange, action, model, record, endpoint, onSuccess }: ActionModalProps) {
    const { t } = useTranslation()
    const tl = (s: string) => t(s, { defaultValue: s })
    const api = useApi()
    const steps = action.steps ?? []
    const [stepIndex, setStepIndex] = useState(0)
    const [formData, setFormData] = useState<Record<string, any>>({})
    const [executing, setExecuting] = useState(false)

    // Reset to the first step and seed defaults for EVERY step's fields whenever
    // the modal (re)opens, so accumulated values from a prior run don't leak.
    useEffect(() => {
        if (!open) return
        const allFields = steps.flatMap((s) => s.fields ?? [])
        setFormData(buildFieldDefaults(allFields, record))
        setStepIndex(0)
    }, [open, action.steps, record])

    const updateField = (key: string, value: any) =>
        setFormData((prev: Record<string, any>) => ({ ...prev, [key]: value }))

    const step = steps[stepIndex]
    const isLast = stepIndex === steps.length - 1
    const stepFields = step?.fields ?? []

    const hasLineItems = useMemo(
        () => stepFields.some(isLineItemsField),
        [stepFields],
    )
    const widthPx = hasLineItems ? '820px' : undefined

    const goNext = () => {
        const err = validateFields(stepFields, formData, tl)
        if (err) {
            toast.error(err)
            return
        }
        setStepIndex((i) => Math.min(i + 1, steps.length - 1))
    }

    const goBack = () => setStepIndex((i) => Math.max(i - 1, 0))

    const submit = async () => {
        // Guard every step's required fields on final submit (a user could reach
        // the last step with an untouched earlier line-items grid otherwise).
        for (const s of steps) {
            const err = validateFields(s.fields ?? [], formData, tl)
            if (err) {
                toast.error(err)
                return
            }
        }
        setExecuting(true)
        try {
            const url = buildActionUrl(endpoint, model, record?.id, action.key)
            const res = await api.post(url, formData)
            if (res.data.success) {
                toast.success(res.data.message ? t(res.data.message, { defaultValue: res.data.message }) : t('common.success'))
                onOpenChange(false)
                onSuccess()
            } else {
                toast.error(res.data.message ? t(res.data.message, { defaultValue: res.data.message }) : t('common.error'))
            }
        } catch (err: any) {
            toast.error(err?.response?.data?.message || t('common.error'))
        } finally {
            setExecuting(false)
        }
    }

    if (steps.length === 0) return null

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent
                className={'flex max-h-[90vh] flex-col overflow-hidden ' + (widthPx ? '' : 'sm:max-w-xl')}
                style={{ maxHeight: '90vh', ...(widthPx ? { maxWidth: widthPx, width: '95vw' } : {}) }}
            >
                <DialogHeader className="shrink-0">
                    <DialogTitle className="flex items-center gap-2">
                        <DynamicIcon name={action.icon} className="h-5 w-5" />
                        {tl(action.label)}
                    </DialogTitle>
                    {/* Progress/step bar: one segment per step. The current and
                        completed segments are filled; a numbered marker + the
                        current step's title tell the user where they are. Inline
                        styles for the fill color guarantee it shows even if the
                        host's Tailwind scan drops an arbitrary class. */}
                    <div className="pt-2">
                        <div className="flex items-center gap-1.5" role="list" aria-label="progress">
                            {steps.map((s, i) => (
                                <div
                                    key={i}
                                    role="listitem"
                                    aria-current={i === stepIndex ? 'step' : undefined}
                                    className="h-1.5 flex-1 rounded-full"
                                    style={{
                                        backgroundColor: i <= stepIndex ? (action.color || 'hsl(var(--primary))') : 'hsl(var(--muted))',
                                    }}
                                />
                            ))}
                        </div>
                        <DialogDescription className="pt-2">
                            {t('common.step', { defaultValue: 'Paso' })} {stepIndex + 1}/{steps.length}
                            {step?.title ? ` · ${tl(step.title)}` : ''}
                        </DialogDescription>
                        {step?.description && (
                            <p className="pt-1 text-sm text-muted-foreground">{tl(step.description)}</p>
                        )}
                    </div>
                </DialogHeader>
                {/* Body: only the current step's fields, laid out on the same
                    shared FieldGrid the single-page form uses. Every step's values
                    persist in the one formData object, so navigating back and
                    forth keeps entries intact. */}
                <div className="-mx-1 min-h-0 flex-1 overflow-y-auto px-1 py-4">
                    <FieldGrid>
                        {stepFields.map((field) => {
                            const fullWidth =
                                isLineItemsField(field) ||
                                resolveWidget(field) === 'textarea' ||
                                resolveWidget(field) === 'richtext'
                            return (
                                <FieldCell key={field.key} fullWidth={fullWidth}>
                                    <FieldLabel htmlFor={field.key} required={field.required}>
                                        {tl(field.label)}
                                    </FieldLabel>
                                    {renderField(field, formData[field.key], (v: any) => updateField(field.key, v), formData)}
                                </FieldCell>
                            )
                        })}
                    </FieldGrid>
                </div>
                <DialogFooter className="shrink-0">
                    {/* Back is available from the second step on; Cancel closes. */}
                    {stepIndex > 0 ? (
                        <Button variant="outline" onClick={goBack} disabled={executing}>
                            {t('common.back', { defaultValue: 'Atrás' })}
                        </Button>
                    ) : (
                        <Button variant="outline" onClick={() => onOpenChange(false)} disabled={executing}>
                            {t('common.cancel')}
                        </Button>
                    )}
                    {isLast ? (
                        <Button
                            onClick={submit}
                            disabled={executing}
                            style={action.color ? { backgroundColor: action.color, color: 'white' } : undefined}
                        >
                            {executing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <DynamicIcon name={action.icon} className="mr-2 h-4 w-4" />}
                            {tl(action.label)}
                        </Button>
                    ) : (
                        <Button
                            onClick={goNext}
                            disabled={executing}
                            style={action.color ? { backgroundColor: action.color, color: 'white' } : undefined}
                        >
                            {t('common.next', { defaultValue: 'Siguiente' })}
                        </Button>
                    )}
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}

function renderField(
    field: ActionFieldDef,
    value: any,
    onChange: (value: any) => void,
    // Full current form values — lets a line-items grid (and any cascading
    // header picker) resolve a `dependsOn` reference against sibling header
    // fields. Omitted by callers that have no surrounding form (the field is
    // then treated as having no resolvable dependency).
    formValues?: Record<string, any>,
) {
    // Repeatable line-items group → row grid (value is an array of row objects).
    // The header form values flow in so a cell can depend on a header field.
    if (isLineItemsField(field)) {
        return <DynamicLineItems field={applyPrefillLock(field)} value={value} onChange={onChange} formValues={formValues} />
    }
    // Resolve the widget the same way DynamicForm does (explicit widget wins,
    // else inferred from type) so action modals and the standalone form stay in
    // lockstep — previously this switch keyed off `field.type` and silently
    // dropped `dynamic_select` to a plain text input.
    const widget = resolveWidget(field)
    if (widget === 'dynamic_select') {
        // A header-level dynamic_select may itself depend on another header
        // field; resolve its filter_value from the form context.
        const dependsValue = getDependsOn(field)
            ? resolveDependsValue(field, formValues)
            : undefined
        return <DynamicSelectField field={field} value={value} onChange={onChange} dependsValue={dependsValue} />
    }
    // File upload → themed picker that POSTs the file to the host upload
    // endpoint and stores the returned url/path. Kept in sync with DynamicForm.
    if (widget === 'upload') {
        return <UploadField field={field} value={value} onChange={onChange} />
    }
    switch (widget) {
        case 'textarea':
            return <Textarea id={field.key} value={value || ''} onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => onChange(e.target.value)} placeholder={field.placeholder} />
        case 'select':
            return (
                <Select value={value || ''} onValueChange={onChange}>
                    <SelectTrigger className="w-full"><SelectValue placeholder={field.placeholder || 'Seleccionar...'} /></SelectTrigger>
                    <SelectContent>
                        {field.options?.map((opt) => <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>)}
                    </SelectContent>
                </Select>
            )
        case 'switch':
            return <Switch id={field.key} checked={!!value} onCheckedChange={onChange} />
        case 'number':
            return <Input id={field.key} type="number" value={value ?? ''} onChange={(e: React.ChangeEvent<HTMLInputElement>) => onChange(e.target.valueAsNumber || '')} placeholder={field.placeholder} />
        case 'date':
            // Modern shadcn Calendar in a Popover (portaled, never clipped by the
            // modal) instead of the native, dated, easily-cut <input type=date>.
            return <DynamicDateField field={field} value={value} onChange={onChange} />
        default:
            return <Input id={field.key} type={field.type === 'email' ? 'email' : field.type === 'url' ? 'url' : 'text'} value={value || ''} onChange={(e: React.ChangeEvent<HTMLInputElement>) => onChange(e.target.value)} placeholder={field.placeholder} />
    }
}
