import { describe, it, expect, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (_k: string, o?: { defaultValue?: string }) => o?.defaultValue ?? _k,
  }),
}))

import { LoadState } from './load-state'

describe('LoadState', () => {
  it('renders the skeleton in a polite busy live region while loading', () => {
    const html = renderToStaticMarkup(<LoadState loading skeleton={<i data-sk />} />)
    expect(html).toContain('role="status"')
    expect(html).toContain('aria-busy="true"')
    expect(html).toContain('aria-live="polite"')
    expect(html).toContain('data-sk')
  })

  it('renders an alert with retry on error, never the skeleton', () => {
    const html = renderToStaticMarkup(
      <LoadState loading={false} error={new Error('x')} onRetry={() => {}} skeleton={<i data-sk />}>
        <p>content</p>
      </LoadState>,
    )
    expect(html).toContain('role="alert"')
    expect(html).toContain('Retry')
    expect(html).not.toContain('data-sk')
    expect(html).not.toContain('<p>content</p>')
  })

  it('omits the retry button when no handler is given and honours label overrides', () => {
    const html = renderToStaticMarkup(
      <LoadState loading={false} error labels={{ title: 'Custom', hint: 'Hint' }} skeleton={null} />,
    )
    expect(html).toContain('Custom')
    expect(html).not.toContain('<button')
  })

  it('renders children when idle', () => {
    const html = renderToStaticMarkup(
      <LoadState loading={false} skeleton={null}>
        <p>content</p>
      </LoadState>,
    )
    expect(html).toBe('<p>content</p>')
  })
})
