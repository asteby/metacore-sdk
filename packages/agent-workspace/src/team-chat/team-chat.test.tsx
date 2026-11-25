// @vitest-environment happy-dom
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
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
vi.mock('../workspace/mascot', () => ({ Mascot: () => null }))

import { TeamChat } from './index'

const lang = (l: 'es' | 'en') => {
  const inst = createInstance()
  void inst.use(initReactI18next).init({ lng: l, resources: baseResources, interpolation: { escapeValue: false }, initAsync: false })
  return inst
}

const msg = (over: Partial<TeamChatMessage> & { id: string }): TeamChatMessage => ({
  channel_id: 'c1',
  sender_id: 'u2',
  sender_name: 'Soporte Asteby',
  body: 'hola',
  created_at: '2026-11-25T10:00:00Z',
  ...over,
})

const channel = (over: Partial<TeamChatChannel> = {}): TeamChatChannel => ({
  id: 'c1',
  name: 'Soporte Asteby',
  kind: 'dm',
  is_default: false,
  unread: 0,
  muted: false,
  dm_user: { id: 'u2', name: 'Soporte Asteby', online: true },
  active_call: { id: 'call1', kind: 'audio', status: 'active' },
  ...over,
})

async function mount(
  ch: TeamChatChannel,
  messages: TeamChatMessage[] = [],
  l: 'es' | 'en' = 'es',
  extra: { sections?: unknown; onSectionAction?: (k: string, a: string) => void } = {},
) {
  get.mockImplementation(async (url: string) =>
    url.endsWith('/messages')
      ? { data: { messages: [...messages].reverse() } }
      : { data: { channels: [ch], ...(extra.sections ? { sections: extra.sections } : {}) } },
  )
  render(
    <I18nextProvider i18n={lang(l)}>
      <TeamChat onSectionAction={extra.onSectionAction} />
    </I18nextProvider>,
  )
  const item = await screen.findByText('Soporte Asteby')
  await act(async () => {
    fireEvent.click(item)
  })
  await screen.findByPlaceholderText('Escribe un mensaje…')
}

beforeEach(() => {
  get.mockReset()
  post.mockReset()
  Element.prototype.scrollIntoView = vi.fn()
})
afterEach(cleanup)

describe('TeamChat channel capabilities', () => {
  it('a channel without `capabilities` shows calls, join, reactions menu and attach exactly as before', async () => {
    await mount(channel(), [msg({ id: 'm1' })])
    expect(screen.getByTitle('Llamada de audio')).toBeTruthy()
    expect(screen.getByTitle('Videollamada')).toBeTruthy()
    expect(screen.getByTitle('Compartir pantalla')).toBeTruthy()
    expect(screen.getByTitle('Unirse a la llamada')).toBeTruthy()
    expect(screen.getAllByTitle('Adjuntar').length).toBeGreaterThan(0)
    fireEvent.contextMenu(screen.getByText('hola'))
    const menu = await screen.findByRole('menu')
    expect(within(menu).getByText('Responder')).toBeTruthy()
    expect(within(menu).getByTitle('Reaccionar 👍')).toBeTruthy()
  })

  it('explicit all-true capabilities equal the default', async () => {
    await mount(channel({ capabilities: { calls: true, reactions: true, replies: true, attachments: true } }), [msg({ id: 'm1' })])
    expect(screen.getByTitle('Llamada de audio')).toBeTruthy()
    fireEvent.contextMenu(screen.getByText('hola'))
    expect(await screen.findByRole('menu')).toBeTruthy()
  })

  it('calls:false hides the call buttons and the join action', async () => {
    await mount(channel({ capabilities: { calls: false } }), [msg({ id: 'm1' })])
    expect(screen.queryByTitle('Llamada de audio')).toBeNull()
    expect(screen.queryByTitle('Videollamada')).toBeNull()
    expect(screen.queryByTitle('Compartir pantalla')).toBeNull()
    expect(screen.queryByTitle('Unirse a la llamada')).toBeNull()
    // the rest is untouched
    expect(screen.getAllByTitle('Adjuntar').length).toBeGreaterThan(0)
  })

  it('reactions:false and replies:false leave no message menu (native context menu stays)', async () => {
    await mount(channel({ capabilities: { reactions: false, replies: false } }), [
      msg({ id: 'm1', reactions: [{ emoji: '👍', count: 1, me: false }] }),
    ])
    fireEvent.contextMenu(screen.getByText('hola'))
    expect(screen.queryByRole('menu')).toBeNull()
    expect(screen.queryByText('👍')).toBeNull()
  })

  it('reactions:false alone keeps Reply but drops the emoji row', async () => {
    await mount(channel({ capabilities: { reactions: false } }), [msg({ id: 'm1' })])
    fireEvent.contextMenu(screen.getByText('hola'))
    const menu = await screen.findByRole('menu')
    expect(within(menu).getByText('Responder')).toBeTruthy()
    expect(within(menu).queryByTitle('Reaccionar 👍')).toBeNull()
  })

  it('attachments:false hides attach and voice note but keeps the composer', async () => {
    await mount(channel({ capabilities: { attachments: false } }))
    expect(screen.queryAllByTitle('Adjuntar')).toHaveLength(0)
    expect(screen.getByPlaceholderText('Escribe un mensaje…')).toBeTruthy()
  })
})

describe('TeamChat support case cards', () => {
  const card = (status: string, extra: Record<string, unknown> = {}) =>
    JSON.stringify([{ type: 'support_case', status, folio: 'OPS-000123', subject: 'Stock mismatch', ...extra }])

  it.each([
    ['open', 'Abierto'],
    ['resolved', 'Resuelto'],
    ['closed', 'Cerrado'],
  ])('paints the %s card from the attachment and hides the fallback text body', async (status, label) => {
    await mount(channel(), [
      msg({
        id: 'k1',
        body: `Caso OPS-000123 ${status}: texto de respaldo`,
        attachments: card(status, status === 'open' ? {} : { solution: 'Resincronizado' }),
      }),
    ])
    const el = await screen.findByTestId('support-case-card')
    expect(el.getAttribute('data-status')).toBe(status)
    expect(within(el).getByTestId('case-card-status').textContent).toBe(label)
    expect(within(el).getByText('Stock mismatch')).toBeTruthy()
    if (status !== 'open') expect(within(el).getByText('Resincronizado')).toBeTruthy()
    expect(screen.queryByText(/texto de respaldo/)).toBeNull()
  })

  it('renders the card in English', async () => {
    await mount(channel(), [msg({ id: 'k1', body: 'fallback', attachments: card('resolved', { solution: 'Done' }) })], 'en')
    expect(screen.getByTestId('case-card-status').textContent).toBe('Resolved')
    expect(screen.getByText('Case OPS-000123')).toBeTruthy()
  })

  it('an unknown status falls back to the plain text body', async () => {
    await mount(channel(), [msg({ id: 'k1', body: 'texto plano', attachments: card('weird') })])
    expect(screen.queryByTestId('support-case-card')).toBeNull()
    expect(screen.getByText('texto plano')).toBeTruthy()
  })

  it('a message without attachments is a normal bubble', async () => {
    await mount(channel(), [msg({ id: 'm1', body: 'Caso OPS-1 abierto: algo' })])
    expect(screen.queryByTestId('support-case-card')).toBeNull()
    expect(screen.getByText('Caso OPS-1 abierto: algo')).toBeTruthy()
  })
})

describe('TeamChat pinned sections', () => {
  const sections = [
    {
      key: 'support',
      title: 'Soporte',
      hint: '¿Algo no funciona? Abre un ticket y te atenderemos en su chat.',
      actions: [
        { id: 'tickets', label: 'Tickets', icon: 'ticket', href: '/soporte/casos' },
        { id: 'new', label: 'Nuevo ticket', icon: 'plus' },
      ],
    },
  ]

  it('without sections the list is unchanged (no section landmarks)', async () => {
    await mount(channel())
    expect(screen.queryByTestId('chat-section-support')).toBeNull()
    expect(screen.queryByRole('heading', { level: 3 })).toBeNull()
  })

  it('renders the heading, hint, link action and callback action, grouping the thread under it', async () => {
    const onAction = vi.fn()
    await mount(channel({ section: 'support' }), [], 'es', { sections, onSectionAction: onAction })
    const sec = screen.getByTestId('chat-section-support')
    expect(within(sec).getByRole('heading', { name: 'Soporte' })).toBeTruthy()
    expect(within(sec).getByText(/Abre un ticket/)).toBeTruthy()
    expect(within(sec).getByRole('link', { name: 'Tickets' }).getAttribute('href')).toBe('/soporte/casos')
    expect(within(sec).getByText('Soporte Asteby')).toBeTruthy()
    fireEvent.click(within(sec).getByRole('button', { name: 'Nuevo ticket' }))
    expect(onAction).toHaveBeenCalledWith('support', 'new')
    expect(sec.getAttribute('aria-labelledby')).toBeTruthy()
  })

  it('omits callback actions when the host gives no handler, and keeps links', async () => {
    await mount(channel({ section: 'support' }), [], 'es', { sections })
    const sec = screen.getByTestId('chat-section-support')
    expect(within(sec).queryByRole('button', { name: 'Nuevo ticket' })).toBeNull()
    expect(within(sec).getByRole('link', { name: 'Tickets' })).toBeTruthy()
  })

  it('a channel pointing at an undeclared section stays in the plain list', async () => {
    await mount(channel({ section: 'ghost' }), [], 'es', { sections })
    expect(within(screen.getByTestId('chat-section-support')).queryByText('Soporte Asteby')).toBeNull()
    expect(screen.getAllByText('Soporte Asteby').length).toBeGreaterThan(0)
  })
})
