// @vitest-environment happy-dom
// PIT-044: the sidebar follows the role's effective permissions.
import { describe, expect, it } from 'vitest'
import { renderHook } from '@testing-library/react'
import type { ReactNode } from 'react'
import { PermissionsProvider, makeCan } from '../permissions-context'
import {
    capabilityForNavItem,
    isNavItemAllowed,
    modelFromNavUrl,
    useNavItemVisible,
} from '../nav-permissions'
import { filterNavigationByCapability, useNavigation, type NavItem } from '../navigation-builder'

describe('nav url → capability', () => {
    it('maps /m/<model> to <model>.index and ignores other routes', () => {
        expect(modelFromNavUrl('/m/POS_Orders?view=kanban')).toBe('POS_Orders')
        expect(modelFromNavUrl('/app/m/stock_transfers')).toBe('stock_transfers')
        expect(modelFromNavUrl('/app/activity')).toBeUndefined()
        expect(capabilityForNavItem({ url: '/m/pos_orders' })).toBe('pos_orders.index')
        expect(capabilityForNavItem({ url: '/m/x', requires: 'general.admin' })).toBe('general.admin')
        expect(capabilityForNavItem({ url: '/app/activity' })).toBeUndefined()
    })

    it('allows non-model routes and gates model routes', () => {
        const can = makeCan(['pos_orders.index'], false)
        expect(isNavItemAllowed({ url: '/m/pos_orders' }, can)).toBe(true)
        expect(isNavItemAllowed({ url: '/m/invoices' }, can)).toBe(false)
        expect(isNavItemAllowed({ url: '/app/activity' }, can)).toBe(true)
    })
})

describe('useNavItemVisible', () => {
    it('is undefined without a provider (nothing filtered)', () => {
        const { result } = renderHook(() => useNavItemVisible())
        expect(result.current).toBeUndefined()
    })

    it('hides entries the role cannot index; admin sees all', () => {
        const wrap = (perms: string[], isAdmin: boolean) =>
            ({ children }: { children: ReactNode }) => (
                <PermissionsProvider permissions={perms} isAdmin={isAdmin}>
                    {children}
                </PermissionsProvider>
            )
        const limited = renderHook(() => useNavItemVisible(), { wrapper: wrap(['pos_orders.index'], false) })
        expect(limited.result.current!({ url: '/m/pos_orders' })).toBe(true)
        expect(limited.result.current!({ url: '/m/invoices' })).toBe(false)
        const admin = renderHook(() => useNavItemVisible(), { wrapper: wrap([], true) })
        expect(admin.result.current!({ url: '/m/invoices' })).toBe(true)
    })
})

describe('navigation builder capability filter', () => {
    const base: NavItem[] = [
        { key: 'sales', label: 'Ventas', children: [
            { key: 'orders', label: 'Pedidos', to: '/m/orders', requires: 'orders.index' },
            { key: 'invoices', label: 'Facturas', to: '/m/invoices', requires: 'invoices.index' },
        ] },
        { key: 'admin', label: 'Admin', children: [
            { key: 'roles', label: 'Roles', to: '/m/roles', requires: 'roles.index' },
        ] },
        { key: 'home', label: 'Inicio', to: '/' },
    ]

    it('drops denied items and parents left empty', () => {
        const out = filterNavigationByCapability(base, makeCan(['orders.index'], false))
        expect(out.map((i) => i.key)).toEqual(['sales', 'home'])
        expect(out[0].children!.map((c) => c.key)).toEqual(['orders'])
    })

    it('useNavigation keeps everything without a provider', () => {
        const { result } = renderHook(() => useNavigation(base, []))
        expect(result.current).toHaveLength(3)
    })
})
