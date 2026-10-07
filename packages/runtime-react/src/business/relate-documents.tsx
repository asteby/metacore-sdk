// RelateDocuments — relaciona uno o más documentos origen (CFDI) desde un
// formulario: nota de crédito, devolución, sustitución. El valor es DATO
// (`related_document_id`, `relation_type`, UUID/folio para mostrar), no un flujo
// de un solo módulo. El SDK no embebe catálogos fiscales: los tipos de relación
// (p. ej. SAT 01/03/04) llegan por la prop `relationTypes`.
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link2, X } from 'lucide-react'
import { Badge, Button } from '@asteby/metacore-ui'
import { RecordPicker, useLatestSearch } from '../record-picker'

export interface RelatableDocument {
    id: string
    /** UUID fiscal (CFDI), cuando ya está timbrado. */
    uuid?: string
    folio?: string
    /** Texto libre para mostrar («Factura A-120 · Cliente X»). */
    label?: string
    total?: number
}

export interface RelationTypeOption {
    /** Clave que viaja en `relation_type` (p. ej. `"01"`). */
    value: string
    label: string
}

/** Un documento relacionado: lo que el formulario guarda. */
export interface RelatedDocument {
    related_document_id: string
    relation_type: string
    /** Solo para mostrar. */
    uuid?: string
    folio?: string
    label?: string
}

export interface RelateDocumentsProps {
    value: RelatedDocument[]
    onChange: (value: RelatedDocument[]) => void
    /** Catálogo de tipos de relación (lo aporta el addon). */
    relationTypes: RelationTypeOption[]
    /** Búsqueda de documentos origen. */
    search: (q: string, signal: AbortSignal) => Promise<RelatableDocument[]>
    /** Tipo preseleccionado al agregar. Default: el primero del catálogo. */
    defaultRelationType?: string
    /** Máximo de documentos relacionados. Sin tope por defecto. */
    max?: number
    disabled?: boolean
    placeholder?: string
}

function docTitle(d: { folio?: string; label?: string; uuid?: string; id?: string }): string {
    return d.label || d.folio || d.uuid || d.id || ''
}

export function RelateDocuments({
    value,
    onChange,
    relationTypes,
    search,
    defaultRelationType,
    max,
    disabled,
    placeholder,
}: RelateDocumentsProps) {
    const { t } = useTranslation()
    const [text, setText] = useState('')
    const [open, setOpen] = useState(false)
    const [pendingType, setPendingType] = useState<string>(defaultRelationType ?? relationTypes[0]?.value ?? '')
    const searchFn = useLatestSearch(search)
    const full = max != null && value.length >= max
    const typeLabel = (v: string) => relationTypes.find((r) => r.value === v)?.label ?? v

    const add = (d: RelatableDocument) => {
        if (full || value.some((x) => x.related_document_id === d.id)) return
        onChange([
            ...value,
            { related_document_id: d.id, relation_type: pendingType, uuid: d.uuid, folio: d.folio, label: d.label },
        ])
        setText('')
    }
    const remove = (id: string) => onChange(value.filter((x) => x.related_document_id !== id))
    const setType = (id: string, relation_type: string) =>
        onChange(value.map((x) => (x.related_document_id === id ? { ...x, relation_type } : x)))

    const selectCls = 'h-9 rounded-md border bg-background px-2 text-sm'

    return (
        <div data-slot="relate-documents" className="space-y-2">
            {value.length > 0 && (
                <ul className="divide-y rounded-md border">
                    {value.map((d) => (
                        <li key={d.related_document_id} className="flex flex-wrap items-center gap-2 px-2 py-1.5">
                            <Link2 className="size-4 text-muted-foreground" aria-hidden />
                            <div className="min-w-0 flex-1">
                                <p className="truncate text-sm font-medium">{docTitle({ folio: d.folio, label: d.label, id: d.related_document_id })}</p>
                                {d.uuid && <p className="break-all font-mono text-xs text-muted-foreground">{d.uuid}</p>}
                            </div>
                            <select
                                className={selectCls}
                                disabled={disabled}
                                value={d.relation_type}
                                aria-label={t('relateDocuments.type', { defaultValue: 'Tipo de relación' })}
                                onChange={(e) => setType(d.related_document_id, e.target.value)}
                            >
                                {!relationTypes.some((r) => r.value === d.relation_type) && (
                                    <option value={d.relation_type}>{typeLabel(d.relation_type)}</option>
                                )}
                                {relationTypes.map((r) => (
                                    <option key={r.value} value={r.value}>{r.label}</option>
                                ))}
                            </select>
                            {!disabled && (
                                <Button type="button" size="icon" variant="ghost" onClick={() => remove(d.related_document_id)} aria-label={t('relateDocuments.remove', { defaultValue: 'Quitar relación' })}>
                                    <X className="size-4" />
                                </Button>
                            )}
                        </li>
                    ))}
                </ul>
            )}

            {!full && !disabled && (
                // La búsqueda de documentos es el mismo <RecordPicker> de toda la
                // plataforma (lista en portal, teclado, estados).
                <RecordPicker<RelatableDocument>
                    trigger="input"
                    search={searchFn}
                    minChars={2}
                    query={text}
                    onQueryChange={setText}
                    open={open}
                    onOpenChange={setOpen}
                    getKey={(d) => d.id}
                    getLabel={docTitle}
                    isItemDisabled={(d) => value.some((x) => x.related_document_id === d.id)}
                    renderItem={(d, { disabled: already }) => (
                        <span className="flex w-full min-w-0 items-center justify-between gap-2">
                            <span className="min-w-0">
                                <span className="block truncate text-sm font-medium">{docTitle(d)}</span>
                                {d.uuid && <span className="block break-all font-mono text-xs text-muted-foreground">{d.uuid}</span>}
                            </span>
                            {already && <Badge variant="muted">{t('relateDocuments.added', { defaultValue: 'Agregado' })}</Badge>}
                        </span>
                    )}
                    onSelect={add}
                    placeholder={placeholder ?? t('relateDocuments.placeholder', { defaultValue: 'Buscar por folio o UUID' })}
                    loadingText={t('common.searching', { defaultValue: 'Buscando…' })}
                    errorText={t('relateDocuments.error', { defaultValue: 'No se pudo buscar documentos. Inténtalo de nuevo.' })}
                    emptyText={t('relateDocuments.empty', { defaultValue: 'No encontramos ese documento.' })}
                    after={
                        <select
                            className={selectCls}
                            value={pendingType}
                            aria-label={t('relateDocuments.newType', { defaultValue: 'Tipo para el documento nuevo' })}
                            onChange={(e) => setPendingType(e.target.value)}
                        >
                            {relationTypes.map((r) => (
                                <option key={r.value} value={r.value}>{r.label}</option>
                            ))}
                        </select>
                    }
                />
            )}
        </div>
    )
}

/** Valor a enviar al servidor: solo los datos, sin los campos de visualización. */
export function serializeRelatedDocuments(value: RelatedDocument[]): Array<Pick<RelatedDocument, 'related_document_id' | 'relation_type'>> {
    return value.map(({ related_document_id, relation_type }) => ({ related_document_id, relation_type }))
}
