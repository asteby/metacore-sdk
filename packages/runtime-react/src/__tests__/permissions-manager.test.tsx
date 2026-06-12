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
    groupModules,
    filterModuleGroups,
    type PermissionsCatalog,
    type RoleDef,
} from '../permissions-manager'

const catalog: PermissionsCatalog = {
    modules: [
        {
            key: 'pos_orders',
            label: 'Pedidos POS',
            icon: 'ShoppingCart',
            addon_key: 'pos',
            addon_label: 'Punto de venta',
            actions: [
                { key: 'index', label: 'Listar', icon: 'List', kind: 'crud' },
                { key: 'create', label: 'Crear', icon: 'Plus', kind: 'crud' },
                { key: 'pagar', label: 'Pagar', icon: 'CreditCard', kind: 'custom' },
            ],
        },
        {
            key: 'pos_sessions',
            label: 'Sesiones POS',
            icon: 'Clock',
            addon_key: 'pos',
            addon_label: 'Punto de venta',
            actions: [{ key: 'index', label: 'Listar', icon: 'List', kind: 'crud' }],
        },
        {
            key: 'users',
            label: 'Usuarios',
            icon: 'Users',
            actions: [{ key: 'index', label: 'Listar', icon: 'List', kind: 'crud' }],
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

    it('groupModules agrupa por addon_label y manda los sin addon a "Sistema"', () => {
        const groups = groupModules(catalog.modules)
        expect(groups.map((g) => g.label)).toEqual(['Punto de venta', 'Sistema'])
        expect(groups[0].modules.map((m) => m.key)).toEqual(['pos_orders', 'pos_sessions'])
        expect(groups[1].modules.map((m) => m.key)).toEqual(['users'])
    })

    it('filterModuleGroups busca por módulo (accent/case-insensitive) o por grupo', () => {
        const groups = groupModules(catalog.modules)
        // Por nombre de módulo.
        const bySession = filterModuleGroups(groups, 'sesiones')
        expect(bySession).toHaveLength(1)
        expect(bySession[0].modules.map((m) => m.key)).toEqual(['pos_sessions'])
        // Por nombre de grupo trae todos sus módulos.
        const byGroup = filterModuleGroups(groups, 'venta')
        expect(byGroup[0].modules).toHaveLength(2)
        // Query vacía = pasa todo.
        expect(filterModuleGroups(groups, '  ')).toEqual(groups)
        // Sin match = vacío.
        expect(filterModuleGroups(groups, 'zzz')).toEqual([])
    })
})

describe('PermissionsManager', () => {
    it('renderiza catálogo con mocks, auto-selecciona rol y módulo, contador N/M', async () => {
        const props = makeProps()
        render(<PermissionsManager {...props} />)

        // Auto-selección: primer rol + primer módulo, grid con las acciones.
        // El panel derecho titula con el módulo activo ("Pedidos POS").
        expect(await screen.findAllByText('Pedidos POS')).toBeTruthy()
        expect(await screen.findByText('Pagar')).toBeTruthy()
        // El contador N/M del panel está presente (también lo refleja el árbol).
        expect(screen.getAllByText('1/3').length).toBeGreaterThan(0)
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
        // 3/3 aparece en el panel y en el badge del árbol.
        expect(screen.getAllByText('3/3').length).toBeGreaterThan(0)

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

    it('renderiza el árbol agrupado y permite seleccionar un módulo de otro grupo', async () => {
        const props = makeProps()
        render(<PermissionsManager {...props} />)
        await screen.findByText('Pagar')

        // Grupos visibles (encabezados del árbol).
        expect(screen.getByText('Punto de venta')).toBeTruthy()
        expect(screen.getByText('Sistema')).toBeTruthy()

        // Click en "Usuarios" (grupo Sistema) cambia el grid de acciones.
        fireEvent.click(screen.getByRole('button', { name: /Usuarios/ }))
        // El grid ahora muestra solo la acción de users; "Pagar" (de pos_orders) ya no.
        await waitFor(() => expect(screen.queryByText('Pagar')).toBeNull())
        // "Usuarios" titula el panel derecho además del árbol.
        expect(screen.getAllByText('Usuarios').length).toBeGreaterThan(0)
    })

    it('la búsqueda filtra el árbol de módulos', async () => {
        const props = makeProps()
        render(<PermissionsManager {...props} />)
        await screen.findByText('Pagar')

        fireEvent.change(screen.getByLabelText('Buscar módulo'), {
            target: { value: 'sesiones' },
        })
        // Solo el grupo con match permanece.
        expect(screen.getByText('Sesiones POS')).toBeTruthy()
        expect(screen.queryByText('Usuarios')).toBeNull()
    })

    it('selector de rol limpio: edit/delete inline, sin chip removible', async () => {
        const props = makeProps({
            updateRole: vi.fn(async () => {}),
            deleteRole: vi.fn(async () => {}),
        })
        render(<PermissionsManager {...props} />)
        await screen.findByText('Pagar')
        // No existe el botón de quitar rol del chip antiguo.
        expect(screen.queryByRole('button', { name: 'Quitar rol seleccionado' })).toBeNull()
        // Iconos inline presentes.
        expect(screen.getByRole('button', { name: 'Editar rol' })).toBeTruthy()
        expect(screen.getByRole('button', { name: 'Eliminar rol' })).toBeTruthy()
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
