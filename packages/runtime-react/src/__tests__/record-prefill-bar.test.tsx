// @vitest-environment happy-dom
//
// RecordPrefillBar: pinta los ayudantes registrados para el modelo/modo, los
// filtra por permiso y solo deja pasar al formulario las claves que declara.
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { registerRecordPrefill, unregisterRecordPrefillsByOwner, type RecordPrefillProps } from '@asteby/metacore-sdk'
import { RecordPrefillBar } from '../record-prefill-bar'
import { PermissionsProvider } from '../permissions-context'

afterEach(() => {
    cleanup()
    unregisterRecordPrefillsByOwner('fiscal_mexico')
})

function CsfButton({ applyValues }: RecordPrefillProps) {
    return (
        <button type="button" onClick={() => applyValues({ tax_id: 'XAXX010101000', organization_id: 'hack' })}>
            Cargar constancia
        </button>
    )
}

describe('RecordPrefillBar', () => {
    it('aplica solo claves permitidas y aparece cuando el remote registra tarde', () => {
        const onApply = vi.fn()
        render(
            <RecordPrefillBar model="customers.Customer" mode="create" values={{}} allowedKeys={new Set(['tax_id'])} onApply={onApply} />,
        )
        expect(screen.queryByText('Cargar constancia')).toBeNull()
        act(() => {
            registerRecordPrefill({ id: 'fiscal_mexico.csf', models: ['Customer'], component: CsfButton }, 'fiscal_mexico')
        })
        fireEvent.click(screen.getByText('Cargar constancia'))
        expect(onApply).toHaveBeenCalledWith({ tax_id: 'XAXX010101000' })
    })

    it('se oculta sin el permiso declarado', () => {
        registerRecordPrefill(
            { id: 'fiscal_mexico.csf', models: ['Customer'], component: CsfButton, permission: 'customers.csf' },
            'fiscal_mexico',
        )
        render(
            <PermissionsProvider permissions={[]} isAdmin={false}>
                <RecordPrefillBar model="Customer" mode="create" values={{}} allowedKeys={new Set(['tax_id'])} onApply={() => {}} />
            </PermissionsProvider>,
        )
        expect(screen.queryByText('Cargar constancia')).toBeNull()
    })
})
