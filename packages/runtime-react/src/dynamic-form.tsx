// Minimal standalone DynamicForm. Factored from the dynamic-record-dialog
// pattern + ActionFieldDef renderer so callers can reuse the form layout
// outside the full record-edit modal.
import { useEffect, useMemo, useState } from 'react'
import {
    Input,
    Textarea,
    Label,
    Switch,
    Button,
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@asteby/metacore-ui/primitives'
import type { ActionFieldDef } from './types'
import { buildZodSchema, resolveWidget } from './dynamic-form-schema'

export { buildZodSchema, resolveWidget }

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
    const [errors, setErrors] = useState<Record<string, string>>({})
    const [submitting, setSubmitting] = useState(false)

    const schema = useMemo(() => buildZodSchema(fields), [fields])

    useEffect(() => {
        const defaults: Record<string, any> = {}
        for (const f of fields) {
            defaults[f.key] = initialValues?.[f.key] ?? f.defaultValue ?? (f.type === 'boolean' ? false : '')
        }
        setValues(defaults)
        setErrors({})
    }, [fields, initialValues])

    const update = (k: string, v: any) =>
        setValues((prev: Record<string, any>) => ({ ...prev, [k]: v }))

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        const result = schema.safeParse(values)
        if (!result.success) {
            const next: Record<string, string> = {}
            for (const issue of result.error.issues) {
                const key = issue.path[0]
                if (typeof key === 'string' && !next[key]) next[key] = issue.message
            }
            setErrors(next)
            return
        }
        setErrors({})
        setSubmitting(true)
        try { await onSubmit(result.data as Record<string, any>) } finally { setSubmitting(false) }
    }

    return (
        <form onSubmit={handleSubmit} className="grid gap-4">
            {fields.map((field) => (
                <div key={field.key} className="grid gap-2">
                    <Label htmlFor={field.key}>
                        {field.label}
                        {field.required && <span className="text-red-500 ml-1">*</span>}
                    </Label>
                    {renderField(field, values[field.key], (v: any) => update(field.key, v))}
                    {errors[field.key] && (
                        <span className="text-red-500 text-sm" role="alert">{errors[field.key]}</span>
                    )}
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
    const widget = resolveWidget(field)
    switch (widget) {
        case 'textarea':
            return <Textarea id={field.key} value={value || ''} onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => onChange(e.target.value)} placeholder={field.placeholder} />
        case 'richtext':
            // Until a real rich-text primitive lands in metacore-ui this maps
            // to a tagged Textarea. The data attribute lets app-level theming
            // / future MDX editor pick it up without breaking the contract.
            return <Textarea id={field.key} data-widget="richtext" value={value || ''} onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => onChange(e.target.value)} placeholder={field.placeholder} />
        case 'color':
            return <Input id={field.key} type="color" value={value || '#000000'} onChange={(e: React.ChangeEvent<HTMLInputElement>) => onChange(e.target.value)} />
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
            return <Input id={field.key} type="date" value={value || ''} onChange={(e: React.ChangeEvent<HTMLInputElement>) => onChange(e.target.value)} />
        default:
            return <Input id={field.key} type={field.type === 'email' ? 'email' : field.type === 'url' ? 'url' : 'text'} value={value || ''} onChange={(e: React.ChangeEvent<HTMLInputElement>) => onChange(e.target.value)} placeholder={field.placeholder} />
    }
}

