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
    Label,
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
import { DynamicSelectField } from './dynamic-select-field'
import { DynamicDateField } from './dynamic-date-field'
import { isLineItemsField, resolveWidget } from './dynamic-form-schema'
import type { ActionFieldDef } from './types'
// Canonical registry lives in @asteby/metacore-sdk
import {
    type ActionMetadata,
    type ActionModalProps,
    getActionComponent,
} from '@asteby/metacore-sdk'

export type { ActionMetadata, ActionModalProps }

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

function buildActionUrl(endpoint: string | undefined, model: string, recordId: string, actionKey: string) {
    return endpoint ? `${endpoint}/${recordId}/action/${actionKey}` : `/data/${model}/me/${recordId}/action/${actionKey}`
}

function ConfirmActionDialog({ open, onOpenChange, action, model, record, endpoint, onSuccess }: ActionModalProps) {
    const { t } = useTranslation()
    const api = useApi()
    const [executing, setExecuting] = useState(false)

    const execute = async () => {
        setExecuting(true)
        try {
            const url = buildActionUrl(endpoint, model, record.id, action.key)
            const res = await api.post(url, {})
            if (res.data.success) {
                toast.success(res.data.message || t('common.success'))
                onOpenChange(false)
                onSuccess()
            } else {
                toast.error(res.data.message || t('common.error'))
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
                        {action.label}
                    </AlertDialogTitle>
                    <AlertDialogDescription>
                        {action.confirmMessage || `${action.label}?`}
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
                        {action.label}
                    </AlertDialogAction>
                </AlertDialogFooter>
            </AlertDialogContent>
        </AlertDialog>
    )
}

function GenericActionModal({ open, onOpenChange, action, model, record, endpoint, onSuccess }: ActionModalProps) {
    const { t } = useTranslation()
    const api = useApi()
    const [formData, setFormData] = useState<Record<string, any>>({})
    const [executing, setExecuting] = useState(false)

    useEffect(() => {
        if (open && action.fields) {
            const defaults: Record<string, any> = {}
            for (const field of action.fields) {
                if (isLineItemsField(field)) {
                    defaults[field.key] = field.defaultValue ?? []
                    continue
                }
                defaults[field.key] = field.defaultValue ?? (field.type === 'boolean' ? false : '')
            }
            setFormData(defaults)
        }
    }, [open, action.fields])

    const updateField = (key: string, value: any) => setFormData((prev: Record<string, any>) => ({ ...prev, [key]: value }))

    const execute = async () => {
        if (action.fields) {
            for (const field of action.fields) {
                if (!field.required) continue
                if (isLineItemsField(field)) {
                    const rows = formData[field.key]
                    if (!Array.isArray(rows) || rows.length === 0) {
                        toast.error(`${field.label} requiere al menos un renglón`)
                        return
                    }
                    continue
                }
                if (!formData[field.key] && formData[field.key] !== false) {
                    toast.error(`${field.label} es requerido`)
                    return
                }
            }
        }
        setExecuting(true)
        try {
            const url = buildActionUrl(endpoint, model, record.id, action.key)
            const res = await api.post(url, formData)
            if (res.data.success) {
                toast.success(res.data.message || t('common.success'))
                onOpenChange(false)
                onSuccess()
            } else {
                toast.error(res.data.message || t('common.error'))
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
            <DialogContent
                className={widthPx ? '' : 'sm:max-w-lg'}
                style={widthPx ? { maxWidth: widthPx, width: '95vw' } : undefined}
            >
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <DynamicIcon name={action.icon} className="h-5 w-5" />
                        {action.label}
                    </DialogTitle>
                    {action.confirmMessage && <DialogDescription>{action.confirmMessage}</DialogDescription>}
                </DialogHeader>
                {/* Responsive 2-column grid: scalar fields (journal, date,
                    reference) flow side-by-side instead of one tall vertical
                    stack; line-items grids and textareas span the full width so
                    they get room. Mirrors DynamicForm's pro layout — driven only
                    by field shape, fully declarative. */}
                <div className="grid gap-4 py-4 sm:grid-cols-2">
                    {action.fields?.map((field) => {
                        const fullWidth =
                            isLineItemsField(field) ||
                            resolveWidget(field) === 'textarea' ||
                            resolveWidget(field) === 'richtext'
                        return (
                            <div
                                key={field.key}
                                className={'grid gap-2 ' + (fullWidth ? 'sm:col-span-2' : '')}
                            >
                                <Label htmlFor={field.key}>
                                    {field.label}
                                    {field.required && <span className="text-red-500 ml-1">*</span>}
                                </Label>
                                {renderField(field, formData[field.key], (v: any) => updateField(field.key, v))}
                            </div>
                        )
                    })}
                </div>
                <DialogFooter>
                    <Button variant="outline" onClick={() => onOpenChange(false)} disabled={executing}>
                        {t('common.cancel')}
                    </Button>
                    <Button
                        onClick={execute}
                        disabled={executing}
                        style={action.color ? { backgroundColor: action.color, color: 'white' } : undefined}
                    >
                        {executing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <DynamicIcon name={action.icon} className="mr-2 h-4 w-4" />}
                        {action.label}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}

function renderField(
    field: ActionFieldDef,
    value: any,
    onChange: (value: any) => void,
) {
    // Repeatable line-items group → row grid (value is an array of row objects).
    if (isLineItemsField(field)) {
        return <DynamicLineItems field={field} value={value} onChange={onChange} />
    }
    // Resolve the widget the same way DynamicForm does (explicit widget wins,
    // else inferred from type) so action modals and the standalone form stay in
    // lockstep — previously this switch keyed off `field.type` and silently
    // dropped `dynamic_select` to a plain text input.
    const widget = resolveWidget(field)
    if (widget === 'dynamic_select') {
        return <DynamicSelectField field={field} value={value} onChange={onChange} />
    }
    switch (widget) {
        case 'textarea':
            return <Textarea id={field.key} value={value || ''} onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => onChange(e.target.value)} placeholder={field.placeholder} />
        case 'select':
            return (
                <Select value={value || ''} onValueChange={onChange}>
                    <SelectTrigger><SelectValue placeholder={field.placeholder || 'Seleccionar...'} /></SelectTrigger>
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
