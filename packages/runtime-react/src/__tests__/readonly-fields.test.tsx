// @vitest-environment happy-dom
//
// `readonly` field handling in the generic record dialog + action modal.
//
// A `readonly` field is server/system-generated (e.g. the GitHub addon's
// `number`/`github_url`, filled by the API after the outbound create). Kernel
// v0.64.0 stamps `FieldDef.readonly` on such fields served by DeriveFormFields.
// UI semantics:
//   - CREATE: the field is excluded from the form entirely (`filterVisibleFields`)
//     — the user can't set a value the server will overwrite.
//   - EDIT:   the field is shown, but as a disabled/muted input
//     (`ReadonlyEditField`) — the value is visible, not editable.
//   - VIEW:   unchanged (rich read-only renderer).
//
// The last block covers action fields with a materialized `options_source`: ops
// turns them into `type:'select'` with server-populated `options`, and the modal
// must render a <Select> for them. That decision lives in `resolveWidget`.
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'

vi.mock('react-i18next', () => ({
    useTranslation: () => ({
        t: (k: string, o?: any) => o?.defaultValue ?? k,
        i18n: { language: 'es' },
    }),
}))

import { filterVisibleFields, ReadonlyEditField } from '../dialogs/dynamic-record'
import { resolveWidget } from '../dynamic-form-schema'

afterEach(cleanup)

const fields = [
    { key: 'name', label: 'Nombre', type: 'text' },
    // System-generated: filled by the API after the outbound create.
    { key: 'number', label: 'Número', type: 'text', readonly: true },
    { key: 'secret', label: 'Secret', type: 'text', hidden: true },
]

describe('filterVisibleFields — readonly exclusion per mode', () => {
    it('excludes a readonly field on CREATE (and always excludes hidden)', () => {
        const keys = filterVisibleFields(fields as any, 'create').map(f => f.key)
        expect(keys).toEqual(['name'])
    })

    it('keeps a readonly field visible on EDIT and VIEW (still drops hidden)', () => {
        expect(filterVisibleFields(fields as any, 'edit').map(f => f.key)).toEqual(['name', 'number'])
        expect(filterVisibleFields(fields as any, 'view').map(f => f.key)).toEqual(['name', 'number'])
    })
})

describe('ReadonlyEditField — edit-mode rendering of a readonly field', () => {
    it('renders a disabled, muted input with the value visible', () => {
        render(
            <ReadonlyEditField
                field={{ key: 'number', label: 'Número', type: 'text', readonly: true }}
                value="GH-42"
            />,
        )
        const input = screen.getByDisplayValue('GH-42') as HTMLInputElement
        expect(input).toBeTruthy()
        expect(input.disabled).toBe(true)
        expect(input.className).toContain('text-muted-foreground')
    })

    it('renders a boolean readonly field as a disabled switch', () => {
        const { container } = render(
            <ReadonlyEditField
                field={{ key: 'active', label: 'Activo', type: 'boolean', readonly: true }}
                value={true}
            />,
        )
        const sw = container.querySelector('[role="switch"]') as HTMLElement
        expect(sw).toBeTruthy()
        expect(sw.getAttribute('data-disabled') != null || sw.hasAttribute('disabled')).toBe(true)
        expect(screen.getByText('Sí')).toBeTruthy()
    })
})

describe('action fields — options_source materialized to a select', () => {
    it('resolves a select-typed field (server-populated options) to the select widget', () => {
        // ops materializes an `options_source` action field into `type:'select'`
        // with the options populated server-side; the modal's renderField keys off
        // resolveWidget to render a <Select> for it.
        expect(
            resolveWidget({
                key: 'status',
                label: 'Estado',
                type: 'select',
                options: [
                    { value: 'open', label: 'Abierto' },
                    { value: 'closed', label: 'Cerrado' },
                ],
            } as any),
        ).toBe('select')
    })
})
