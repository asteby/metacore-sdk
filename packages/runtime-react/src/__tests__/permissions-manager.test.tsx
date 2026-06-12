// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'

// Sin `globals: true` en vitest, RTL no auto-limpia entre tests.
afterEach(cleanup)
import {
    PermissionsManager,
    moduleActionCapability,
    moduleCapabilities,
    grantedCountForModule,
    capabilitySetsEqual,
    type PermissionsCatalog,
    type RoleDef,
} from '../permissions-manager'

const catalog: PermissionsCatalog = {
    modules: [
        {
            key: 'pos_orders',
            label: 'Pedidos POS',
            addon_key: 'pos',
            addon_label: 'Punto de venta',
            actions: [
                { key: 'index', label: 'Listar', icon: 'List', kind: 'crud' },
                { key: 'create', label: 'Crear', icon: 'Plus', kind: 'crud' },
                { key: 'pagar', label: 'Pagar', icon: 'CreditCard', kind: 'custom' },
            ],
        },
    ],
    general: [
        {
            key: 'general.work_after_hours',
            label: 'Trabajar fuera de horario',
            description: 'Permite operar fuera del horario configurado.',
        },
    ],
}

const roles: RoleDef[] = [{ id: 'r1', name: 'cashier', label: 'Cajero', color: '#22c55e' }]

function makeProps(overrides: Partial<Parameters<typeof PermissionsManager>[0]> = {}) {
    return {
        loadModules: vi.fn(async () => catalog),
        loadRoles: vi.fn(async () => roles),
        loadRolePermissions: vi.fn(async () => ['pos_orders.index']),
        syncRolePermissions: vi.fn(async () => {}),
        ...overrides,
    }
}

describe('helpers puros', () => {
    it('moduleActionCapability lowercasea el módulo', () => {
        expect(moduleActionCapability('Pos_Orders', 'pagar')).toBe('pos_orders.pagar')
    })

    it('moduleCapabilities y grantedCountForModule', () => {
        const mod = catalog.modules[0]
        expect(moduleCapabilities(mod)).toEqual([
            'pos_orders.index',
            'pos_orders.create',
            'pos_orders.pagar',
        ])
        expect(grantedCountForModule(new Set(['pos_orders.index', 'otra.cosa']), mod)).toBe(1)
    })

    it('capabilitySetsEqual', () => {
        expect(capabilitySetsEqual(new Set(['a', 'b']), new Set(['b', 'a']))).toBe(true)
        expect(capabilitySetsEqual(new Set(['a']), new Set(['a', 'b']))).toBe(false)
    })
})

describe('PermissionsManager', () => {
    it('renderiza catálogo con mocks, auto-selecciona rol y módulo, contador N/M', async () => {
        const props = makeProps()
        render(<PermissionsManager {...props} />)

        // Auto-selección: primer rol + primer módulo, grid con las acciones.
        expect(await screen.findByText('Acciones permitidas')).toBeTruthy()
        expect(await screen.findByText('Pagar')).toBeTruthy()
        expect(screen.getByText('1/3')).toBeTruthy()
        expect(props.loadRolePermissions).toHaveBeenCalledWith('r1')

        // Generales presentes con descripción.
        expect(screen.getByText('Permisos Generales')).toBeTruthy()
        expect(screen.getByText('Trabajar fuera de horario')).toBeTruthy()
    })

    it('marcar una acción + un general y guardar llama sync con el set completo correcto', async () => {
        const props = makeProps()
        render(<PermissionsManager {...props} />)
        await screen.findByText('Pagar')

        fireEvent.click(screen.getByRole('checkbox', { name: /Pagar/ }))
        fireEvent.click(screen.getByRole('checkbox', { name: /Trabajar fuera de horario/ }))

        // Dirty visible y guardar habilitado.
        expect(screen.getByText('Cambios sin guardar')).toBeTruthy()
        fireEvent.click(screen.getByRole('button', { name: /Guardar permisos/ }))

        await waitFor(() =>
            expect(props.syncRolePermissions).toHaveBeenCalledWith('r1', [
                'general.work_after_hours',
                'pos_orders.index',
                'pos_orders.pagar',
            ]),
        )
        // Tras guardar, baseline = draft → dirty desaparece.
        await waitFor(() => expect(screen.queryByText('Cambios sin guardar')).toBeNull())
    })

    it('desmarcar una otorgada también entra al delta', async () => {
        const props = makeProps()
        render(<PermissionsManager {...props} />)
        await screen.findByText('Pagar')

        fireEvent.click(screen.getByRole('checkbox', { name: /Listar/ }))
        fireEvent.click(screen.getByRole('button', { name: /Guardar permisos/ }))
        await waitFor(() => expect(props.syncRolePermissions).toHaveBeenCalledWith('r1', []))
    })

    it('marcar todo / limpiar operan sobre el módulo activo', async () => {
        const props = makeProps()
        render(<PermissionsManager {...props} />)
        await screen.findByText('Pagar')

        fireEvent.click(screen.getByRole('button', { name: /Marcar todo/ }))
        expect(screen.getByText('3/3')).toBeTruthy()

        fireEvent.click(screen.getByRole('button', { name: /Guardar permisos/ }))
        await waitFor(() =>
            expect(props.syncRolePermissions).toHaveBeenCalledWith('r1', [
                'pos_orders.create',
                'pos_orders.index',
                'pos_orders.pagar',
            ]),
        )

        fireEvent.click(screen.getByRole('button', { name: /Limpiar/ }))
        expect(screen.getByText('0/3')).toBeTruthy()
    })

    it('guardar deshabilitado sin cambios', async () => {
        const props = makeProps()
        render(<PermissionsManager {...props} />)
        await screen.findByText('Pagar')
        const save = screen.getByRole('button', { name: /Guardar permisos/ }) as HTMLButtonElement
        expect(save.disabled).toBe(true)
    })

    it('oculta Nuevo rol / Editar / Eliminar cuando no hay mutators de rol', async () => {
        const props = makeProps()
        render(<PermissionsManager {...props} />)
        await screen.findByText('Pagar')
        expect(screen.queryByRole('button', { name: /Nuevo rol/ })).toBeNull()
        expect(screen.queryByRole('button', { name: 'Editar rol' })).toBeNull()
        expect(screen.queryByRole('button', { name: 'Eliminar rol' })).toBeNull()
    })

    it('muestra los CRUD de rol cuando los mutators existen', async () => {
        const props = makeProps({
            createRole: vi.fn(async () => {}),
            updateRole: vi.fn(async () => {}),
            deleteRole: vi.fn(async () => {}),
        })
        render(<PermissionsManager {...props} />)
        await screen.findByText('Pagar')
        expect(screen.getByRole('button', { name: /Nuevo rol/ })).toBeTruthy()
        expect(screen.getByRole('button', { name: 'Editar rol' })).toBeTruthy()
        expect(screen.getByRole('button', { name: 'Eliminar rol' })).toBeTruthy()
    })
})
