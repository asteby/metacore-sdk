import { describe, expect, it } from 'vitest'
import type { ComponentType } from 'react'
import { slotRegistry } from '../slot'

// Dummy components — slot registry stores+sorts, doesn't render.
const A: ComponentType = () => null
const B: ComponentType = () => null
const C: ComponentType = () => null
const D: ComponentType = () => null

describe('slotRegistry priority ordering', () => {
    it('renders higher priority first (DESC) — canonical contract', () => {
        const slot = `test.desc.${Math.random()}`
        const off1 = slotRegistry.register(slot, A, { priority: 1 })
        const off2 = slotRegistry.register(slot, B, { priority: 5 })
        const off3 = slotRegistry.register(slot, C, { priority: 3 })

        const items = slotRegistry.get(slot)
        expect(items.map((i) => i.priority)).toEqual([5, 3, 1])
        expect(items.map((i) => i.component)).toEqual([B, C, A])

        off1()
        off2()
        off3()
    })

    it('treats missing priority as 0', () => {
        const slot = `test.zero.${Math.random()}`
        const off1 = slotRegistry.register(slot, A)
        const off2 = slotRegistry.register(slot, B, { priority: 10 })
        const off3 = slotRegistry.register(slot, C, { priority: -5 })

        const items = slotRegistry.get(slot)
        expect(items.map((i) => i.component)).toEqual([B, A, C])

        off1()
        off2()
        off3()
    })

    it('preserves insertion order on ties', () => {
        const slot = `test.ties.${Math.random()}`
        const off1 = slotRegistry.register(slot, A, { priority: 1 })
        const off2 = slotRegistry.register(slot, B, { priority: 1 })
        const off3 = slotRegistry.register(slot, C, { priority: 2 })
        const off4 = slotRegistry.register(slot, D, { priority: 1 })

        const items = slotRegistry.get(slot)
        expect(items.map((i) => i.component)).toEqual([C, A, B, D])

        off1()
        off2()
        off3()
        off4()
    })

    it('unregister removes the entry and notifies subscribers', () => {
        const slot = `test.unreg.${Math.random()}`
        let notifications = 0
        const unsubscribe = slotRegistry.subscribe(() => { notifications++ })
        const off = slotRegistry.register(slot, A, { priority: 1 })
        expect(slotRegistry.get(slot)).toHaveLength(1)
        expect(notifications).toBeGreaterThanOrEqual(1)
        const before = notifications
        off()
        expect(slotRegistry.get(slot)).toHaveLength(0)
        expect(notifications).toBeGreaterThan(before)
        unsubscribe()
    })
})
