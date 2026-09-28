// Attribute classes (CONTRACT-item-master §3.2): an extension table's columns
// are grouped into classes, and each organization assigns classes to its
// categories. A field with `visible_when.class` shows when the record's
// category (or one of its parents) carries the class.
//
// The host serves the classes on the modal metadata (`attribute_classes`) and,
// optionally, the field whose referenced record carries them
// (`attribute_class_field`, default `category_id`). The referenced record
// exposes its classes as `attribute_classes` (array of keys) and its parent as
// `parent_id`.
import { useEffect, useState } from 'react'
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

/**
 * The classes that apply to the form's current category. `meta` is the modal
 * metadata; `fields` its field list (to find the class field's ref).
 */
export function useAttributeClasses(
    api: ApiClient,
    meta: { attribute_classes?: AttributeClass[]; attribute_class_field?: string; fields?: { key: string; ref?: string }[] } | null | undefined,
    formValues: Record<string, unknown>,
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
    return classes
}
