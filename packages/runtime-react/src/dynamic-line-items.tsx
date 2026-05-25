// DynamicLineItems — renders a repeatable line-items group: a table/grid of
// rows where each column is one of the field's `itemFields` (the v3
// `item_fields`). Powers declarative multi-line action modals (e.g. the item
// rows of a "Recibir mercancía" modal, or the debit/credit lines of a journal
// entry) without needing a custom federated modal.
//
// The value is an array of row objects keyed by the item field keys. Add/remove
// row controls mutate the array; each cell is a widget resolved via
// `resolveWidget`, matching the flat-field renderer in dynamic-form.tsx.
import {
    Input,
    Textarea,
    Switch,
    Button,
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@asteby/metacore-ui/primitives'
import { Plus, Trash2 } from 'lucide-react'
import type { ActionFieldDef } from './types'
import { resolveWidget, getItemFields } from './dynamic-form-schema'
import { useOptionsResolver, type ResolvedOption } from './use-options-resolver'

export interface DynamicLineItemsProps {
    field: ActionFieldDef
    value: any[] | undefined
    onChange: (rows: any[]) => void
    disabled?: boolean
}

function emptyRow(itemFields: ActionFieldDef[]): Record<string, any> {
    const row: Record<string, any> = {}
    for (const f of itemFields) {
        row[f.key] = f.defaultValue ?? (f.type === 'boolean' ? false : '')
    }
    return row
}

export function DynamicLineItems({ field, value, onChange, disabled = false }: DynamicLineItemsProps) {
    const itemFields = getItemFields(field)
    const rows: any[] = Array.isArray(value) ? value : []

    const addRow = () => onChange([...rows, emptyRow(itemFields)])
    const removeRow = (idx: number) => onChange(rows.filter((_, i) => i !== idx))
    const updateCell = (idx: number, key: string, cellValue: any) =>
        onChange(rows.map((r, i) => (i === idx ? { ...r, [key]: cellValue } : r)))

    return (
        <div className="grid gap-2" data-widget="line_items">
            <div className="overflow-x-auto rounded-md border">
                <table className="w-full text-sm">
                    <thead className="bg-muted/50">
                        <tr>
                            {itemFields.map((col) => (
                                <th key={col.key} className="px-3 py-2 text-left font-medium">
                                    {col.label}
                                    {col.required && <span className="text-red-500 ml-1">*</span>}
                                </th>
                            ))}
                            <th className="w-12 px-3 py-2" aria-label="acciones" />
                        </tr>
                    </thead>
                    <tbody>
                        {rows.length === 0 && (
                            <tr>
                                <td
                                    colSpan={itemFields.length + 1}
                                    className="px-3 py-4 text-center text-muted-foreground"
                                >
                                    Sin renglones
                                </td>
                            </tr>
                        )}
                        {rows.map((row, idx) => (
                            <tr key={idx} className="border-t align-top">
                                {itemFields.map((col) => (
                                    <td key={col.key} className="px-2 py-1.5">
                                        <CellRenderer
                                            field={col}
                                            value={row?.[col.key]}
                                            onChange={(v: any) => updateCell(idx, col.key, v)}
                                            disabled={disabled}
                                        />
                                    </td>
                                ))}
                                <td className="px-2 py-1.5 text-center">
                                    <Button
                                        type="button"
                                        variant="ghost"
                                        size="icon"
                                        onClick={() => removeRow(idx)}
                                        disabled={disabled}
                                        aria-label="Eliminar renglón"
                                    >
                                        <Trash2 className="h-4 w-4 text-red-500" />
                                    </Button>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
            <div>
                <Button type="button" variant="outline" size="sm" onClick={addRow} disabled={disabled}>
                    <Plus className="mr-1 h-4 w-4" />
                    Agregar renglón
                </Button>
            </div>
        </div>
    )
}

interface CellRendererProps {
    field: ActionFieldDef
    value: any
    onChange: (v: any) => void
    disabled?: boolean
}

// Per-cell widget. Mirrors the flat FieldRenderer in dynamic-form.tsx but
// without the per-field Label (the column header is the label) and sized for a
// table cell. Nested line-items inside a row are not supported (a row column is
// a scalar widget).
function CellRenderer({ field, value, onChange, disabled }: CellRendererProps) {
    const widget = resolveWidget(field)
    if (widget === 'select' && field.ref) {
        return <RefCell field={field} value={value} onChange={onChange} disabled={disabled} />
    }
    switch (widget) {
        case 'textarea':
        case 'richtext':
            return (
                <Textarea
                    value={value || ''}
                    onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => onChange(e.target.value)}
                    placeholder={field.placeholder}
                    disabled={disabled}
                    rows={2}
                />
            )
        case 'color':
            return (
                <Input
                    type="color"
                    value={value || '#000000'}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => onChange(e.target.value)}
                    disabled={disabled}
                />
            )
        case 'select':
            return (
                <Select value={value || ''} onValueChange={onChange} disabled={disabled}>
                    <SelectTrigger>
                        <SelectValue placeholder={field.placeholder || 'Seleccionar...'} />
                    </SelectTrigger>
                    <SelectContent>
                        {field.options?.map((opt) => (
                            <SelectItem key={opt.value} value={opt.value}>
                                {opt.label}
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>
            )
        case 'switch':
            return <Switch checked={!!value} onCheckedChange={onChange} disabled={disabled} />
        case 'number':
            return (
                <Input
                    type="number"
                    value={value ?? ''}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => onChange(e.target.valueAsNumber || '')}
                    placeholder={field.placeholder}
                    disabled={disabled}
                />
            )
        case 'date':
            return (
                <Input
                    type="date"
                    value={value || ''}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => onChange(e.target.value)}
                    disabled={disabled}
                />
            )
        default:
            return (
                <Input
                    type={field.type === 'email' ? 'email' : field.type === 'url' ? 'url' : 'text'}
                    value={value || ''}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => onChange(e.target.value)}
                    placeholder={field.placeholder}
                    disabled={disabled}
                />
            )
    }
}

function RefCell({ field, value, onChange, disabled }: CellRendererProps) {
    const { options, loading } = useOptionsResolver({
        modelKey: '',
        fieldKey: 'id',
        ref: field.ref,
    })
    return (
        <Select value={value || ''} onValueChange={onChange} disabled={disabled || loading}>
            <SelectTrigger>
                <SelectValue placeholder={loading ? 'Cargando…' : field.placeholder || 'Seleccionar...'} />
            </SelectTrigger>
            <SelectContent>
                {options.map((opt: ResolvedOption) => (
                    <SelectItem key={String(opt.id)} value={String(opt.id)}>
                        {opt.label}
                    </SelectItem>
                ))}
            </SelectContent>
        </Select>
    )
}
