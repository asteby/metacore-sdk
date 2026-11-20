import { describe, it, expect } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { Skeleton, SkeletonRow, SkeletonList } from './skeleton'

describe('Skeleton sizing tokens', () => {
  it('Skeleton radius comes from the --skeleton-radius token', () => {
    expect(renderToStaticMarkup(<Skeleton />)).toContain('var(--skeleton-radius')
  })

  it('SkeletonRow height/avatar/line sizes read the density-aware tokens', () => {
    const html = renderToStaticMarkup(<SkeletonRow />)
    expect(html).toContain('height:var(--skeleton-row-h, 3.25rem)')
    expect(html).toContain('var(--skeleton-avatar, 2.5rem)')
    expect(html).toContain('var(--skeleton-line-h, 0.75rem)')
  })

  it('the lg row uses its own token and avatar can be dropped', () => {
    const html = renderToStaticMarkup(<SkeletonRow size='lg' avatar={false} lines={1} />)
    expect(html).toContain('--skeleton-row-h-lg')
    expect(html).not.toContain('rounded-full')
  })

  it('SkeletonList is a busy polite live region with N rows and an sr label', () => {
    const html = renderToStaticMarkup(<SkeletonList rows={3} label='Loading' />)
    expect(html).toContain('role="status"')
    expect(html).toContain('aria-busy="true"')
    expect(html.match(/data-slot="skeleton-row"/g)).toHaveLength(3)
    expect(html).toContain('>Loading<')
  })
})
