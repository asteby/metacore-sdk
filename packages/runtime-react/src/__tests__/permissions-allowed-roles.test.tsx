// @vitest-environment happy-dom
//
// `allowedRoles` por acción: oculta según los roles que provee el host vía
// <PermissionsProvider roles superRoles>. Solo UX; el backend es la autoridad.
import { describe, expect, it } from 'vitest'
import { renderHook } from '@testing-library/react'
import React from 'react'

import {
    gateTableMetadata,
    isActionAllowedForRoles,
    makeCan,
    PermissionsProvider,
    resolveRowActions,
    useRoleGate,
    type RoleGate,
} from '../permissions-context'
import type { TableMetadata, ActionDefinition } from '../types'

function meta(actions: ActionDefinition[]): TableMetadata {
    return {
        title: 'Doctores',
        endpoint: '/dynamic/doctors',
        columns: [],
        actions,
        perPageOptions: [10],
        defaultPerPage: 10,
        searchPlaceholder: 'Buscar...',
        enableCRUDActions: false,
        hasActions: actions.length > 0,
    } as TableMetadata
}

const act = (key: string, extra: Record<string, unknown> = {}): ActionDefinition =>
    ({ key, name: key, label: key, icon: 'Zap', ...extra }) as ActionDefinition

const can = makeCan(['*'], false)
const gate = (over: Partial<RoleGate> = {}): RoleGate => ({
    roles: ['doctor'],
    superRoles: [],
    loading: false,
    isAdmin: false,
    ...over,
})
const keys = (m: TableMetadata) => m.actions.map((a) => a.key)

describe('allowedRoles por acción', () => {
    const m = meta([act('free'), act('onlyAdmin', { allowedRoles: ['admin'] }), act('docs', { allowedRoles: ['doctor', 'nurse'] })])

    it('oculta/muestra según el rol del usuario', () => {
        expect(keys(gateTableMetadata(m, 'doctors', can, undefined, gate()))).toEqual(['free', 'docs'])
        expect(keys(gateTableMetadata(m, 'doctors', can, undefined, gate({ roles: ['admin'] })))).toEqual(['free', 'onlyAdmin'])
    })

    it('superRoles hace bypass; sin superRoles no hay bypass', () => {
        const g = gate({ roles: ['super_admin'], superRoles: ['admin', 'super_admin'] })
        expect(keys(gateTableMetadata(m, 'doctors', can, undefined, g))).toEqual(['free', 'onlyAdmin', 'docs'])
        expect(keys(gateTableMetadata(m, 'doctors', can, undefined, gate({ roles: ['super_admin'] })))).toEqual(['free'])
    })

    it('isAdmin hace bypass', () => {
        expect(keys(gateTableMetadata(m, 'doctors', can, undefined, gate({ isAdmin: true })))).toHaveLength(3)
    })

    it('sin allowedRoles (o vacío) todo igual', () => {
        const plain = meta([act('a'), act('b', { allowedRoles: [] })])
        expect(keys(gateTableMetadata(plain, 'doctors', can, undefined, gate({ roles: [] })))).toEqual(['a', 'b'])
    })

    it('sin provider (gate null) todo igual', () => {
        expect(keys(gateTableMetadata(m, 'doctors', can))).toEqual(['free', 'onlyAdmin', 'docs'])
        expect(isActionAllowedForRoles(act('x', { allowedRoles: ['admin'] }), null)).toBe(true)
    })

    it('acepta snake_case allowed_roles', () => {
        const s = meta([act('x', { allowed_roles: ['admin'] })])
        expect(keys(gateTableMetadata(s, 'doctors', can, undefined, gate()))).toEqual([])
        expect(keys(gateTableMetadata(s, 'doctors', can, undefined, gate({ roles: ['admin'] })))).toEqual(['x'])
    })

    it('loading y roles sin resolver no filtran; roles [] es fail-closed', () => {
        const a = act('x', { allowedRoles: ['admin'] })
        expect(isActionAllowedForRoles(a, gate({ roles: undefined, loading: true }))).toBe(true)
        expect(isActionAllowedForRoles(a, gate({ roles: ['patient'], loading: true }))).toBe(true)
        expect(isActionAllowedForRoles(a, gate({ roles: undefined }))).toBe(true)
        expect(isActionAllowedForRoles(a, gate({ roles: [] }))).toBe(false)
    })

    it('resolveRowActions (kanban) aplica el mismo filtro', () => {
        const rows = resolveRowActions(m, 'doctors', can, true, undefined, gate())
        expect(rows.map((a) => a.key)).toEqual(['free', 'docs'])
    })

    it('PermissionsProvider expone el gate y sin provider es null', () => {
        expect(renderHook(() => useRoleGate()).result.current).toBeNull()
        const wrapper = ({ children }: { children: React.ReactNode }) => (
            <PermissionsProvider permissions={['*']} isAdmin={false} roles={['doctor']} superRoles={['admin']}>
                {children}
            </PermissionsProvider>
        )
        const { result } = renderHook(() => useRoleGate(), { wrapper })
        expect(result.current).toMatchObject({ roles: ['doctor'], superRoles: ['admin'], loading: false })
    })
})
