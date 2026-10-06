// @vitest-environment happy-dom
// Forma de pago «99 · Por definir» solo con método PPD, y con PPD solo «99»:
// la regla viaja en el `when` de las opciones del manifest. El validador y el
// render compartido de campos (renderField, que usan el DocumentEditor, el
// diálogo de document_forms y los modales de acción) la respetan.
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render } from '@testing-library/react'

vi.mock('react-i18next', () => ({
    useTranslation: () => ({ t: (k: string, o?: { defaultValue?: string }) => o?.defaultValue ?? k, i18n: { language: 'es' } }),
}))

import { validateValues } from '../validator'
import { renderField } from '../action-modal-dispatcher'
import type { ActionFieldDef } from '../types'

const notPPD = { field: 'fiscal_data.metodo_pago', not_in: ['PPD'] }
const ppd = { field: 'fiscal_data.metodo_pago', in: ['PPD'] }
const fields: ActionFieldDef[] = [
    {
        key: 'fiscal_data.metodo_pago',
        label: 'Método',
        type: 'select',
        options: [
            { value: 'PUE', label: 'PUE' },
            { value: 'PPD', label: 'PPD' },
        ],
    },
    {
        key: 'fiscal_data.forma_pago',
        label: 'Forma',
        type: 'select',
        options: [
            { value: '01', label: 'Efectivo', when: notPPD },
            { value: '03', label: 'Transferencia', when: notPPD },
            { value: '99', label: 'Por definir', when: ppd },
        ],
    },
]

const header = (metodo: string, forma: string) => ({ 'fiscal_data.metodo_pago': metodo, 'fiscal_data.forma_pago': forma })

afterEach(cleanup)

describe('validateValues con options[].when', () => {
    it('99 con PUE es invalid_option', () => {
        const bag = validateValues(fields, header('PUE', '99'))
        expect(bag['fiscal_data.forma_pago']?.[0]?.code).toBe('invalid_option')
        expect(bag['fiscal_data.forma_pago']?.[0]?.params).toEqual({ allowed: ['01', '03'] })
    })
    it('PPD exige 99', () => {
        const bag = validateValues(fields, header('PPD', '01'))
        expect(bag['fiscal_data.forma_pago']?.[0]).toEqual({ code: 'invalid_option', params: { allowed: ['99'] } })
    })
    it('PPD + 99 y PUE + 01 pasan', () => {
        expect(validateValues(fields, header('PPD', '99'))).toEqual({})
        expect(validateValues(fields, header('PUE', '01'))).toEqual({})
    })
    it('una celda de renglón se evalúa contra su renglón y el encabezado', () => {
        const lines: ActionFieldDef = {
            key: 'items',
            label: 'Renglones',
            type: 'array',
            itemFields: [{ ...fields[1]!, key: 'forma' }],
        }
        const bag = validateValues([fields[0]!, lines], { 'fiscal_data.metodo_pago': 'PPD', items: [{ forma: '03' }, { forma: '99' }] })
        expect(bag['items.0.forma']?.[0]?.code).toBe('invalid_option')
        expect(bag['items.1.forma']).toBeUndefined()
    })
})

describe('renderField con options[].when', () => {
    const trigger = (metodo: string, forma: string) => {
        const { container } = render(<>{renderField(fields[1]!, forma, () => {}, header(metodo, forma))}</>)
        return container.querySelector('[aria-invalid], button, [role="combobox"]') as HTMLElement
    }
    it('marca en el acto una forma que el método ya no permite', () => {
        const el = trigger('PUE', '99')
        expect(el.getAttribute('aria-invalid')).toBe('true')
        expect(el.getAttribute('data-stale-option')).toBe('true')
    })
    it('una combinación válida no se marca', () => {
        const el = trigger('PPD', '99')
        expect(el.getAttribute('aria-invalid')).toBeNull()
        expect(el.getAttribute('data-stale-option')).toBeNull()
    })
})
