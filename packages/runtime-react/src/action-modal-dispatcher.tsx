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
                defaults[field.key] = field.defaultValue ?? (field.type === 'boolean' ? false : '')
            }
            setFormData(defaults)
        }
    }, [open, action.fields])

    const updateField = (key: string, value: any) => setFormData((prev: Record<string, any>) => ({ ...prev, [key]: value }))

    const execute = async () => {
        if (action.fields) {
            for (const field of action.fields) {
                if (field.required && !formData[field.key] && formData[field.key] !== false) {
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

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-lg">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <DynamicIcon name={action.icon} className="h-5 w-5" />
                        {action.label}
                    </DialogTitle>
                    {action.confirmMessage && <DialogDescription>{action.confirmMessage}</DialogDescription>}
                </DialogHeader>
                <div className="grid gap-4 py-4">
                    {action.fields?.map((field) => (
                        <div key={field.key} className="grid gap-2">
                            <Label htmlFor={field.key}>
                                {field.label}
                                {field.required && <span className="text-red-500 ml-1">*</span>}
                            </Label>
                            {renderField(field, formData[field.key], (v: any) => updateField(field.key, v))}
                        </div>
                    ))}
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
    field: { key: string; type: string; options?: { value: string; label: string }[]; placeholder?: string },
    value: any,
    onChange: (value: any) => void,
) {
    switch (field.type) {
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
        case 'boolean':
            return <Switch id={field.key} checked={!!value} onCheckedChange={onChange} />
        case 'number':
            return <Input id={field.key} type="number" value={value ?? ''} onChange={(e: React.ChangeEvent<HTMLInputElement>) => onChange(e.target.valueAsNumber || '')} placeholder={field.placeholder} />
        case 'date':
            return <Input id={field.key} type="date" value={value || ''} onChange={(e: React.ChangeEvent<HTMLInputElement>) => onChange(e.target.value)} />
        default:
            return <Input id={field.key} type={field.type === 'email' ? 'email' : field.type === 'url' ? 'url' : 'text'} value={value || ''} onChange={(e: React.ChangeEvent<HTMLInputElement>) => onChange(e.target.value)} placeholder={field.placeholder} />
    }
}
