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
    normalizeCatalogGroups,
    flattenGroups,
    filterModuleGroups,
    defaultActionIcon,
    type PermissionsCatalog,
    type GroupedPermissionsCatalog,
    type FlatPermissionsCatalog,
    type RoleDef,
} from '../permissions-manager'

// New (preferred) shape: pre-grouped flat list, mirrors the host sidebar.
const grouped: GroupedPermissionsCatalog = {
    groups: [
        {
            title: '', // core/infra — no header
            modules: [
                {
                    key: 'users',
                    label: 'Usuarios',
                    icon: 'Users',
                    kind: 'model',
                    actions: [{ key: 'index', label: 'Listar', icon: 'List', kind: 'crud' }],
                },
            ],
        },
        {
            title: 'Punto de venta',
            modules: [
                {
                    key: 'pos_orders',
                    label: 'Pedidos POS',
                    icon: 'ShoppingCart',
                    kind: 'model',
                    actions: [
                        { key: 'index', label: 'Listar', icon: 'List', kind: 'crud' },
                        { key: 'create', label: 'Crear', icon: 'Plus', kind: 'crud' },
                        { key: 'pagar', label: 'Pagar', icon: 'CreditCard', kind: 'custom' },
                    ],
                },
                {
                    key: 'screen.pos_terminal',
                    label: 'Terminal',
                    icon: 'Monitor',
                    kind: 'screen',
                    actions: [{ key: 'access', label: 'Acceder', icon: 'Eye', kind: 'screen' }],
                },
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

// Legacy flat shape (retrocompat): no `groups`, modules without `kind`.
const legacy: FlatPermissionsCatalog = {
    modules: [
        {
            key: 'pos_orders',
            label: 'Pedidos POS',
            icon: 'ShoppingCart',
            addon_key: 'pos',
            addon_label: 'Punto de venta',
            actions: [
                { key: 'index', label: 'Listar', icon: 'List', kind: 'crud' },
                { key: 'pagar', label: 'Pagar', icon: 'CreditCard', kind: 'custom' },
            ],
        },
        {
            key: 'users',
            label: 'Usuarios',
            icon: 'Users',
            actions: [{ key: 'index', label: 'Listar', icon: 'List', kind: 'crud' }],
        },
    ],
    general: [],
}

const roles: RoleDef[] = [{ id: 'r1', name: 'cashier', label: 'Cajero', color: '#22c55e' }]

function makeProps(
    catalog: PermissionsCatalog = grouped,
    overrides: Partial<Parameters<typeof PermissionsManager>[0]> = {},
) {
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

    it('screen capability = screen.<navKey>.access', () => {
        expect(moduleActionCapability('screen.pos_terminal', 'access')).toBe(
            'screen.pos_terminal.access',
        )
    })

    it('moduleCapabilities y grantedCountForModule', () => {
        const mod = grouped.groups[1].modules[0] // pos_orders
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

    it('defaultActionIcon mapea access→Eye y screens', () => {
        expect(defaultActionIcon('access')).toBe('Eye')
        expect(defaultActionIcon('algo', 'screen')).toBe('Eye')
        expect(defaultActionIcon('index')).toBe('List')
    })

    describe('normalizeCatalogGroups', () => {
        it('pasa el shape nuevo {groups} tal cual, default kind:model', () => {
            const out = normalizeCatalogGroups(grouped)
            expect(out.map((g) => g.title)).toEqual(['', 'Punto de venta'])
            expect(out[1].modules.map((m) => m.key)).toEqual(['pos_orders', 'screen.pos_terminal'])
            // El screen conserva su kind; el modelo conserva model.
            expect(out[1].modules[0].kind).toBe('model')
            expect(out[1].modules[1].kind).toBe('screen')
        })

        it('retrocompat: envuelve el shape viejo {modules} y agrupa por addon, kind:model', () => {
            const out = normalizeCatalogGroups(legacy)
            // Agrupa por addon_label / "Sistema" para los sin addon.
            expect(out.map((g) => g.title)).toEqual(['Punto de venta', 'Sistema'])
            expect(out[0].modules.map((m) => m.key)).toEqual(['pos_orders'])
            expect(out[1].modules.map((m) => m.key)).toEqual(['users'])
            // Todos los módulos legacy quedan como model.
            expect(flattenGroups(out).every((m) => m.kind === 'model')).toBe(true)
        })
    })

    it('flattenGroups recorre los grupos en orden', () => {
        expect(flattenGroups(grouped.groups).map((m) => m.key)).toEqual([
            'users',
            'pos_orders',
            'screen.pos_terminal',
        ])
    })

    it('filterModuleGroups busca por módulo (accent/case-insensitive) o por título de grupo', () => {
        const groups = grouped.groups
        // Por nombre de módulo.
        const byTerminal = filterModuleGroups(groups, 'terminal')
        expect(byTerminal).toHaveLength(1)
        expect(byTerminal[0].modules.map((m) => m.key)).toEqual(['screen.pos_terminal'])
        // Por nombre de grupo trae todos sus módulos.
        const byGroup = filterModuleGroups(groups, 'venta')
        expect(byGroup[0].modules).toHaveLength(2)
        // Query vacía = pasa todo.
        expect(filterModuleGroups(groups, '  ')).toEqual(groups)
        // Sin match = vacío.
        expect(filterModuleGroups(groups, 'zzz')).toEqual([])
    })
})

describe('PermissionsManager (lista plana, shape nuevo)', () => {
    it('renderiza catálogo, auto-selecciona rol y primer módulo, contador N/M', async () => {
        const props = makeProps()
        render(<PermissionsManager {...props} />)

        // Primer módulo = "Usuarios" (grupo sin título, va primero).
        expect(await screen.findAllByText('Usuarios')).toBeTruthy()
        expect(props.loadRolePermissions).toHaveBeenCalledWith('r1')

        // Headers de grupo grises (no colapsables): el del grupo con título.
        expect(screen.getByText('Punto de venta')).toBeTruthy()
        // Filas de módulo de la lista plana.
        expect(screen.getByRole('button', { name: /Pedidos POS/ })).toBeTruthy()
        expect(screen.getByRole('button', { name: /Terminal/ })).toBeTruthy()

        // Generales presentes con descripción.
        expect(screen.getByText('Permisos Generales')).toBeTruthy()
        expect(screen.getByText('Trabajar fuera de horario')).toBeTruthy()
    })

    it('CERO acordeones: el header de grupo es un heading, no un botón colapsable', async () => {
        const props = makeProps()
        render(<PermissionsManager {...props} />)
        await screen.findAllByText('Usuarios')
        // El header gris "Punto de venta" es un heading, NO un button (sin folder/acordeón).
        const header = screen.getByText('Punto de venta')
        expect(header.closest('button')).toBeNull()
        expect(header.getAttribute('role')).toBe('heading')
        // No existe ningún botón cuyo accesible name sea el título del grupo
        // (lo que delataría un CollapsibleTrigger).
        expect(screen.queryByRole('button', { name: 'Punto de venta' })).toBeNull()
    })

    it('click directo en una fila selecciona el módulo y muestra su grid', async () => {
        const props = makeProps()
        render(<PermissionsManager {...props} />)
        await screen.findAllByText('Usuarios')

        // Selecciono "Pedidos POS" → su grid aparece a la derecha.
        fireEvent.click(screen.getByRole('button', { name: /Pedidos POS/ }))
        expect(await screen.findByText('Pagar')).toBeTruthy()

        // Selecciono el screen "Terminal" → acción "Acceder".
        fireEvent.click(screen.getByRole('button', { name: /Terminal/ }))
        expect(await screen.findByText('Acceder')).toBeTruthy()
        await waitFor(() => expect(screen.queryByText('Pagar')).toBeNull())
    })

    it('marcar el screen "Acceder" produce capability screen.<navKey>.access', async () => {
        const props = makeProps()
        render(<PermissionsManager {...props} />)
        await screen.findAllByText('Usuarios')

        fireEvent.click(screen.getByRole('button', { name: /Terminal/ }))
        await screen.findByText('Acceder')
        fireEvent.click(screen.getByRole('checkbox', { name: /Acceder/ }))
        fireEvent.click(screen.getByRole('button', { name: /Guardar permisos/ }))
        await waitFor(() =>
            expect(props.syncRolePermissions).toHaveBeenCalledWith('r1', [
                'pos_orders.index',
                'screen.pos_terminal.access',
            ]),
        )
    })

    it('marcar una acción + un general y guardar llama sync con el set completo', async () => {
        const props = makeProps()
        render(<PermissionsManager {...props} />)
        await screen.findAllByText('Usuarios')

        fireEvent.click(screen.getByRole('button', { name: /Pedidos POS/ }))
        await screen.findByText('Pagar')
        fireEvent.click(screen.getByRole('checkbox', { name: /Pagar/ }))
        fireEvent.click(screen.getByRole('checkbox', { name: /Trabajar fuera de horario/ }))

        expect(screen.getByText('Cambios sin guardar')).toBeTruthy()
        fireEvent.click(screen.getByRole('button', { name: /Guardar permisos/ }))

        await waitFor(() =>
            expect(props.syncRolePermissions).toHaveBeenCalledWith('r1', [
                'general.work_after_hours',
                'pos_orders.index',
                'pos_orders.pagar',
            ]),
        )
        await waitFor(() => expect(screen.queryByText('Cambios sin guardar')).toBeNull())
    })

    it('marcar todo / limpiar operan sobre el módulo activo', async () => {
        const props = makeProps()
        render(<PermissionsManager {...props} />)
        await screen.findAllByText('Usuarios')
        fireEvent.click(screen.getByRole('button', { name: /Pedidos POS/ }))
        await screen.findByText('Pagar')

        fireEvent.click(screen.getByRole('button', { name: /Marcar todo/ }))
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
        await screen.findAllByText('Usuarios')
        const save = screen.getByRole('button', { name: /Guardar permisos/ }) as HTMLButtonElement
        expect(save.disabled).toBe(true)
    })

    it('la búsqueda filtra las filas de la lista plana', async () => {
        const props = makeProps()
        render(<PermissionsManager {...props} />)
        await screen.findAllByText('Usuarios')

        fireEvent.change(screen.getByLabelText('Buscar módulo'), {
            target: { value: 'terminal' },
        })
        // Solo el módulo con match permanece como fila; otros se ocultan.
        expect(screen.getByRole('button', { name: /Terminal/ })).toBeTruthy()
        expect(screen.queryByRole('button', { name: /Pedidos POS/ })).toBeNull()
        expect(screen.queryByRole('button', { name: /Usuarios/ })).toBeNull()
    })

    it('oculta Nuevo rol / Editar / Eliminar cuando no hay mutators de rol', async () => {
        const props = makeProps()
        render(<PermissionsManager {...props} />)
        await screen.findAllByText('Usuarios')
        expect(screen.queryByRole('button', { name: /Nuevo rol/ })).toBeNull()
        expect(screen.queryByRole('button', { name: 'Editar rol' })).toBeNull()
        expect(screen.queryByRole('button', { name: 'Eliminar rol' })).toBeNull()
    })

    it('selector de rol limpio: edit/delete inline, sin chip removible', async () => {
        const props = makeProps(grouped, {
            updateRole: vi.fn(async () => {}),
            deleteRole: vi.fn(async () => {}),
        })
        render(<PermissionsManager {...props} />)
        await screen.findAllByText('Usuarios')
        expect(screen.queryByRole('button', { name: 'Quitar rol seleccionado' })).toBeNull()
        expect(screen.getByRole('button', { name: 'Editar rol' })).toBeTruthy()
        expect(screen.getByRole('button', { name: 'Eliminar rol' })).toBeTruthy()
    })

    it('muestra los CRUD de rol cuando los mutators existen', async () => {
        const props = makeProps(grouped, {
            createRole: vi.fn(async () => {}),
            updateRole: vi.fn(async () => {}),
            deleteRole: vi.fn(async () => {}),
        })
        render(<PermissionsManager {...props} />)
        await screen.findAllByText('Usuarios')
        expect(screen.getByRole('button', { name: /Nuevo rol/ })).toBeTruthy()
        expect(screen.getByRole('button', { name: 'Editar rol' })).toBeTruthy()
        expect(screen.getByRole('button', { name: 'Eliminar rol' })).toBeTruthy()
    })
})

describe('PermissionsManager (retrocompat shape viejo {modules})', () => {
    it('renderiza el shape flat legacy sin romper, agrupado por addon', async () => {
        const props = makeProps(legacy)
        render(<PermissionsManager {...props} />)

        // Auto-selección del primer módulo legacy (pos_orders → grupo "Punto de venta").
        expect(await screen.findByText('Pagar')).toBeTruthy()
        // Header gris derivado del addon.
        expect(screen.getByText('Punto de venta')).toBeTruthy()
        // El grupo Sistema (users sin addon) también.
        expect(screen.getByText('Sistema')).toBeTruthy()
        expect(screen.getByRole('button', { name: /Usuarios/ })).toBeTruthy()
    })

    it('legacy: click + guardar produce capabilities correctas', async () => {
        const props = makeProps(legacy)
        render(<PermissionsManager {...props} />)
        await screen.findByText('Pagar')

        fireEvent.click(screen.getByRole('checkbox', { name: /Pagar/ }))
        fireEvent.click(screen.getByRole('button', { name: /Guardar permisos/ }))
        await waitFor(() =>
            expect(props.syncRolePermissions).toHaveBeenCalledWith('r1', [
                'pos_orders.index',
                'pos_orders.pagar',
            ]),
        )
    })
})
