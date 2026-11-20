import { describe, expect, it } from 'vitest'
import { resolveModelLabels, defaultSingular } from '../model-labels'

const makeT = (dict: Record<string, string>) => (key: string, opts?: Record<string, unknown>) =>
    dict[key] ?? (opts?.defaultValue as string | undefined) ?? key

describe('resolveModelLabels', () => {
    it('falls back to the backend title and a generic New <singular>', () => {
        const l = resolveModelLabels(makeT({}), { model: 'clients', title: 'Clients' })
        expect(l).toEqual({ title: 'Clients', singular: 'Client', newLabel: 'New Client' })
    })
    it('resolves title, singular and create label from models.<model>.*', () => {
        const t = makeT({ 'models.clients.title': 'Clientes', 'models.clients.singular': 'Cliente', 'models.clients.new': 'Nuevo cliente' })
        expect(resolveModelLabels(t, { model: 'clients', title: 'Clients' })).toEqual({
            title: 'Clientes', singular: 'Cliente', newLabel: 'Nuevo cliente',
        })
    })
    it('uses titleKey first and the common.new prefix when no per-model label', () => {
        const t = makeT({ 'custom.t': 'Mis socios', 'common.new': 'Nuevo', 'models.x.title': 'ignored' })
        const l = resolveModelLabels(t, { model: 'x', title: 'X', titleKey: 'custom.t' })
        expect(l.title).toBe('Mis socios')
        expect(l.newLabel).toBe('Nuevo Mis socio')
    })
    it('explicit overrides win', () => {
        const t = makeT({ 'models.x.title': 'T', 'models.x.new': 'N' })
        const l = resolveModelLabels(t, { model: 'x', titleOverride: 'Mine', newLabelOverride: 'Add' })
        expect(l.title).toBe('Mine')
        expect(l.newLabel).toBe('Add')
    })
    it('singular helper', () => expect(defaultSingular('orders')).toBe('Order'))
})
