// Minimal standalone DynamicForm. Neither host ships a dedicated component —
// the existing "dynamic-record-dialog" inlines form rendering. This file
// factors a reusable <DynamicForm> out of that pattern + the ActionFieldDef
// renderer. Consumes `fields[]` from a manifest.
import { useEffect, useState } from 'react'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Button } from '@/components/ui/button'
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select'
import type { ActionFieldDef } from './types'

export interface DynamicFormProps {
    fields: ActionFieldDef[]
    initialValues?: Record<string, any>
    onSubmit: (values: Record<string, any>) => void | Promise<void>
    onCancel?: () => void
    submitLabel?: string
    cancelLabel?: string
    disabled?: boolean
}

export function DynamicForm({
    fields,
    initialValues,
    onSubmit,
    onCancel,
    submitLabel = 'Guardar',
    cancelLabel = 'Cancelar',
    disabled = false,
}: DynamicFormProps) {
    const [values, setValues] = useState<Record<string, any>>({})
    const [submitting, setSubmitting] = useState(false)

    useEffect(() => {
        const defaults: Record<string, any> = {}
        for (const f of fields) {
            defaults[f.key] = initialValues?.[f.key] ?? f.defaultValue ?? (f.type === 'boolean' ? false : '')
        }
        setValues(defaults)
    }, [fields, initialValues])

    const update = (k: string, v: any) => setValues(prev => ({ ...prev, [k]: v }))

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        for (const f of fields) {
            if (f.required && !values[f.key] && values[f.key] !== false) {
                alert(`${f.label} es requerido`)
                return
            }
        }
        setSubmitting(true)
        try { await onSubmit(values) } finally { setSubmitting(false) }
    }

    return (
        <form onSubmit={handleSubmit} className="grid gap-4">
            {fields.map((field) => (
                <div key={field.key} className="grid gap-2">
                    <Label htmlFor={field.key}>
                        {field.label}
                        {field.required && <span className="text-red-500 ml-1">*</span>}
                    </Label>
                    {renderField(field, values[field.key], (v) => update(field.key, v))}
                </div>
            ))}
            <div className="flex justify-end gap-2 pt-2">
                {onCancel && (
                    <Button type="button" variant="outline" onClick={onCancel} disabled={submitting || disabled}>
                        {cancelLabel}
                    </Button>
                )}
                <Button type="submit" disabled={submitting || disabled}>{submitLabel}</Button>
            </div>
        </form>
    )
}

function renderField(field: ActionFieldDef, value: any, onChange: (v: any) => void) {
    switch (field.type) {
        case 'textarea':
            return <Textarea id={field.key} value={value || ''} onChange={(e) => onChange(e.target.value)} placeholder={field.placeholder} />
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
            return <Input id={field.key} type="number" value={value ?? ''} onChange={(e) => onChange(e.target.valueAsNumber || '')} placeholder={field.placeholder} />
        case 'date':
            return <Input id={field.key} type="date" value={value || ''} onChange={(e) => onChange(e.target.value)} />
        default:
            return <Input id={field.key} type={field.type === 'email' ? 'email' : field.type === 'url' ? 'url' : 'text'} value={value || ''} onChange={(e) => onChange(e.target.value)} placeholder={field.placeholder} />
    }
}
