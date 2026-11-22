// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render } from '@testing-library/react'
import axe from 'axe-core'
import { PromoProgressBar, crowdedAnchors } from './index.js'

afterEach(cleanup)

const tiers = (positions: number[]) =>
  positions.map((position, i) => ({ id: `t${i}`, label: `${(i + 1) * 5} %`, threshold: `$${2300 + i * 400}`, reached: false, position }))

describe('crowdedAnchors', () => {
  it.each([
    ['Gods 85 / 100: the previous label ends at its marker, the last keeps the right edge', [85, 100], ['end', undefined]],
    ['mid-bar pair: end then start', [40, 60], ['end', 'start']],
    ['far apart: untouched', [20, 60, 90], [undefined, undefined, undefined]],
    ['first one at the left edge keeps its anchor', [8, 20], [undefined, 'start']],
    ['exactly the gap is not crowded', [30, 52], [undefined, undefined]],
    ['a run of three fans out', [30, 40, 50], ['end', 'end', 'start']],
  ] as const)('%s', (_n, positions, expected) => {
    expect(crowdedAnchors([...positions])).toEqual(expected)
  })
})

describe('PromoProgressBar crowded milestones', () => {
  it('marks data-crowded on the DOM, keeps the edge anchor and passes axe', async () => {
    const { container } = render(
      <PromoProgressBar kind="discount" state="progress" text="Te faltan $400" percent={50} label="Progreso" milestones={tiers([85, 100])} />,
    )
    const items = Array.from(container.querySelectorAll('[data-sf-promo-milestones] > li'))
    expect(items.map((li) => li.getAttribute('data-crowded'))).toEqual(['end', null])
    expect(items[1]!.getAttribute('data-edge')).toBe('end')
    const r = await axe.run(container, { rules: { 'color-contrast': { enabled: false } } })
    expect(r.violations).toEqual([])
  })
  it('leaves spread milestones without data-crowded', () => {
    const { container } = render(<PromoProgressBar kind="discount" state="progress" text="x" percent={10} label="P" milestones={tiers([30, 70])} />)
    expect(container.querySelectorAll('[data-crowded]')).toHaveLength(0)
  })
})
