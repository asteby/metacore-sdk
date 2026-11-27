// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { createInstance } from 'i18next'
import { I18nextProvider, initReactI18next } from 'react-i18next'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { baseResources, en, es } from '@asteby/metacore-i18n'
import { SUPPORT_CLIENT_STATES, SUPPORT_STATE_META, clientStateOf } from './lifecycle'
import { SupportEventCard } from './event-card'
import { SupportTicketList, type SupportTicketItem } from './ticket-list'
import { SupportStatusBadge } from './status-badge'

afterEach(cleanup)

const wrap = (lng: 'es' | 'en', node: React.ReactNode) => {
  const inst = createInstance()
  void inst.use(initReactI18next).init({ lng, resources: baseResources, interpolation: { escapeValue: false }, initAsync: false })
  return render(<I18nextProvider i18n={inst}>{node}</I18nextProvider>)
}

describe('clientStateOf', () => {
  it.each([
    [{ status: 'open' }, 'new'],
    [{ status: 'open', replied: true }, 'in_progress'],
    [{ status: 'open', lastAuthor: 'agent' }, 'waiting'],
    [{ status: 'open', lastAuthor: 'ai' }, 'waiting'],
    [{ status: 'open', reopened: true }, 'reopened'],
    [{ status: 'open', lifecycle: { phase: 'reopened' } }, 'reopened'],
    [{ status: 'resolved', lastAuthor: 'agent' }, 'resolved'],
    [{ status: 'closed' }, 'closed'],
    [{ status: 'open', state: 'in_progress', lastAuthor: 'agent' }, 'in_progress'],
    [{ status: 'open', state: 'bogus' }, 'new'],
  ] as const)('%j -> %s', (input, want) => {
    expect(clientStateOf(input as never)).toBe(want)
  })

  it('every state has label and hint in es and en (one vocabulary, nothing hardcoded)', () => {
    for (const s of SUPPORT_CLIENT_STATES) {
      for (const b of [es, en]) {
        const st = (b.supportThread as unknown as { state: Record<string, { label: string; hint: string }> }).state[s]
        expect(st.label).toBeTruthy()
        expect(st.hint).toBeTruthy()
      }
      expect(SUPPORT_STATE_META[s].icon).toBeTruthy()
    }
  })
})

describe('shared support components', () => {
  it('SupportStatusBadge shows icon-less text label and is keyboard focusable for its tooltip', () => {
    wrap('es', <SupportStatusBadge state="waiting" />)
    const b = screen.getByTestId('support-state')
    expect(b.textContent).toBe('Esperando tu respuesta')
    expect(b.getAttribute('tabindex')).toBe('0')
  })

  it('SupportEventCard is a labelled section (not a bubble) with folio, subject, state and contextual actions', () => {
    const onAction = vi.fn()
    wrap(
      'es',
      <SupportEventCard event="resolved" state="resolved" folio="OPS-1" subject="Factura" solution="Corregida" at="2026-11-25T10:00:00Z" actions={[{ id: 'view', href: '/x' }, { id: 'reopen' }]} onAction={onAction} />,
    )
    const card = screen.getByTestId('support-event-card')
    expect(card.getAttribute('aria-label')).toBe('Ticket resuelto: OPS-1')
    expect(card.textContent).toContain('Corregida')
    fireEvent.click(screen.getByRole('button', { name: 'Reabrir' }))
    expect(onAction).toHaveBeenCalledWith({ id: 'reopen' })
  })

  it('SupportTicketList groups by state in a fixed order, flags unread and pages the finished group', () => {
    const t = (id: string, state: SupportTicketItem['state'], unread = 0): SupportTicketItem => ({ id, folio: id, subject: `S-${id}`, state, unread })
    const onLoadMore = vi.fn()
    const onNew = vi.fn()
    wrap(
      'en',
      <SupportTicketList
        tickets={[t('a', 'closed'), t('b', 'resolved'), t('c', 'waiting', 3), t('d', 'new')]}
        groups={[{ key: 'closed', count: 9, hasMore: true }]}
        onSelect={() => {}}
        onNewTicket={onNew}
        onLoadMore={onLoadMore}
      />,
    )
    expect(screen.getAllByRole('heading', { level: 3 }).map((h) => h.textContent?.replace(/\d+$/, ''))).toEqual(['Waiting for your reply', 'Open', 'Resolved', 'Finished'])
    expect(screen.getAllByText('3 unread').length).toBeGreaterThan(0)
    fireEvent.click(screen.getByText('Show more finished'))
    expect(onLoadMore).toHaveBeenCalledWith('closed')
    fireEvent.click(screen.getByTestId('new-ticket'))
    expect(onNew).toHaveBeenCalled()
  })
})
