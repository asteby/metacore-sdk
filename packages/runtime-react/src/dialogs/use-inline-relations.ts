// Carga las relaciones `create_inline` del modelo y los campos de su modelo
// hijo (`through`) para el modal en modo crear.
//
// Relaciones: `/metadata/table/<modelo>` (donde el kernel sirve `relations[]`,
// igual que ver/editar). Campos de la fila: `/metadata/modal/<through>` — el
// mismo contrato que usa el modal del hijo (requeridos, opciones, `ref`);
// si no responde, las columnas de `/metadata/table/<through>` pasan por
// `deriveRelationFormFields`, el mecanismo que ya usa `<DynamicRelation>`.
import { useEffect, useState } from 'react'
import { useApi } from '../api-context'
import { deriveRelationFormFields } from '../dynamic-relation-helpers'
import { deriveInlineRowFields, isCreateInline } from './inline-relations'
import type { RelationMeta } from '../types'

export interface InlineRelationsState<F> {
    relations: RelationMeta[]
    fields: Record<string, F[]>
    /** true mientras se cargan relaciones/campos. */
    loading: boolean
}

const unwrap = (res: any) => res?.data?.data ?? res?.data

export function useInlineRelations<F extends { key: string; hidden?: boolean; readonly?: boolean; type?: string }>(
    opts: { enabled: boolean; model: string; localizeLabel: (label: string) => string },
): InlineRelationsState<F> {
    const api = useApi()
    const { enabled, model } = opts
    const [state, setState] = useState<InlineRelationsState<F>>({ relations: [], fields: {}, loading: false })
    // `localizeLabel` cambia de identidad en cada render (viene de `t`); se lee por ref.
    const [localize] = useState(() => ({ fn: opts.localizeLabel }))
    localize.fn = opts.localizeLabel

    useEffect(() => {
        if (!enabled) {
            setState({ relations: [], fields: {}, loading: false })
            return
        }
        let cancelled = false
        setState((s) => ({ ...s, loading: true }))
        ;(async () => {
            try {
                const meta = unwrap(await api.get(`/metadata/table/${model}`))
                const rels: RelationMeta[] = (Array.isArray(meta?.relations) ? meta.relations : [])
                    .filter(isCreateInline)
                    .map((rel: RelationMeta) => ({ ...rel, label: rel.label ? localize.fn(rel.label) : rel.name }))
                const fields: Record<string, F[]> = {}
                await Promise.all(
                    rels.map(async (rel) => {
                        let raw: any[] | undefined
                        try {
                            const m = unwrap(await api.get(`/metadata/modal/${rel.through}`))
                            if (Array.isArray(m?.fields)) raw = m.fields
                        } catch {
                            /* cae a la metadata de tabla */
                        }
                        if (!raw) {
                            try {
                                const m = unwrap(await api.get(`/metadata/table/${rel.through}`))
                                raw = deriveRelationFormFields(m, rel.foreign_key) as any[]
                            } catch {
                                raw = []
                            }
                        }
                        fields[rel.name] = deriveInlineRowFields(raw as F[], rel)
                    }),
                )
                if (!cancelled) setState({ relations: rels, fields, loading: false })
            } catch {
                if (!cancelled) setState({ relations: [], fields: {}, loading: false })
            }
        })()
        return () => {
            cancelled = true
        }
    }, [api, enabled, model, localize])

    return state
}
