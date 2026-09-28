// Attribute classes (CONTRACT-item-master §3.2): an extension table's columns
// are grouped into classes, and each organization assigns classes to its
// categories. A field with `visible_when.class` shows when the record's
// category (or one of its parents) carries the class, or when the saved record
// already has data in the class's fields (existing data is never hidden).
//
// The host serves the classes on the modal metadata (`attribute_classes`) and,
// optionally, the field whose referenced record carries them
// (`attribute_class_field`, default `category_id`). The referenced record
// exposes its classes as `attribute_classes` (array of keys) and its parent as
// `parent_id`.
import { useEffect, useMemo, useState } from 'react'
import type { ApiClient } from './api-context'

export interface AttributeClassSection {
    key: string
    label?: string
    fields: string[]
}

export interface AttributeClass {
    key: string
    label?: string
    sections: AttributeClassSection[]
}

/** How many parent hops the class lookup walks (a category tree is shallow). */
const MAX_PARENT_HOPS = 5

const cache = new Map<string, Promise<{ classes: string[]; parent: string | null }>>()

function refModel(ref: string | undefined): string | null {
    if (!ref) return null
    const i = ref.lastIndexOf('.')
    return i >= 0 ? ref.slice(i + 1) : ref
}

function loadNode(api: ApiClient, model: string, id: string) {
    const key = `${model}\n${id}`
    let hit = cache.get(key)
    if (!hit) {
        hit = api
            .get(`/data/${model}/${id}`)
            .then((res) => {
                const row = (res?.data?.data ?? {}) as Record<string, unknown>
                const raw = row.attribute_classes
                const classes = Array.isArray(raw) ? raw.map(String) : []
                const parent = row.parent_id ? String(row.parent_id) : null
                return { classes, parent }
            })
            .catch(() => ({ classes: [] as string[], parent: null }))
        cache.set(key, hit)
    }
    return hit
}

/**
 * Resolves the attribute classes of the record's category and its parents.
 * Returns [] when the model serves no classes or the category is empty.
 */
export async function resolveAttributeClasses(api: ApiClient, model: string, id: string): Promise<string[]> {
    const out = new Set<string>()
    let current: string | null = id
    for (let hop = 0; current && hop <= MAX_PARENT_HOPS; hop++) {
        const node: { classes: string[]; parent: string | null } = await loadNode(api, model, current)
        node.classes.forEach((c) => out.add(c))
        current = node.parent
    }
    return [...out]
}

/** Test hook: forget cached category lookups. */
export function resetAttributeClassCache(): void {
    cache.clear()
}

function readPath(rec: Record<string, unknown>, key: string): unknown {
    if (key in rec) return rec[key]
    let cur: unknown = rec
    for (const part of key.split('.')) {
        if (cur == null || typeof cur !== 'object') return undefined
        cur = (cur as Record<string, unknown>)[part]
    }
    return cur
}

/**
 * The classes a saved record already carries by its own data: a class whose
 * section fields hold a value in the record. Its fields stay visible even when
 * the category lacks the class (a tire with a spec sheet but no category, or a
 * category the org has not tagged yet) — hiding a class must never hide data
 * that exists. Field keys are matched as served, bare or `<Extension>.<column>`.
 */
export function classesCarriedByRecord(
    meta: { attribute_classes?: AttributeClass[]; fields?: { key: string }[] } | null | undefined,
    record: Record<string, unknown> | null | undefined,
): string[] {
    if (!record || !Array.isArray(meta?.attribute_classes)) return []
    const keys = (meta?.fields ?? []).map((f) => f.key)
    const out: string[] = []
    for (const cls of meta!.attribute_classes!) {
        const cols = new Set((cls.sections ?? []).flatMap((s) => s.fields ?? []))
        const carried = keys.some((k) => {
            const col = k.includes('.') ? k.slice(k.lastIndexOf('.') + 1) : k
            if (!cols.has(col) && !cols.has(k)) return false
            const v = readPath(record, k)
            return v != null && v !== ''
        })
        if (carried) out.push(cls.key)
    }
    return out
}

/**
 * The classes that apply to the form: those of its current category plus
 * those the saved record carries by its data (classesCarriedByRecord). `meta`
 * is the modal metadata; `fields` its field list (to find the class field's
 * ref). `record` is the record as loaded (null on create).
 */
export function useAttributeClasses(
    api: ApiClient,
    meta: { attribute_classes?: AttributeClass[]; attribute_class_field?: string; fields?: { key: string; ref?: string }[] } | null | undefined,
    formValues: Record<string, unknown>,
    record?: Record<string, unknown> | null,
): string[] {
    const hasClasses = Array.isArray(meta?.attribute_classes) && meta!.attribute_classes!.length > 0
    const classField = meta?.attribute_class_field || 'category_id'
    const model = refModel(meta?.fields?.find((f) => f.key === classField)?.ref) ?? 'Category'
    const id = hasClasses ? formValues[classField] : undefined
    const idStr = id == null || id === '' ? '' : String(id)
    const [classes, setClasses] = useState<string[]>([])
    useEffect(() => {
        if (!idStr) {
            setClasses([])
            return
        }
        let alive = true
        void resolveAttributeClasses(api, model, idStr).then((c) => {
            if (alive) setClasses(c)
        })
        return () => {
            alive = false
        }
    }, [api, model, idStr])
    const carried = useMemo(() => classesCarriedByRecord(meta, record), [meta, record])
    return useMemo(() => (carried.length ? [...new Set([...classes, ...carried])] : classes), [classes, carried])
}
