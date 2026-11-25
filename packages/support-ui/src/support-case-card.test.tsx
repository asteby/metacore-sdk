// @vitest-environment happy-dom
import { cleanup, render, screen } from '@testing-library/react'
import { createInstance } from 'i18next'
import { I18nextProvider, initReactI18next } from 'react-i18next'
import { afterEach, describe, expect, it } from 'vitest'
import { baseResources } from '@asteby/metacore-i18n'
import { SupportCaseCard, isSupportCaseStatus } from './support-case-card'

afterEach(cleanup)

function i18n(lng: 'es' | 'en') {
  const inst = createInstance()
  void inst.use(initReactI18next).init({ lng, resources: baseResources, interpolation: { escapeValue: false }, initAsync: false })
  return inst
}
const ui = (lng: 'es' | 'en', node: React.ReactNode) => render(<I18nextProvider i18n={i18n(lng)}>{node}</I18nextProvider>)

describe('SupportCaseCard', () => {
  it.each([
    ['open', 'Abierto', 'info'],
    ['resolved', 'Resuelto', 'success'],
    ['closed', 'Cerrado', 'muted'],
  ] as const)('renders the %s state with folio, subject and a labelled status', (status, label) => {
    ui('es', <SupportCaseCard status={status} folio="OPS-000123" subject="Stock mismatch" />)
    const card = screen.getByTestId('support-case-card')
    expect(card.getAttribute('data-status')).toBe(status)
    expect(card.getAttribute('aria-label')).toBe(`Caso OPS-000123: ${label}`)
    expect(screen.getByTestId('case-card-status').textContent).toBe(label)
    expect(screen.getByText('Caso OPS-000123')).toBeTruthy()
    expect(screen.getByText('Stock mismatch')).toBeTruthy()
    expect(screen.queryByText('Solución')).toBeNull()
  })

  it('shows the solution when present and speaks English', () => {
    ui('en', <SupportCaseCard status="resolved" folio="OPS-9" solution="Re-synced the stock" />)
    expect(screen.getByText('Solution')).toBeTruthy()
    expect(screen.getByText('Re-synced the stock')).toBeTruthy()
    expect(screen.getByTestId('case-card-status').textContent).toBe('Resolved')
    expect(screen.getByText('Case OPS-9')).toBeTruthy()
  })

  it('renders the host action slot', () => {
    ui('es', <SupportCaseCard status="open" folio="OPS-1" action={<a href="/casos/OPS-1">Ver caso</a>} />)
    expect(screen.getByRole('link', { name: 'Ver caso' })).toBeTruthy()
  })

  it('guards untrusted statuses', () => {
    expect(isSupportCaseStatus('open')).toBe(true)
    expect(isSupportCaseStatus('weird')).toBe(false)
    expect(isSupportCaseStatus(undefined)).toBe(false)
  })
})
