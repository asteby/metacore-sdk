// Relaciones hijas capturadas al CREAR el padre (`RelationMeta.create_inline`).
// Puro (sin React): qué relaciones aplican, qué columnas tiene cada fila,
// cómo viaja `_children` y cómo se reparten los errores 422
// `_children.<relación>.<i>.<campo>`.
import { isManagedRelationColumn } from '../dynamic-relation-helpers'
import {
    serializeDraftRows,
    type DraftColumn,
    type DraftRow,
} from '../draft-rows'
import { localizeFieldIssue, type FieldIssue, type Translate } from '../server-error'
import type { RelationMeta } from '../types'

export const CHILDREN_KEY = '_children'

/** ¿Se captura al crear? Solo `create_inline === true` (ausente = no). */
export const isCreateInline = (rel: Pick<RelationMeta, 'create_inline'>): boolean => rel.create_inline === true

/** Mínimo de filas (entero >= 0) servido por el kernel; basura = 0. */
export function relationMin(rel: Pick<RelationMeta, 'min'>): number {
    const m = Number(rel.min)
    return Number.isFinite(m) && m > 0 ? Math.floor(m) : 0
}

/** Forma mínima del campo hijo que lee el editor (compatible con `FieldDef`). */
export interface InlineFieldMeta extends DraftColumn {
    [k: string]: any
}

/**
 * Campos capturables de la fila: los del modelo hijo menos la FK al padre y las
 * columnas `scope` (las pone el servidor), auditoría, ocultos y de solo lectura.
 */
export function deriveInlineRowFields<T extends { key: string; hidden?: boolean; readonly?: boolean; type?: string }>(
    fields: T[] | undefined,
    relation: Pick<RelationMeta, 'foreign_key' | 'scope'>,
): T[] {
    const fixed = new Set([relation.foreign_key, ...Object.keys(relation.scope ?? {})])
    return (fields ?? []).filter(
        (f) =>
            !fixed.has(f.key) &&
            !f.hidden &&
            !f.readonly &&
            f.type !== 'hidden' &&
            !isManagedRelationColumn(f.key),
    )
}

export interface InlineChildrenInput {
    relation: string
    rows: DraftRow[]
    columns: DraftColumn[]
}

/**
 * Agrega `_children: { [relación]: filas }` al cuerpo. Sin relaciones inline
 * devuelve el MISMO objeto: el cuerpo es idéntico al de siempre.
 */
export function withInlineChildren<P extends Record<string, any>>(
    payload: P,
    inline: InlineChildrenInput[],
): P | (P & { _children: Record<string, Array<Record<string, unknown>>> }) {
    if (inline.length === 0) return payload
    const children: Record<string, Array<Record<string, unknown>>> = {}
    for (const i of inline) children[i.relation] = serializeDraftRows(i.rows, i.columns)
    return { ...payload, [CHILDREN_KEY]: children }
}

export interface SplitChildErrors {
    /** Errores que no son de `_children` (campos del padre), tal cual. */
    parent: Record<string, FieldIssue[]>
    /**
     * Errores de hijas ya localizados, con la ruta `"<relación>.<i>.<campo>"`,
     * `"<relación>.<i>"` (fila) o `"<relación>"` (conjunto, p. ej. `min`).
     */
    children: Record<string, string>
}

/** Separa un mapa 422 en errores del padre y errores de filas hijas. */
export function splitChildErrors(
    map: Record<string, FieldIssue[]>,
    relations: Array<Pick<RelationMeta, 'name' | 'label'>>,
    fieldLabel: (relation: string, field: string) => string,
    t: Translate,
    language?: string,
): SplitChildErrors {
    const parent: Record<string, FieldIssue[]> = {}
    const children: Record<string, string> = {}
    // Nombres más largos primero: «a.b» gana sobre «a» si ambos existen.
    const names = [...relations].sort((a, b) => b.name.length - a.name.length)
    const prefix = `${CHILDREN_KEY}.`
    for (const [path, issues] of Object.entries(map)) {
        if (!path.startsWith(prefix)) {
            parent[path] = issues
            continue
        }
        const rest = path.slice(prefix.length)
        const rel = names.find((r) => rest === r.name || rest.startsWith(`${r.name}.`))
        if (!rel) {
            // Relación desconocida: no se pierde, queda como error de conjunto.
            children[rest] = localizeFieldIssue(issues[0]!, rest, t, language)
            continue
        }
        const tail = rest.slice(rel.name.length + 1) // "" | "<i>" | "<i>.<campo>"
        const issue = issues[0]!
        const relLabel = rel.label || rel.name
        if (!tail) {
            children[rel.name] =
                issue.code === 'min' && issue.params?.min != null
                    ? t('inlineRelation.min', {
                          defaultValue: 'Agrega al menos {{min}} {{label}} (hay {{count}})',
                          label: relLabel,
                          min: issue.params.min,
                          count: issue.params.count ?? 0,
                      })
                    : localizeFieldIssue(issue, relLabel, t, language)
            continue
        }
        const dot = tail.indexOf('.')
        const field = dot === -1 ? '' : tail.slice(dot + 1)
        children[`${rel.name}.${tail}`] = localizeFieldIssue(
            issue,
            field ? fieldLabel(rel.name, field) : relLabel,
            t,
            language,
        )
    }
    return { parent, children }
}
