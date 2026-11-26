// @vitest-environment happy-dom
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { createInstance } from 'i18next'
import { I18nextProvider, initReactI18next } from 'react-i18next'
import { baseResources } from '@asteby/metacore-i18n'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { TeamChatChannel, TeamChatMessage } from './data/types'

const { get, post } = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn() }))

vi.mock('../host', async (orig) => ({
  ...(await orig<typeof import('../host')>()),
  api: { get, post },
  useWebSocketContext: () => ({
    subscribe: () => () => {},
    setActiveTeamChatChannelId: () => {},
    presenceByUserId: {},
  }),
  useWorkspaceUser: () => ({ id: 'me', name: 'Yo' }),
  useWorkspacePlatformConfig: () => ({ mascot_name: 'Aby', mascot_skin: 'default' }),
  useNavigation: () => ({ data: [] }),
}))
vi.mock('./call-provider', () => ({
  useCall: () => ({ startCall: vi.fn(), joinCall: vi.fn(), session: null }),
}))
vi.mock('@tanstack/react-router', () => ({ useNavigate: () => vi.fn() }))
vi.mock('../workspace/mascot', () => ({ Mascot: () => null }))

import { TeamChat } from './index'

const lang = (l: 'es' | 'en') => {
  const inst = createInstance()
  void inst.use(initReactI18next).init({ lng: l, resources: baseResources, interpolation: { escapeValue: false }, initAsync: false })
  return inst
}

const CONTACT = 'contact-1'
const T_WAIT = 'ticket-wait'
const T_DONE = 'ticket-done'

const contact = (): TeamChatChannel => ({
  id: CONTACT,
  name: 'Soporte',
  kind: 'dm',
  is_default: false,
  unread: 2,
  muted: false,
  thread: 'support',
  sub_threads: true,
  capabilities: { calls: false, reactions: false, replies: false, attachments: true },
  dm_user: { id: 'sup', name: 'Soporte', online: true },
})

const threads = {
  success: true,
  threads: [
    { id: T_WAIT, scope: 'OPS-AAA', title: 'No carga el inventario', state: 'waiting', group: 'waiting', unread: 2, last_message: { body: '¿Qué navegador usas?', created_at: '2026-11-25T10:00:00Z' }, updated_at: '2026-11-25T10:00:00Z' },
    { id: T_DONE, scope: 'OPS-BBB', title: 'Factura duplicada', state: 'resolved', group: 'resolved', unread: 0, last_message: { body: 'Listo', created_at: '2026-11-24T10:00:00Z' }, updated_at: '2026-11-24T10:00:00Z' },
  ],
  groups: [
    { key: 'waiting', count: 1, unread: 2 },
    { key: 'open', count: 0, unread: 0 },
    { key: 'resolved', count: 1, unread: 0 },
    { key: 'closed', count: 0, unread: 0 },
  ],
}

const card = (id: string, event: string, state: string, actions: unknown[] = []): TeamChatMessage => ({
  id,
  channel_id: CONTACT,
  sender_id: 'sup',
  sender_name: 'Soporte',
  body: `Caso OPS-BBB ${event}`,
  created_at: '2026-11-24T09:00:00Z',
  attachments: [{ type: 'support_case', event, state, status: state === 'resolved' ? 'resolved' : 'open', folio: 'OPS-BBB', subject: 'Factura duplicada', actions }] as never,
})

const bubble = (id: string, body: string, mine = false): TeamChatMessage => ({
  id,
  channel_id: CONTACT,
  sender_id: mine ? 'me' : 'sup',
  sender_name: mine ? 'Yo' : 'Soporte',
  body,
  created_at: '2026-11-24T09:30:00Z',
})

const MESSAGES: Record<string, TeamChatMessage[]> = {
  [T_WAIT]: [bubble('w1', 'No carga', true), bubble('w2', '¿Qué navegador usas?')],
  [T_DONE]: [
    card('d0', 'opened', 'resolved'),
    bubble('d1', 'Me cobraron dos veces', true),
    card('d2', 'resolved', 'resolved', [
      { id: 'view', href: '/a/soporte/casos/c/OPS-BBB' },
      { id: 'reopen', request: { method: 'POST', path: '/support/cases/OPS-BBB/reopen' } },
      { id: 'finalize', request: { method: 'POST', path: '/support/cases/OPS-BBB/close' } },
    ]),
  ],
}

async function openContact(l: 'es' | 'en' = 'es') {
  get.mockImplementation(async (url: string) => {
    if (url.endsWith('/threads')) return { data: threads }
    const m = /channels\/([^/]+)\/messages$/.exec(url)
    if (m) return { data: { messages: [...(MESSAGES[m[1]] ?? [])].reverse() } }
    return { data: { channels: [contact()] } }
  })
  post.mockResolvedValue({ data: { success: true } })
  render(
    <I18nextProvider i18n={lang(l)}>
      <TeamChat />
    </I18nextProvider>,
  )
  const row = await screen.findByText('Soporte')
  await act(async () => {
    fireEvent.click(row)
  })
}

beforeEach(() => {
  get.mockReset()
  post.mockReset()
  Element.prototype.scrollIntoView = vi.fn()
})
afterEach(cleanup)

describe('Soporte contact with one thread per ticket', () => {
  it('opens the ticket list grouped by state, with unread and "Nuevo ticket" always at hand (not one mixed thread)', async () => {
    await openContact()
    expect(await screen.findByText('Tus tickets')).toBeTruthy()
    expect(screen.getByText('No carga el inventario')).toBeTruthy()
    expect(screen.getByText('Factura duplicada')).toBeTruthy()
    const groups = screen.getAllByRole('heading', { level: 3 }).map((h) => h.textContent)
    expect(groups[0]).toContain('Esperando tu respuesta')
    expect(groups[1]).toContain('Resueltos')
    expect(screen.getByLabelText('2 sin leer')).toBeTruthy()
    expect(screen.getByTestId('new-ticket')).toBeTruthy()
    // No composer until a ticket is chosen: the list is the landing.
    expect(screen.queryByPlaceholderText('Escribe un mensaje…')).toBeNull()
  })

  it('entering a ticket loads ITS thread, shows the state and explanation, and the back button returns to the list', async () => {
    await openContact()
    fireEvent.click(await screen.findByText('No carga el inventario'))
    expect(await screen.findByText('¿Qué navegador usas?')).toBeTruthy()
    expect(get).toHaveBeenCalledWith(`/internal-chat/channels/${T_WAIT}/messages`)
    const header = screen.getByTestId('ticket-header')
    expect(within(header).getByText('Esperando tu respuesta')).toBeTruthy()
    expect(screen.getByTestId('ticket-hint').textContent).toContain('Soporte necesita algo de ti')
    // Writing goes to the ticket's own channel.
    fireEvent.change(screen.getByPlaceholderText('Escribe un mensaje…'), { target: { value: 'Uso Chrome' } })
    post.mockResolvedValueOnce({ data: { message: bubble('w3', 'Uso Chrome', true) } })
    fireEvent.submit(screen.getByPlaceholderText('Escribe un mensaje…').closest('form')!)
    await waitFor(() => expect(post).toHaveBeenCalledWith(`/internal-chat/channels/${T_WAIT}/messages`, { body: 'Uso Chrome' }))
    fireEvent.click(screen.getByLabelText('Volver a tickets'))
    expect(await screen.findByText('Tus tickets')).toBeTruthy()
  })

  it('lifecycle events are system cards, not bubbles; a resolved ticket asks "¿Se resolvió?" and Reabrir runs the server-declared request', async () => {
    await openContact()
    fireEvent.click(await screen.findByText('Factura duplicada'))
    const cards = await screen.findAllByTestId('support-event-card')
    expect(cards.map((c) => c.getAttribute('data-event'))).toEqual(['opened', 'resolved'])
    // Real messages stay bubbles.
    expect(screen.getByText('Me cobraron dos veces')).toBeTruthy()
    // Only the newest card keeps Reabrir / Finalizar; the composer is replaced by the prompt.
    expect(within(cards[0]).queryByRole('button', { name: 'Reabrir' })).toBeNull()
    expect(screen.queryByPlaceholderText('Escribe un mensaje…')).toBeNull()
    const prompt = screen.getByTestId('support-resolved-prompt')
    expect(within(prompt).getByText('¿Se resolvió?')).toBeTruthy()
    expect(within(prompt).getByRole('button', { name: 'Abrir otro ticket' })).toBeTruthy()
    await act(async () => {
      fireEvent.click(within(prompt).getByRole('button', { name: 'Reabrir' }))
    })
    expect(post).toHaveBeenCalledWith('/support/cases/OPS-BBB/reopen', {})
  })

  it('"Abrir otro ticket" with a ticket waiting names it before opening a new one', async () => {
    await openContact()
    fireEvent.click(await screen.findByTestId('new-ticket'))
    fireEvent.change(await screen.findByLabelText('Cuéntanos qué pasa'), { target: { value: 'Otro tema' } })
    fireEvent.click(screen.getByText('Abrir ticket'))
    expect((await screen.findByTestId('support-duplicate-notice')).textContent).toContain('OPS-AAA')
    expect(post).not.toHaveBeenCalled()
    post.mockResolvedValueOnce({ data: { message: { ...bubble('n1', 'Otro tema', true), thread_id: 'ticket-new' } } })
    fireEvent.click(screen.getByText('Abrir uno nuevo'))
    await waitFor(() => expect(post).toHaveBeenCalledWith(`/internal-chat/channels/${CONTACT}/messages`, { body: 'Otro tema', new_thread: true }))
  })

  it('renders in English with the same vocabulary', async () => {
    await openContact('en')
    expect(await screen.findByText('Your tickets')).toBeTruthy()
    expect(screen.getAllByText('Waiting for your reply').length).toBeGreaterThan(0)
  })
})
