// Declarative form_layout grouping contract (kernel PR #230). The two renderers
// (dynamic-form.tsx, dialogs/dynamic-record.tsx) both drive their sections /
// wizard steps off `groupFieldsBySection`, so — following PR #673 — we test the
// pure grouping helper directly instead of booting the full modal under
// happy-dom (which hangs on the async metadata/options fetches).
import { describe, expect, it } from 'vitest'
import {
    groupFieldsBySection,
    DEFAULT_SECTION_KEY,
    type FormLayout,
} from '../form-layout'

interface F {
    key: string
    section?: string
}

const layout: FormLayout = {
    mode: 'sections',
    sections: [
        { key: 'general', title: 'General' },
        { key: 'billing', title: 'Facturación', collapsed: true },
        { key: 'notes', title: 'Notas' }, // will end up empty → hidden
    ],
}

describe('groupFieldsBySection — sections', () => {
    it('groups visible fields by section respecting the sections order', () => {
        const fields: F[] = [
            { key: 'tax_id', section: 'billing' },
            { key: 'name', section: 'general' },
            { key: 'email', section: 'general' },
            { key: 'currency', section: 'billing' },
        ]
        const groups = groupFieldsBySection(fields, layout)

        // No orphans → no default group; sections in authored order; the empty
        // `notes` section is omitted entirely.
        expect(groups.map(g => g.key)).toEqual(['general', 'billing'])
        expect(groups[0].fields.map(f => f.key)).toEqual(['name', 'email'])
        expect(groups[1].fields.map(f => f.key)).toEqual(['tax_id', 'currency'])
        // `collapsed` is carried through so the chrome can start collapsed.
        expect(groups[1].collapsed).toBe(true)
    })

    it('puts section-less and unknown-section fields in a default group placed first', () => {
        const fields: F[] = [
            { key: 'name', section: 'general' },
            { key: 'orphan' }, // no section
            { key: 'stray', section: 'does_not_exist' }, // unknown section
        ]
        const groups = groupFieldsBySection(fields, layout)

        expect(groups[0].key).toBe(DEFAULT_SECTION_KEY)
        expect(groups[0].isDefault).toBe(true)
        expect(groups[0].fields.map(f => f.key)).toEqual(['orphan', 'stray'])
        expect(groups[1].key).toBe('general')
    })

    it('hides a section whose only members are filtered out (visible_when)', () => {
        // The caller passes the ALREADY visibility-filtered list, so a section
        // left with no fields must not render an empty shell / empty step.
        const fields: F[] = [{ key: 'name', section: 'general' }]
        const groups = groupFieldsBySection(fields, layout)
        expect(groups.map(g => g.key)).toEqual(['general'])
    })

    it('without a layout returns a single default group carrying every field in order', () => {
        const fields: F[] = [{ key: 'a' }, { key: 'b' }, { key: 'c', section: 'general' }]
        const groups = groupFieldsBySection(fields, undefined)
        expect(groups).toHaveLength(1)
        expect(groups[0].key).toBe(DEFAULT_SECTION_KEY)
        expect(groups[0].isDefault).toBe(true)
        expect(groups[0].fields.map(f => f.key)).toEqual(['a', 'b', 'c'])
    })
})

describe('groupFieldsBySection — steps', () => {
    const stepsLayout: FormLayout = {
        mode: 'steps',
        sections: [
            { key: 'who', title: 'Cliente' },
            { key: 'what', title: 'Productos' },
            { key: 'pay', title: 'Pago' },
        ],
    }

    it('yields one group per non-empty step in order, ready for wizard navigation', () => {
        const fields: F[] = [
            { key: 'amount', section: 'pay' },
            { key: 'customer_id', section: 'who' },
            { key: 'items', section: 'what' },
        ]
        const groups = groupFieldsBySection(fields, stepsLayout)

        // Ordered as authored → step 0 = who, last = pay, so a wizard advances
        // who → what → pay and submits on `pay`.
        expect(groups.map(g => g.key)).toEqual(['who', 'what', 'pay'])
        const last = groups.length - 1
        expect(groups[last].key).toBe('pay')
        expect(groups[last].title).toBe('Pago')
    })

    it('drops an empty step so the wizard never stops on a blank page', () => {
        const fields: F[] = [
            { key: 'customer_id', section: 'who' },
            { key: 'amount', section: 'pay' },
        ]
        const groups = groupFieldsBySection(fields, stepsLayout)
        // `what` has no visible field → omitted; wizard is who → pay.
        expect(groups.map(g => g.key)).toEqual(['who', 'pay'])
    })
})
