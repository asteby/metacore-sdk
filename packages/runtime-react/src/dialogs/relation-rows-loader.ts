// Carga las filas YA guardadas de una relación hija para editar el padre con un widget de
// relación. En editar, `_children[relación]` es el conjunto COMPLETO: lo que falta se borra en el
// servidor. Por eso este cargador solo devuelve filas cuando trae TODAS; con una página parcial,
// un error o una respuesta sin `success` devuelve `complete: false` y el modal NO envía la
// relación (nunca borra por no haber alcanzado a leerla).
import { makeDraftRow, type DraftRow } from '../draft-rows'
import { buildRelationFilterParams } from '../dynamic-relation-helpers'
import type { RelationMeta } from '../types'

export interface RelationRowsApi {
    get: (url: string, config?: { params?: Record<string, unknown> }) => Promise<any>
}

export interface LoadedRelationRows {
    rows: DraftRow[]
    /** true solo si se leyeron todas las filas del padre. */
    complete: boolean
}

const PAGE = 200
const MAX_PAGES = 10

/** Una fila del servidor → fila borrador con su `id` y los valores de las columnas. */
export function toDraftRow(record: Record<string, any>, columns: Array<{ key: string }>): DraftRow {
    const values: Record<string, any> = {}
    for (const c of columns) {
        const v = record[c.key]
        if (v !== undefined) values[c.key] = v
    }
    return makeDraftRow(values, undefined, record.id)
}

export async function loadRelationRows(
    api: RelationRowsApi,
    relation: Pick<RelationMeta, 'through' | 'foreign_key' | 'scope'>,
    parentId: string | number,
    columns: Array<{ key: string }>,
    opts: { pageSize?: number; maxPages?: number } = {},
): Promise<LoadedRelationRows> {
    const pageSize = opts.pageSize ?? PAGE
    const maxPages = opts.maxPages ?? MAX_PAGES
    const rows: DraftRow[] = []
    try {
        for (let page = 1; page <= maxPages; page++) {
            const res = await api.get(`/data/${relation.through}`, {
                params: {
                    ...buildRelationFilterParams(
                        relation.foreign_key,
                        parentId,
                        (relation.scope as Record<string, string> | undefined) ?? null,
                    ),
                    page,
                    per_page: pageSize,
                },
            })
            const body = res?.data
            if (!body?.success || !Array.isArray(body.data)) return { rows: [], complete: false }
            for (const r of body.data) rows.push(toDraftRow(r, columns))
            const total = body.meta?.total
            if (typeof total === 'number' ? rows.length >= total : body.data.length < pageSize) {
                return { rows, complete: true }
            }
            // Una página vacía sin haber llegado al total: la lectura no es confiable.
            if (body.data.length === 0) return { rows: [], complete: false }
        }
        return { rows: [], complete: false } // más páginas de las que se leen: no es seguro reemplazar
    } catch {
        return { rows: [], complete: false }
    }
}

/** Huella estable de las filas (para saber si el usuario las cambió). */
export function rowsFingerprint(rows: DraftRow[], columns: Array<{ key: string }>): string {
    return JSON.stringify(
        rows.map((r) => [r.id ?? null, columns.map((c) => (r.values[c.key] === undefined ? null : r.values[c.key]))]),
    )
}
