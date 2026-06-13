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

describe('PermissionsManager (módulo como combobox agrupado)', () => {
    // The module picker is a grouped combobox (same pattern as the role
    // selector): open it, then click the module's option.
    const moduleTrigger = () => {
        // Two role="combobox" triggers: [0] role selector, [1] module selector.
        const triggers = screen.getAllByRole('combobox')
        return triggers[triggers.length - 1]
    }
    const selectModule = async (name: RegExp) => {
        fireEvent.click(moduleTrigger())
        fireEvent.click(await screen.findByRole('option', { name }))
    }

    it('renderiza catálogo, auto-selecciona rol y primer módulo, contador N/M', async () => {
        const props = makeProps()
        render(<PermissionsManager {...props} />)

        // Primer módulo = "Usuarios" (auto-seleccionado) → su nombre en el trigger.
        await waitFor(() => expect(moduleTrigger().textContent).toMatch(/Usuarios/))
        expect(props.loadRolePermissions).toHaveBeenCalledWith('r1')

        // Al abrir el combobox: grupos (CommandGroup heading) + opciones.
        fireEvent.click(moduleTrigger())
        expect(await screen.findByText('Punto de venta')).toBeTruthy()
        expect(screen.getByRole('option', { name: /Pedidos POS/ })).toBeTruthy()
        expect(screen.getByRole('option', { name: /Terminal/ })).toBeTruthy()

        // Generales presentes con descripción.
        expect(screen.getByText('Permisos Generales')).toBeTruthy()
        expect(screen.getByText('Trabajar fuera de horario')).toBeTruthy()
    })

    it('CERO acordeones: el módulo es un combobox, no un folder colapsable', async () => {
        const props = makeProps()
        render(<PermissionsManager {...props} />)
        await waitFor(() => expect(moduleTrigger().textContent).toMatch(/Usuarios/))
        // El header de grupo "Punto de venta" vive DENTRO del popover (no en la
        // columna), así que no existe hasta abrir el combobox — nada de folders.
        expect(screen.queryByText('Punto de venta')).toBeNull()
        expect(screen.queryByRole('button', { name: 'Punto de venta' })).toBeNull()
        // El trigger del módulo es un combobox accesible.
        expect(moduleTrigger().getAttribute('role')).toBe('combobox')
    })

    it('seleccionar un módulo en el combobox muestra su grid', async () => {
        const props = makeProps()
        render(<PermissionsManager {...props} />)
        await waitFor(() => expect(moduleTrigger().textContent).toMatch(/Usuarios/))

        await selectModule(/Pedidos POS/)
        expect(await screen.findByText('Pagar')).toBeTruthy()

        await selectModule(/Terminal/)
        expect(await screen.findByText('Acceder')).toBeTruthy()
        await waitFor(() => expect(screen.queryByText('Pagar')).toBeNull())
    })

    it('marcar el screen "Acceder" produce capability screen.<navKey>.access', async () => {
        const props = makeProps()
        render(<PermissionsManager {...props} />)
        await waitFor(() => expect(moduleTrigger().textContent).toMatch(/Usuarios/))

        await selectModule(/Terminal/)
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
        await waitFor(() => expect(moduleTrigger().textContent).toMatch(/Usuarios/))

        await selectModule(/Pedidos POS/)
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
        await waitFor(() => expect(moduleTrigger().textContent).toMatch(/Usuarios/))
        await selectModule(/Pedidos POS/)
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
        await waitFor(() => expect(moduleTrigger().textContent).toMatch(/Usuarios/))
        const save = screen.getByRole('button', { name: /Guardar permisos/ }) as HTMLButtonElement
        expect(save.disabled).toBe(true)
    })

    it('el combobox de módulo filtra por búsqueda', async () => {
        const props = makeProps()
        render(<PermissionsManager {...props} />)
        await waitFor(() => expect(moduleTrigger().textContent).toMatch(/Usuarios/))

        fireEvent.click(moduleTrigger())
        fireEvent.change(await screen.findByPlaceholderText('Buscar módulo…'), {
            target: { value: 'terminal' },
        })
        await waitFor(() =>
            expect(screen.getByRole('option', { name: /Terminal/ })).toBeTruthy(),
        )
        expect(screen.queryByRole('option', { name: /Pedidos POS/ })).toBeNull()
        expect(screen.queryByRole('option', { name: /Usuarios/ })).toBeNull()
    })

    it('oculta Nuevo rol / Editar / Eliminar cuando no hay mutators de rol', async () => {
        const props = makeProps()
        render(<PermissionsManager {...props} />)
        await waitFor(() => expect(moduleTrigger().textContent).toMatch(/Usuarios/))
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
        await waitFor(() => expect(moduleTrigger().textContent).toMatch(/Usuarios/))
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
        await waitFor(() => expect(moduleTrigger().textContent).toMatch(/Usuarios/))
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
        // Los grupos derivados del addon viven dentro del combobox de módulo.
        const triggers = screen.getAllByRole('combobox')
        fireEvent.click(triggers[triggers.length - 1])
        expect(await screen.findByText('Punto de venta')).toBeTruthy()
        // El grupo Sistema (users sin addon) también.
        expect(screen.getByText('Sistema')).toBeTruthy()
        expect(screen.getByRole('option', { name: /Usuarios/ })).toBeTruthy()
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
