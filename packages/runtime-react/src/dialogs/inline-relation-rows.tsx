// InlineRelationRows — tabla editable de filas borrador para UNA relación
// `create_inline` al crear el padre. Controlado: `rows`/`onChange`; el envío
// (`_children`) y la validación viven en el modal. Sobre el núcleo compartido
// con las partidas de documento: `draft-rows.ts` (claves, errores `"i.campo"`).
import { useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Plus, Trash2 } from 'lucide-react'
import { Button } from '@asteby/metacore-ui/primitives'
import { localizeFieldLabel } from '../dynamic-columns-helpers'
import {
    appendDraftRow,
    cellErrorKey,
    makeDraftRow,
    removeDraftRow,
    updateDraftCell,
    type DraftRow,
} from '../draft-rows'
import { relationMin, type InlineFieldMeta } from './inline-relations'
import type { RelationMeta } from '../types'

export interface InlineRelationRowsProps {
    relation: Pick<RelationMeta, 'name' | 'label' | 'min'>
    fields: InlineFieldMeta[]
    rows: DraftRow[]
    onChange: (rows: DraftRow[]) => void
    /** Errores por celda `"<i>.<campo>"` y por fila `"<i>"`. */
    errors?: Record<string, string>
    /** Error de conjunto (mínimo de filas, 422 `min`). */
    formError?: string
    /** Se avisa al quitar una fila: los índices de los errores del servidor ya no valen. */
    onRowRemoved?: () => void
    /** Se avisa al editar una celda (para limpiar su error). */
    onCellEdited?: (index: number, field: string) => void
    disabled?: boolean
    /** Pinta el control de una celda (el modal inyecta su `EditField`). */
    renderField: (
        field: InlineFieldMeta,
        value: any,
        onChange: (v: any) => void,
        state: { invalid: boolean; error?: string },
    ) => ReactNode
}

const TOUCH = 'min-h-11 min-w-11'
const CONTROLS = 'input, select, textarea, button[role="combobox"]'

function blankValues(fields: InlineFieldMeta[]): Record<string, any> {
    const v: Record<string, any> = {}
    for (const f of fields) v[f.key] = f.defaultValue ?? ''
    return v
}

export function InlineRelationRows({
    relation,
    fields,
    rows,
    onChange,
    errors = {},
    formError,
    onRowRemoved,
    onCellEdited,
    disabled,
    renderField,
}: InlineRelationRowsProps) {
    const { t } = useTranslation()
    const uid = useId()
    const min = relationMin(relation)
    const title = relation.label || relation.name
    const tableRef = useRef<HTMLTableElement>(null)
    const addRef = useRef<HTMLButtonElement>(null)
    const [focusKey, setFocusKey] = useState<string | null>(null)
    const [announce, setAnnounce] = useState('')

    // Tras agregar: foco al primer control de la fila nueva.
    useEffect(() => {
        if (!focusKey) return
        const row = tableRef.current?.querySelector<HTMLElement>(`tr[data-row-key="${focusKey}"]`)
        row?.querySelector<HTMLElement>(CONTROLS)?.focus()
        setFocusKey(null)
    }, [focusKey, rows])

    const addRow = () => {
        const row = makeDraftRow(blankValues(fields))
        onChange(appendDraftRow(rows, row))
        setFocusKey(row.key)
        setAnnounce(t('inlineRelation.added', { defaultValue: 'Fila agregada. {{count}} en total', count: rows.length + 1 }))
    }

    const removeRow = (row: DraftRow, index: number) => {
        onChange(removeDraftRow(rows, row.key))
        onRowRemoved?.()
        setAnnounce(
            t('inlineRelation.removed', { defaultValue: 'Fila {{n}} eliminada. {{count}} en total', n: index + 1, count: rows.length - 1 }),
        )
        // La fila con el foco desaparece: el foco pasa al botón de agregar.
        requestAnimationFrame(() => addRef.current?.focus())
    }

    // Enter en una celda nunca envía el padre: avanza al siguiente control y, al
    // final de la última fila, agrega una fila (como el editor de partidas).
    const onKeyDown = (e: KeyboardEvent<HTMLTableElement>) => {
        if (e.key !== 'Enter' || e.defaultPrevented) return
        const target = e.target as HTMLElement
        if (target.tagName !== 'INPUT' || target.getAttribute('role') === 'combobox') return
        e.preventDefault()
        const controls = Array.from(tableRef.current?.querySelectorAll<HTMLElement>(CONTROLS) ?? []).filter(
            (el) => !(el as HTMLInputElement).disabled,
        )
        const next = controls[controls.indexOf(target) + 1]
        if (next) next.focus()
        else if (!disabled) addRow()
    }

    const headId = (key: string) => `${uid}-h-${key}`
    const countText =
        min > 0
            ? t('inlineRelation.countMin', {
                  defaultValue: '{{count}} de {{min}} como mínimo',
                  count: rows.length,
                  min,
              })
            : undefined
    const formErrorId = `${uid}-err`

    return (
        <section
            data-slot="inline-relation-rows"
            data-relation={relation.name}
            aria-labelledby={`${uid}-title`}
            className="space-y-2"
        >
            <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                    <h3 id={`${uid}-title`} className="text-sm font-semibold text-foreground">
                        {title}
                    </h3>
                    {countText && (
                        <p className={`text-xs ${formError ? 'text-destructive' : 'text-muted-foreground'}`}>{countText}</p>
                    )}
                </div>
                <Button
                    ref={addRef}
                    type="button"
                    variant="outline"
                    className={TOUCH}
                    onClick={addRow}
                    disabled={disabled}
                >
                    <Plus className="size-4" aria-hidden />
                    {t('inlineRelation.add', { defaultValue: 'Agregar' })}
                </Button>
            </div>

            {rows.length === 0 ? (
                <div className="rounded-lg border border-dashed bg-muted/20 px-4 py-6 text-center text-sm text-muted-foreground">
                    {min > 0
                        ? t('inlineRelation.emptyMin', {
                              defaultValue: 'Aún no hay filas. Agrega al menos {{min}}.',
                              min,
                          })
                        : t('inlineRelation.empty', { defaultValue: 'Aún no hay filas. Puedes agregarlas ahora o después.' })}
                </div>
            ) : (
                <div className="overflow-x-auto rounded-lg border bg-card/40">
                    <table
                        ref={tableRef}
                        onKeyDown={onKeyDown}
                        className="w-full border-collapse text-sm"
                        aria-label={title}
                        aria-describedby={formError ? formErrorId : undefined}
                    >
                        <thead className="border-b bg-muted/40 text-left text-xs font-medium text-muted-foreground">
                            <tr>
                                {fields.map((f) => (
                                    <th key={f.key} id={headId(f.key)} scope="col" className="px-3 py-2 font-medium">
                                        {localizeFieldLabel(f.label, t)}
                                        {f.required && <span className="ml-0.5 text-destructive" aria-hidden>*</span>}
                                    </th>
                                ))}
                                <th scope="col" className="w-14 px-2 py-2">
                                    <span className="sr-only">{t('inlineRelation.actions', { defaultValue: 'Acciones' })}</span>
                                </th>
                            </tr>
                        </thead>
                        <tbody>
                            {rows.map((row, i) => {
                                const rowError = errors[String(i)]
                                return (
                                    <tr key={row.key} data-row-key={row.key} className="border-b last:border-b-0 align-top">
                                        {fields.map((f) => {
                                            const error = errors[cellErrorKey(i, f.key)]
                                            const label = localizeFieldLabel(f.label, t)
                                            return (
                                                <td key={f.key} className="min-w-36 px-2 py-1.5">
                                                    <div
                                                        role="group"
                                                        aria-label={t('inlineRelation.cellLabel', {
                                                            defaultValue: '{{field}}, fila {{n}}',
                                                            field: label,
                                                            n: i + 1,
                                                        })}
                                                        data-aby-field={f.key}
                                                    >
                                                        {renderField(
                                                            f,
                                                            row.values[f.key] ?? '',
                                                            (v) => {
                                                                onChange(updateDraftCell(rows, row.key, f.key, v))
                                                                onCellEdited?.(i, f.key)
                                                            },
                                                            { invalid: !!error, error },
                                                        )}
                                                    </div>
                                                    {error && <p className="mt-1 text-xs text-destructive">{error}</p>}
                                                </td>
                                            )
                                        })}
                                        <td className="px-2 py-1.5 text-right">
                                            <Button
                                                type="button"
                                                variant="ghost"
                                                size="icon"
                                                className={`${TOUCH} text-muted-foreground hover:text-destructive`}
                                                onClick={() => removeRow(row, i)}
                                                disabled={disabled}
                                                aria-label={t('inlineRelation.remove', {
                                                    defaultValue: 'Quitar fila {{n}}',
                                                    n: i + 1,
                                                })}
                                            >
                                                <Trash2 className="size-4" aria-hidden />
                                            </Button>
                                            {rowError && (
                                                <p className="mt-1 text-xs text-destructive" role="alert">
                                                    {rowError}
                                                </p>
                                            )}
                                        </td>
                                    </tr>
                                )
                            })}
                        </tbody>
                    </table>
                </div>
            )}

            {formError && (
                <p id={formErrorId} role="alert" className="text-xs text-destructive">
                    {formError}
                </p>
            )}
            <p className="sr-only" role="status" aria-live="polite">
                {announce}
            </p>
        </section>
    )
}
