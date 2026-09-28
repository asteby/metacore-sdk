// @vitest-environment happy-dom
import { describe, expect, it, vi, afterEach } from 'vitest'
import { render } from '@testing-library/react'
import { useRef } from 'react'
import { useFlipAnimation } from '../use-flip-animation'

function List({ order, reduced }: { order: string[]; reduced?: boolean }) {
  const ref = useRef<HTMLUListElement>(null)
  useFlipAnimation(ref, order.join(','), { disabled: reduced })
  return (
    <ul ref={ref}>
      {order.map((k) => (
        <li key={k} data-flip-key={k}>
          {k}
        </li>
      ))}
    </ul>
  )
}

// happy-dom has no layout: place each item by its index in the list.
function fakeLayout() {
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
    const parent = this.parentElement
    const index = parent && this.dataset.flipKey ? Array.from(parent.children).indexOf(this) : 0
    const top = this.dataset.flipKey ? index * 40 : 0
    return { top, left: 0, width: 100, height: 40, right: 100, bottom: top + 40, x: 0, y: top, toJSON() {} } as DOMRect
  })
}

afterEach(() => {
  vi.restoreAllMocks()
  vi.useRealTimers()
})

describe('useFlipAnimation', () => {
  it('animates moved items from their old position', () => {
    vi.useFakeTimers()
    fakeLayout()
    const animate = vi.fn()
    HTMLElement.prototype.animate = animate as never

    const view = render(<List order={['a', 'b', 'c']} />)
    vi.advanceTimersByTime(400) // at-rest snapshot
    view.rerender(<List order={['c', 'a', 'b']} />)

    const moves = animate.mock.calls.map(([frames]) => (frames as Keyframe[])[0]!.transform)
    // c: 80 → 0, a: 0 → 40, b: 40 → 80
    expect(moves).toContain('translate(0px, 80px)')
    expect(moves).toContain('translate(0px, -40px)')
    expect(animate).toHaveBeenCalledTimes(3)
  })

  it('stays still when disabled (reduced motion path)', () => {
    vi.useFakeTimers()
    fakeLayout()
    const animate = vi.fn()
    HTMLElement.prototype.animate = animate as never

    const view = render(<List order={['a', 'b']} reduced />)
    vi.advanceTimersByTime(400)
    view.rerender(<List order={['b', 'a']} reduced />)
    expect(animate).not.toHaveBeenCalled()
  })

  it('stays still under prefers-reduced-motion', () => {
    vi.useFakeTimers()
    fakeLayout()
    const animate = vi.fn()
    HTMLElement.prototype.animate = animate as never
    vi.spyOn(window, 'matchMedia').mockImplementation(
      (query: string) => ({ matches: query.includes('reduce'), media: query }) as MediaQueryList,
    )

    const view = render(<List order={['a', 'b']} />)
    vi.advanceTimersByTime(400)
    view.rerender(<List order={['b', 'a']} />)
    expect(animate).not.toHaveBeenCalled()
  })

  it('works with a root resolved from the DOM instead of a wrapper element', () => {
    vi.useFakeTimers()
    fakeLayout()
    const animate = vi.fn()
    HTMLElement.prototype.animate = animate as never
    const domRef = {
      get current() {
        return document.querySelector<HTMLElement>('[data-slot="list"]')
      },
    }
    function Resolved({ order }: { order: string[] }) {
      useFlipAnimation(domRef, order.join(','))
      return (
        <ul data-slot="list">
          {order.map((k) => (
            <li key={k} data-flip-key={k}>
              {k}
            </li>
          ))}
        </ul>
      )
    }

    const view = render(<Resolved order={['a', 'b']} />)
    vi.advanceTimersByTime(400)
    view.rerender(<Resolved order={['b', 'a']} />)
    expect(animate).toHaveBeenCalledTimes(2)
  })
})
