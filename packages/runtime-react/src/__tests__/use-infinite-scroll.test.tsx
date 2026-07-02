// @vitest-environment happy-dom
//
// Shared infinite-scroll primitives (used by both DynamicTable and
// DynamicKanban):
//   1. dedupeById — pure append that drops ids already present, preserves order,
//      and is identity-stable when there is nothing new to add.
//   2. useInfiniteScrollSentinel — an IntersectionObserver wrapper. happy-dom
//      has no IntersectionObserver, so we install a controllable fake and drive
//      it: entering view fires onLoadMore, `disabled` suppresses it, and the
//      absence of IntersectionObserver degrades to a no-op instead of throwing.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render } from '@testing-library/react'
import { useEffect, useState } from 'react'
import { dedupeById, useInfiniteScrollSentinel } from '../use-infinite-scroll'

afterEach(cleanup)

describe('dedupeById', () => {
    it('appends only rows whose id is not already present', () => {
        const existing = [{ id: 1, n: 'a' }, { id: 2, n: 'b' }]
        const incoming = [{ id: 2, n: 'b2' }, { id: 3, n: 'c' }]
        const out = dedupeById(existing, incoming)
        expect(out.map((r) => r.id)).toEqual([1, 2, 3])
        // The already-present row keeps the ORIGINAL (existing wins over incoming).
        expect(out[1].n).toBe('b')
    })

    it('preserves the order of existing then the new arrivals', () => {
        const out = dedupeById(
            [{ id: 'x' }, { id: 'y' }],
            [{ id: 'z' }, { id: 'w' }],
        )
        expect(out.map((r) => r.id)).toEqual(['x', 'y', 'z', 'w'])
    })

    it('returns the SAME array reference when nothing is added', () => {
        const existing = [{ id: 1 }, { id: 2 }]
        expect(dedupeById(existing, [])).toBe(existing)
        expect(dedupeById(existing, [{ id: 1 }, { id: 2 }])).toBe(existing)
    })

    it('treats numeric and string ids as the same key', () => {
        const out = dedupeById([{ id: 1 }], [{ id: '1' }, { id: 2 }])
        expect(out.map((r) => r.id)).toEqual([1, 2])
    })
})

// ---------------------------------------------------------------------------
// Controllable IntersectionObserver fake
// ---------------------------------------------------------------------------

type IOEntry = { isIntersecting: boolean }
let observers: FakeIO[] = []

class FakeIO {
    cb: (entries: IOEntry[]) => void
    observed: Element[] = []
    disconnected = false
    constructor(cb: (entries: IOEntry[]) => void) {
        this.cb = cb
        observers.push(this)
    }
    observe(el: Element) {
        this.observed.push(el)
    }
    disconnect() {
        this.disconnected = true
    }
    // Test helper: simulate the sentinel scrolling into / out of view.
    fire(isIntersecting: boolean) {
        this.cb([{ isIntersecting }])
    }
}

function Harness({
    onLoadMore,
    disabled,
}: {
    onLoadMore: () => void
    disabled?: boolean
}) {
    const { rootRef, sentinelRef } = useInfiniteScrollSentinel({ onLoadMore, disabled })
    return (
        <div ref={rootRef}>
            <div ref={sentinelRef} data-testid="sentinel" />
        </div>
    )
}

describe('useInfiniteScrollSentinel', () => {
    beforeEach(() => {
        observers = []
        ;(globalThis as any).IntersectionObserver = FakeIO
    })
    afterEach(() => {
        delete (globalThis as any).IntersectionObserver
    })

    it('fires onLoadMore when the sentinel intersects', () => {
        const onLoadMore = vi.fn()
        render(<Harness onLoadMore={onLoadMore} />)
        expect(observers).toHaveLength(1)
        observers[0].fire(true)
        expect(onLoadMore).toHaveBeenCalledTimes(1)
    })

    it('does NOT fire when disabled (load in flight / no more pages)', () => {
        const onLoadMore = vi.fn()
        render(<Harness onLoadMore={onLoadMore} disabled />)
        observers[0].fire(true)
        expect(onLoadMore).not.toHaveBeenCalled()
    })

    it('ignores non-intersecting callbacks (scrolling away)', () => {
        const onLoadMore = vi.fn()
        render(<Harness onLoadMore={onLoadMore} />)
        observers[0].fire(false)
        expect(onLoadMore).not.toHaveBeenCalled()
    })

    it('reads the LATEST onLoadMore/disabled through a ref (no observer churn)', () => {
        // A parent that flips `disabled` from true -> false without remounting;
        // the observer must not be torn down, and the newest callback wins.
        const calls: string[] = []
        function Parent() {
            const [enabled, setEnabled] = useState(false)
            useEffect(() => {
                setEnabled(true)
            }, [])
            return (
                <Harness onLoadMore={() => calls.push('load')} disabled={!enabled} />
            )
        }
        render(<Parent />)
        // Only ONE observer instance across the disabled->enabled flip.
        expect(observers).toHaveLength(1)
        observers[0].fire(true)
        expect(calls).toEqual(['load'])
    })

    it('degrades to a no-op when IntersectionObserver is unavailable', () => {
        delete (globalThis as any).IntersectionObserver
        const onLoadMore = vi.fn()
        // Must render without throwing even though there is no IO.
        expect(() => render(<Harness onLoadMore={onLoadMore} />)).not.toThrow()
    })
})
