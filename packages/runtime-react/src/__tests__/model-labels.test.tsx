import { describe, expect, it } from 'vitest'
import { resolveModelLabels, defaultSingular, resolveModelNoun, modelVerbTitle } from '../model-labels'

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

describe('backend-declared names (singular_label / new_label / gender)', () => {
    it('singular_label replaces the naive title-minus-s derivation', () => {
        const l = resolveModelLabels(makeT({ 'common.new': 'Nuevo' }), {
            model: 'addresses', title: 'Direcciones', singularLabel: 'dirección',
        })
        expect(l.singular).toBe('dirección')
        expect(l.newLabel).toBe('Nuevo dirección')
    })
    it('gender picks common.new_<gender> before common.new', () => {
        const t = makeT({ 'common.new': 'Nuevo', 'common.new_f': 'Nueva', 'common.new_m': 'Nuevo' })
        expect(resolveModelLabels(t, { model: 'addresses', title: 'Direcciones', singularLabel: 'dirección', gender: 'f' }).newLabel)
            .toBe('Nueva dirección')
        expect(resolveModelLabels(t, { model: 'x', title: 'X', singularLabel: 'cliente', gender: 'm' }).newLabel).toBe('Nuevo cliente')
    })
    it('backend new_label is used as is; host models.<model>.new still wins', () => {
        expect(resolveModelLabels(makeT({}), { model: 'x', title: 'X', newLabelMeta: 'Nueva figura' }).newLabel).toBe('Nueva figura')
        expect(resolveModelLabels(makeT({ 'models.x.new': 'Alta' }), { model: 'x', title: 'X', newLabelMeta: 'Nueva figura' }).newLabel).toBe('Alta')
    })
    it('host models.<model>.singular overrides the backend singular_label', () => {
        const l = resolveModelLabels(makeT({ 'models.x.singular': 'Socio' }), { model: 'x', title: 'X', singularLabel: 'cliente' })
        expect(l.singular).toBe('Socio')
    })
})

describe('resolveModelNoun / modelVerbTitle', () => {
    it('order: host singular > singular_label > titleKey > title', () => {
        expect(resolveModelNoun(makeT({ 'models.c.singular': 'Cliente' }), { model: 'c', singularLabel: 'cliente', title: 'Client' })).toBe('Cliente')
        expect(resolveModelNoun(makeT({}), { model: 'c', singularLabel: 'cliente', title: 'Client' })).toBe('cliente')
        expect(resolveModelNoun(makeT({ 'k.t': 'Socio' }), { model: 'c', titleKey: 'k.t', title: 'Client' })).toBe('Socio')
        expect(resolveModelNoun(makeT({}), { model: 'c', title: 'Client' })).toBe('Client')
        expect(resolveModelNoun(makeT({}), { model: 'c' })).toBe('')
    })
    it('verb titles are i18n-able with a Spanish default', () => {
        const t = (k: string, o?: Record<string, unknown>) =>
            k === 'dynamic.edit_title' ? `Edit ${o?.name}` : (o?.defaultValue as string)
        expect(modelVerbTitle(t, 'edit', 'customer', 'Editar customer')).toBe('Edit customer')
        expect(modelVerbTitle(t, 'create', 'cliente', 'Crear cliente')).toBe('Crear cliente')
    })
})
