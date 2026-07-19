// DynamicRelations — metadata-driven panel list. Given a parent record and the
// `TableMetadata.relations[]` the kernel serves (>= v0.41.0), it renders one
// `<DynamicRelation>` panel per relation. This is what a generic detail page
// renders to surface "a Customer's vehicles, addresses, attachments" without
// hand-wiring each child list.
//
// For every RelationMeta it:
//   - maps `kind` straight through (one_to_many | many_to_many),
//   - uses `through` as the child/pivot model and `foreign_key` as the FK,
//   - merges the relation's static `scope` (polymorphic discriminators, e.g.
//     { owner_model: "Customer" }) into the panel's `filters` so the child list
//     is scoped by the FK AND every scope column.
import { useMemo } from 'react'
import { DynamicRelation, type DynamicRelationStrings } from './dynamic-relation'
import type { RelationMeta } from './types'

export interface DynamicRelationsProps {
    /**
     * The parent record. Its `id` (or `parentIdKey`) seeds every child list's
     * foreign-key filter. Null/undefined → renders nothing (loading guard).
     */
    record: { id?: string | number; [k: string]: unknown } | null | undefined
    /** The relations to render — typically `metadata.relations`. */
    relations: RelationMeta[] | null | undefined
    /**
     * Which field of `record` holds the parent id. Default `'id'`. Lets a host
     * key relations off a non-`id` primary key.
     */
    parentIdKey?: string
    /** Wrapper className for the whole stack. */
    className?: string
    /** Per-panel wrapper className. */
    panelClassName?: string
    /**
     * Permisos propagados a cada panel. Default true. A host can lock the whole
     * detail page read-only by passing canCreate/canDelete/canEdit = false.
     */
    canCreate?: boolean
    canDelete?: boolean
    canEdit?: boolean
    /** Translatable strings forwarded to each DynamicRelation. */
    strings?: Partial<DynamicRelationStrings>
    /** Bubble up when any panel's data changes (create/delete/attach/detach). */
    onChange?: (relation: RelationMeta) => void
}

/**
 * Normalizes the parent id off the record, tolerating a custom `parentIdKey`.
 * Returns `undefined` when unusable so callers can guard rendering.
 */
export function resolveParentId(
    record: { [k: string]: unknown } | null | undefined,
    parentIdKey = 'id',
): string | number | undefined {
    if (!record) return undefined
    const raw = record[parentIdKey]
    if (raw === undefined || raw === null || raw === '') return undefined
    if (typeof raw === 'number' || typeof raw === 'string') return raw
    return undefined
}

/**
 * Merges a relation's static `scope` with its foreign-key entry into the flat
 * `filters` map `<DynamicRelation>` expects. The FK is included so a panel that
 * only consumes `filters` (rather than the dedicated `foreignKey` prop) stays
 * correctly scoped; `<DynamicRelation>` already de-dups the FK so passing it in
 * both places is safe.
 */
export function buildRelationFilters(
    relation: Pick<RelationMeta, 'foreign_key' | 'scope'>,
    parentId: string | number,
): Record<string, string> {
    const out: Record<string, string> = {}
    if (relation.scope) {
        for (const [k, v] of Object.entries(relation.scope)) {
            if (!k || v === undefined || v === null) continue
            out[k] = String(v)
        }
    }
    if (relation.foreign_key) out[relation.foreign_key] = String(parentId)
    return out
}

/** Stable React key for a relation panel. */
function relationKey(rel: RelationMeta, idx: number): string {
    return rel.name || `${rel.through}-${rel.foreign_key}-${idx}`
}

export function DynamicRelations({
    record,
    relations,
    parentIdKey = 'id',
    className,
    panelClassName,
    canCreate = true,
    canDelete = true,
    canEdit = true,
    strings,
    onChange,
}: DynamicRelationsProps) {
    const parentId = useMemo(
        () => resolveParentId(record, parentIdKey),
        [record, parentIdKey],
    )

    if (parentId === undefined || !relations || relations.length === 0) {
        return null
    }

    return (
        <div className={className} data-dynamic-relations="">
            {relations.map((rel, idx) => {
                const filters = buildRelationFilters(rel, parentId)
                const panelStrings: Partial<DynamicRelationStrings> = {
                    ...(strings || {}),
                    ...(rel.label ? { title: rel.label } : {}),
                }
                // A relation flagged read-only in the kernel metadata forces the
                // panel's mutation controls off regardless of the host perms.
                // Tolerates the camelCase alias.
                const relReadonly = rel.readonly === true || rel.readOnly === true
                if (rel.kind === 'many_to_many') {
                    return (
                        <DynamicRelation
                            key={relationKey(rel, idx)}
                            kind="many_to_many"
                            through={rel.through}
                            // The pivot's reference table is unknown from
                            // RelationMeta alone; default to the through model so
                            // the panel degrades to the pivot list. Hosts with a
                            // declared `references` should render DynamicRelation
                            // directly. (one_to_many is the common detail-page case.)
                            references={rel.through}
                            foreignKey={rel.foreign_key}
                            parentId={parentId}
                            filters={filters}
                            className={panelClassName}
                            canCreate={canCreate}
                            canDelete={canDelete}
                            readonly={relReadonly}
                            strings={panelStrings}
                            onChange={onChange ? () => onChange(rel) : undefined}
                        />
                    )
                }
                return (
                    <DynamicRelation
                        key={relationKey(rel, idx)}
                        kind="one_to_many"
                        model={rel.through}
                        foreignKey={rel.foreign_key}
                        parentId={parentId}
                        filters={filters}
                        className={panelClassName}
                        canCreate={canCreate}
                        canDelete={canDelete}
                        canEdit={canEdit}
                        readonly={relReadonly}
                        strings={panelStrings}
                        onChange={onChange ? () => onChange(rel) : undefined}
                    />
                )
            })}
        </div>
    )
}
