// @vitest-environment happy-dom
import * as React from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { ProviderSortableList, type ProviderSortableItem } from './provider-sortable-list'
import { dropIndexFromPointer, moveId, moveItem } from './reorder'
import { providerStatus } from './model'

afterEach(cleanup)

const items: ProviderSortableItem[] = [
    { id: 'a', label: 'Alfa', status: 'ready' },
    { id: 'b', label: 'Beta', status: 'missing_credentials' },
    { id: 'c', label: 'Gamma', status: 'sandbox' },
    { id: 'x', label: 'Zeta', status: 'unavailable' },
]
const ids = () => [...document.querySelectorAll('li[data-id]:not([data-ineligible])')].map((e) => e.getAttribute('data-id'))
const handle = (id: string) => document.querySelector(`[data-handle="${id}"]`) as HTMLElement

describe('reorder helpers', () => {
    it('moveItem / moveId clamp and no-op', () => {
        expect(moveItem(['a', 'b', 'c'], 0, 2)).toEqual(['b', 'c', 'a'])
        expect(moveItem(['a', 'b', 'c'], 0, -1)).toEqual(['a', 'b', 'c'])
        expect(moveId(['a', 'b', 'c'], 'c', -1)).toEqual(['a', 'c', 'b'])
        expect(moveId(['a', 'b'], 'zz', 1)).toEqual(['a', 'b'])
    })
    it('dropIndexFromPointer counts midpoints above the pointer', () => {
        expect(dropIndexFromPointer(5, [10, 30])).toBe(0)
        expect(dropIndexFromPointer(20, [10, 30])).toBe(1)
        expect(dropIndexFromPointer(99, [10, 30])).toBe(2)
    })
})

describe('ProviderSortableList', () => {
    it('shows status badges, inherited note, and ineligible after the sortable ones', () => {
        render(<ProviderSortableList items={items} onReorder={() => {}} inherited />)
        expect(screen.getByText('Listo')).toBeTruthy()
        expect(screen.getByText('Sin credenciales')).toBeTruthy()
        expect(screen.getByText('Sandbox')).toBeTruthy()
        expect(screen.getByText('No atiende')).toBeTruthy()
        expect(screen.getByText('Hereda de la organización')).toBeTruthy()
        expect(ids()).toEqual(['a', 'b', 'c'])
    })

    it('keyboard: grab, move, drop emits the new order', () => {
        const onReorder = vi.fn()
        render(<ProviderSortableList items={items} onReorder={onReorder} />)
        fireEvent.keyDown(handle('a'), { key: ' ' })
        fireEvent.keyDown(handle('a'), { key: 'ArrowDown' })
        fireEvent.keyDown(handle('a'), { key: 'ArrowDown' })
        expect(ids()).toEqual(['b', 'c', 'a'])
        expect(onReorder).not.toHaveBeenCalled()
        fireEvent.keyDown(handle('a'), { key: ' ' })
        expect(onReorder).toHaveBeenCalledExactlyOnceWith(['b', 'c', 'a'])
    })

    it('keyboard: Escape cancels and restores the order', () => {
        const onReorder = vi.fn()
        render(<ProviderSortableList items={items} onReorder={onReorder} />)
        fireEvent.keyDown(handle('b'), { key: 'Enter' })
        fireEvent.keyDown(handle('b'), { key: 'ArrowUp' })
        fireEvent.keyDown(handle('b'), { key: 'Escape' })
        expect(ids()).toEqual(['a', 'b', 'c'])
        expect(onReorder).not.toHaveBeenCalled()
    })

    it('keyboard: arrows do nothing unless grabbed; edges clamp', () => {
        const onReorder = vi.fn()
        render(<ProviderSortableList items={items} onReorder={onReorder} />)
        fireEvent.keyDown(handle('a'), { key: 'ArrowDown' })
        expect(ids()).toEqual(['a', 'b', 'c'])
        fireEvent.keyDown(handle('a'), { key: ' ' })
        fireEvent.keyDown(handle('a'), { key: 'ArrowUp' })
        fireEvent.keyDown(handle('a'), { key: ' ' })
        expect(onReorder).not.toHaveBeenCalled()
    })

    it('pointer: dragging over the midpoints emits the new order', () => {
        const onReorder = vi.fn()
        render(<ProviderSortableList items={items} onReorder={onReorder} />)
        const tops: Record<string, number> = { a: 0, b: 40, c: 80 }
        for (const [id, top] of Object.entries(tops)) {
            const li = document.querySelector(`li[data-id="${id}"]`) as HTMLElement
            li.getBoundingClientRect = () => ({ top, height: 30, bottom: top + 30, left: 0, right: 100, width: 100, x: 0, y: top, toJSON() {} }) as DOMRect
        }
        fireEvent.pointerDown(handle('a'), { button: 0, pointerId: 1 })
        fireEvent.pointerMove(handle('a'), { clientY: 100, pointerId: 1 })
        expect(ids()).toEqual(['b', 'c', 'a'])
        fireEvent.pointerUp(handle('a'), { pointerId: 1 })
        expect(onReorder).toHaveBeenCalledExactlyOnceWith(['b', 'c', 'a'])
    })

    it('a non-eligible item has no handle, never enters the order and cannot be dragged', () => {
        const onReorder = vi.fn()
        render(<ProviderSortableList items={items} onReorder={onReorder} />)
        expect(handle('x')).toBeNull()
        const li = document.querySelector('li[data-id="x"]') as HTMLElement
        expect(li.getAttribute('aria-disabled')).toBe('true')
        fireEvent.pointerDown(li, { button: 0 })
        fireEvent.keyDown(li, { key: ' ' })
        fireEvent.keyDown(li, { key: 'ArrowUp' })
        expect(onReorder).not.toHaveBeenCalled()
        // Moving the last sortable item down never passes the ineligible one.
        fireEvent.keyDown(handle('c'), { key: ' ' })
        fireEvent.keyDown(handle('c'), { key: 'ArrowDown' })
        fireEvent.keyDown(handle('c'), { key: ' ' })
        expect(onReorder).not.toHaveBeenCalled()
        // `eligible: false` also excludes an item whose status is ready.
        render(<ProviderSortableList items={[{ id: 'q', label: 'Q', status: 'ready', eligible: false }]} onReorder={onReorder} />)
        expect(handle('q')).toBeNull()
    })

    it('honors the order prop and disabled', () => {
        const onReorder = vi.fn()
        render(<ProviderSortableList items={items} order={['c', 'a']} onReorder={onReorder} disabled />)
        expect(ids()).toEqual(['c', 'a', 'b'])
        fireEvent.keyDown(handle('c'), { key: ' ' })
        fireEvent.keyDown(handle('c'), { key: 'ArrowDown' })
        fireEvent.keyDown(handle('c'), { key: ' ' })
        expect(onReorder).not.toHaveBeenCalled()
    })
})

describe('providerStatus', () => {
    const p = { addon_key: 'p', installed: true, default: false, countries: ['MX'] }
    it('maps serving, credentials and environment', () => {
        expect(providerStatus(p, undefined, { code: 'us', countries: ['US'] })).toBe('unavailable')
        expect(providerStatus(p, { addon_key: 'p', connection: { state: 'missing_credentials' } }, null)).toBe('missing_credentials')
        expect(providerStatus(p, { addon_key: 'p', connection: { state: 'connected', environment: 'sandbox' } }, null)).toBe('sandbox')
        expect(providerStatus(p, { addon_key: 'p', connection: { state: 'connected', environment: 'production' } }, null)).toBe('ready')
        expect(providerStatus(p, undefined, null)).toBe('ready')
    })
})
