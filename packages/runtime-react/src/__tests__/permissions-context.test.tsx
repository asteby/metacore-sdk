// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'

// Sin `globals: true` en vitest, RTL no auto-limpia entre tests.
afterEach(cleanup)
import {
    PermissionsProvider,
    useCan,
    usePermissionsActive,
    makeCan,
    capabilityForActionKey,
    modelCapability,
} from '../permissions-context'

function Probe({ capability }: { capability: string }) {
    const can = useCan()
    return <span data-testid="probe">{can(capability) ? 'allowed' : 'denied'}</span>
}

function ActiveProbe() {
    const active = usePermissionsActive()
    return <span data-testid="active">{active ? 'yes' : 'no'}</span>
}

describe('makeCan', () => {
    it('isAdmin permite todo', () => {
        const can = makeCan([], true)
        expect(can('pos_orders.create')).toBe(true)
        expect(can('cualquier.cosa')).toBe(true)
    })

    it('capability exacta en la lista → true; ausente → false', () => {
        const can = makeCan(['pos_orders.index', 'general.work_after_hours'], false)
        expect(can('pos_orders.index')).toBe(true)
        expect(can('general.work_after_hours')).toBe(true)
        expect(can('pos_orders.create')).toBe(false)
    })

    it('wildcard "*" permite todo', () => {
        const can = makeCan(['*'], false)
        expect(can('pos_orders.delete')).toBe(true)
        expect(can('lo.que.sea')).toBe(true)
    })
})

describe('useCan', () => {
    it('sin provider → siempre true (comportamiento legacy, nada se oculta)', () => {
        render(<Probe capability="pos_orders.create" />)
        expect(screen.getByTestId('probe').textContent).toBe('allowed')
    })

    it('con provider no-admin: exacta permitida, resto denegado', () => {
        render(
            <PermissionsProvider permissions={['pos_orders.index']} isAdmin={false}>
                <Probe capability="pos_orders.index" />
            </PermissionsProvider>,
        )
        expect(screen.getByTestId('probe').textContent).toBe('allowed')

        render(
            <PermissionsProvider permissions={['pos_orders.index']} isAdmin={false}>
                <Probe capability="pos_orders.create" />
            </PermissionsProvider>,
        )
        expect(screen.getAllByTestId('probe')[1].textContent).toBe('denied')
    })

    it('con provider isAdmin → todo permitido', () => {
        render(
            <PermissionsProvider permissions={[]} isAdmin={true}>
                <Probe capability="pos_orders.delete" />
            </PermissionsProvider>,
        )
        expect(screen.getByTestId('probe').textContent).toBe('allowed')
    })

    it('usePermissionsActive refleja la presencia del provider', () => {
        render(<ActiveProbe />)
        expect(screen.getByTestId('active').textContent).toBe('no')
        render(
            <PermissionsProvider permissions={[]} isAdmin={false}>
                <ActiveProbe />
            </PermissionsProvider>,
        )
        expect(screen.getAllByTestId('active')[1].textContent).toBe('yes')
    })
})

describe('capability mapping', () => {
    it('view→index, edit→update, resto verbatim', () => {
        expect(capabilityForActionKey('view')).toBe('index')
        expect(capabilityForActionKey('edit')).toBe('update')
        expect(capabilityForActionKey('delete')).toBe('delete')
        expect(capabilityForActionKey('pagar')).toBe('pagar')
    })

    it('modelCapability lowercasea el modelo', () => {
        expect(modelCapability('PosOrders', 'create')).toBe('posorders.create')
        expect(modelCapability('pos_orders', 'edit')).toBe('pos_orders.update')
    })
})
