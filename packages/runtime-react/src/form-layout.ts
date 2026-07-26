// Declarative form layout (kernel PR #230): a model's create/edit form can
// declare `form_layout` to group its fields into named sections, rendered either
// as stacked (optionally collapsible) SECTIONS or as a multi-step WIZARD.
//
// Wire shape served on the table/modal metadata:
//   form_layout: {
//     mode: "sections" | "steps",              // default "sections"
//     sections: [{ key, title?, description?, collapsed? }]
//   }
// and, per field/column: `section: "<key>"` referencing a section key.
//
// This module owns the PURE grouping logic (no React), so the two renderers
// (`dynamic-form.tsx`, `dialogs/dynamic-record.tsx`) share one tested
// implementation and the modal-render machinery never has to be booted under
// happy-dom just to assert the grouping (same approach as PR #673).

/** One declared section of a model form. `title`/`description` arrive already
 * localized from the kernel and are rendered verbatim. */
export interface FormSection {
    key: string
    title?: string
    description?: string
    /** Sections mode only: render this section collapsed on first paint. */
    collapsed?: boolean
}

/** Model-level layout directive. `mode` defaults to `"sections"`. */
export interface FormLayout {
    mode?: 'sections' | 'steps'
    sections?: FormSection[]
}

/** A resolved group of fields ready to render: a section plus the (already
 * visibility-filtered) fields that belong to it. */
export interface FieldGroup<F> {
    /** Section key, or `__default__` for the orphan group. */
    key: string
    title?: string
    description?: string
    collapsed?: boolean
    /** True for the synthetic group holding section-less / unknown-section fields. */
    isDefault: boolean
    fields: F[]
}

/** The synthetic key of the orphan group (fields with no / unknown `section`). */
export const DEFAULT_SECTION_KEY = '__default__'

/** Reads a field's `section` reference, tolerating a camelCase alias. */
export function getFieldSection(
    field: { section?: string; Section?: string } | null | undefined,
): string | undefined {
    if (!field) return undefined
    const s = field.section ?? (field as { Section?: string }).Section
    return typeof s === 'string' && s !== '' ? s : undefined
}

/**
 * Groups already-filtered (visible) fields by their `section`, honoring the
 * order of `layout.sections`.
 *
 * Contract:
 *  - No `layout` (or no `sections`) → a single default group carrying every
 *    field in its original order. Callers render this exactly like the legacy
 *    flat list, so the layout-less path is byte-for-byte the current behaviour.
 *  - Fields whose `section` is empty or references an UNKNOWN section key are
 *    collected into ONE default group placed FIRST (before any declared
 *    section) — the consistent, documented choice: general/uncategorized fields
 *    lead, declared sections follow in their authored order.
 *  - A declared section with zero visible fields is OMITTED entirely, so a
 *    section whose only members are hidden by `visible_when` never renders an
 *    empty shell (and never yields an empty wizard step). Because the caller
 *    passes the already visibility-filtered list, this falls out for free.
 */
export function groupFieldsBySection<F extends { section?: string }>(
    fields: F[],
    layout: FormLayout | undefined,
): FieldGroup<F>[] {
    if (!layout?.sections?.length) {
        return [{ key: DEFAULT_SECTION_KEY, isDefault: true, fields }]
    }

    const known = new Set(layout.sections.map((s) => s.key))
    const bySection = new Map<string, F[]>()
    const orphans: F[] = []

    for (const f of fields) {
        const sec = getFieldSection(f)
        if (sec && known.has(sec)) {
            const arr = bySection.get(sec)
            if (arr) arr.push(f)
            else bySection.set(sec, [f])
        } else {
            orphans.push(f)
        }
    }

    const groups: FieldGroup<F>[] = []
    // Orphan/default group leads (fields with no / unknown section).
    if (orphans.length) {
        groups.push({ key: DEFAULT_SECTION_KEY, isDefault: true, fields: orphans })
    }
    for (const s of layout.sections) {
        const secFields = bySection.get(s.key)
        if (!secFields || secFields.length === 0) continue // hide empty section
        groups.push({
            key: s.key,
            title: s.title,
            description: s.description,
            collapsed: s.collapsed,
            isDefault: false,
            fields: secFields,
        })
    }
    return groups
}
