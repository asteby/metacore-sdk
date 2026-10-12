// @vitest-environment happy-dom
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { applyChannelEvent, formatRelativeTime, sortChannels, type ChannelAdapter, type ChannelEvent, type ChatChannel } from './channels'
import { CopilotProvider } from './context'
import { CopilotWidget } from './copilot-widget'
import type { ChatClient } from './types'

afterEach(() => {
  cleanup()
  try {
    localStorage.clear()
  } catch {
    /* no storage in this env */
  }
})

const ch = (over: Partial<ChatChannel> & { id: string }): ChatChannel => ({ kind: 'team', name: over.id, ...over })

describe('channel state', () => {
  it('bumps unread only for incoming messages on inactive channels', () => {
    const list = [ch({ id: 'a' }), ch({ id: 'b' })]
    const msg = (channelId: string, mine: boolean): ChannelEvent => ({
      type: 'message',
      message: { id: Math.random().toString(), channelId, body: 'hola', mine, createdAt: '2026-10-12T10:00:00Z' },
    })
    expect(applyChannelEvent(list, msg('a', false), null).find((c) => c.id === 'a')?.unread).toBe(1)
    expect(applyChannelEvent(list, msg('a', false), 'a').find((c) => c.id === 'a')?.unread).toBe(0)
    expect(applyChannelEvent(list, msg('a', true), null).find((c) => c.id === 'a')?.unread).toBe(0)
  })

  it('sorts most recent first and keeps idle channels in order', () => {
    const out = sortChannels([ch({ id: 'x' }), ch({ id: 'old', lastAt: '2026-01-01T00:00:00Z' }), ch({ id: 'new', lastAt: '2026-10-01T00:00:00Z' }), ch({ id: 'y' })])
    expect(out.map((c) => c.id)).toEqual(['new', 'old', 'x', 'y'])
  })

  it('formats relative times and tolerates bad input', () => {
    const now = Date.parse('2026-10-12T12:00:00Z')
    expect(formatRelativeTime('2026-10-12T11:55:00Z', 'es', now)).toMatch(/5/)
    expect(formatRelativeTime('nope', 'es', now)).toBe('')
    expect(formatRelativeTime(undefined)).toBe('')
  })
})

function makeAdapter(over: Partial<ChannelAdapter> = {}) {
  let handler: ((e: ChannelEvent) => void) | null = null
  const adapter: ChannelAdapter = {
    listChannels: vi.fn().mockResolvedValue([
      ch({ id: 'dm1', name: 'Ana Pérez', lastMessage: 'nos vemos', lastAt: '2026-10-12T10:00:00Z', unread: 2 }),
      ch({ id: 'ag1', kind: 'agent', name: 'Agente Territorial', description: 'Análisis territorial' }),
    ]),
    loadMessages: vi.fn().mockResolvedValue([{ id: 'm1', channelId: 'dm1', body: 'hola equipo', mine: false, senderName: 'Ana' }]),
    send: vi.fn().mockImplementation(async (channelId: string, body: string) => ({ id: 'm2', channelId, body, mine: true })),
    markRead: vi.fn().mockResolvedValue(undefined),
    subscribe: (h) => {
      handler = h
      return () => {
        handler = null
      }
    },
    ...over,
  }
  return { adapter, emit: (e: ChannelEvent) => act(() => handler?.(e)) }
}

const client: ChatClient = { send: vi.fn().mockResolvedValue({ sessionId: 'S', reply: 'ok' }) }
const mount = (props: Parameters<typeof CopilotWidget>[0]) =>
  render(
    <CopilotProvider client={client} suggestions={['Hola']}>
      <CopilotWidget {...props} />
    </CopilotProvider>,
  )

describe('CopilotWidget with channels', () => {
  it('lists the bot first, opens a team thread, sends and goes back', async () => {
    const { adapter } = makeAdapter()
    mount({ channels: adapter, defaultOpen: true })
    const nav = await screen.findByRole('navigation', { name: 'Conversaciones' })
    const names = within(nav).getAllByRole('button').map((b) => b.textContent ?? '')
    expect(names[0]).toContain('Copiloto')
    expect(names.some((n) => n.includes('Ana Pérez'))).toBe(true)

    fireEvent.click(within(nav).getByText('Ana Pérez'))
    await screen.findByText('hola equipo')
    await waitFor(() => expect(adapter.markRead).toHaveBeenCalledWith('dm1'))

    fireEvent.change(screen.getByLabelText('Escribe un mensaje…'), { target: { value: 'respuesta' } })
    fireEvent.click(screen.getByLabelText('Enviar'))
    await screen.findByText('respuesta')
    expect(adapter.send).toHaveBeenCalledWith('dm1', 'respuesta')

    fireEvent.click(screen.getByLabelText('Volver'))
    await screen.findByRole('navigation', { name: 'Conversaciones' })
  })

  it('shows the unread total on the FAB while closed and updates it live', async () => {
    const { adapter, emit } = makeAdapter()
    mount({ channels: adapter })
    await waitFor(() => expect(screen.getByLabelText('2 sin leer')).toBeTruthy())
    emit({ type: 'message', message: { id: 'z', channelId: 'dm1', body: 'otra', mine: false } })
    await waitFor(() => expect(screen.getByLabelText('3 sin leer')).toBeTruthy())
  })

  it('opens an agent that brings its own AI client with the full chat', async () => {
    const agentClient: ChatClient = { send: vi.fn().mockResolvedValue({ sessionId: 'A', reply: 'desde agente' }) }
    const { adapter } = makeAdapter({
      listChannels: vi.fn().mockResolvedValue([ch({ id: 'ag1', kind: 'agent', name: 'Agente Territorial', client: agentClient })]),
    })
    mount({ channels: adapter, defaultOpen: true })
    fireEvent.click(await screen.findByText('Agente Territorial'))
    fireEvent.click(await screen.findByText('Hola'))
    await screen.findByText('desde agente')
    expect(agentClient.send).toHaveBeenCalled()
    expect(client.send).not.toHaveBeenCalledWith(expect.objectContaining({ message: 'Hola' }))
  })

  it('surfaces a list error with retry', async () => {
    const listChannels = vi.fn().mockRejectedValueOnce(new Error('x')).mockResolvedValue([ch({ id: 'dm1', name: 'Ana Pérez' })])
    const { adapter } = makeAdapter({ listChannels })
    mount({ channels: adapter, defaultOpen: true })
    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toContain('No se pudieron cargar las conversaciones')
    fireEvent.click(within(alert).getByText('Reintentar'))
    await screen.findByText('Ana Pérez')
  })
})

describe('expanded (full screen)', () => {
  it('toggles the viewport-filling layout; Escape collapses first, then closes', async () => {
    mount({ defaultOpen: true })
    const dialog = screen.getByRole('dialog')
    expect(dialog.getAttribute('aria-modal')).toBe('false')
    fireEvent.click(screen.getByLabelText('Ampliar a pantalla completa'))
    expect(screen.getByRole('dialog').getAttribute('aria-modal')).toBe('true')
    expect(screen.getByRole('dialog').style.inset).toMatch(/^0/)

    fireEvent.keyDown(document.body, { key: 'Escape' })
    await waitFor(() => expect(screen.getByRole('dialog').getAttribute('aria-modal')).toBe('false'))
    fireEvent.keyDown(document.body, { key: 'Escape' })
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
  })

  it('offers an open-full-view link and lets the host navigate itself', () => {
    const onOpenFullscreen = vi.fn()
    mount({ defaultOpen: true, fullscreenHref: '/agent', onOpenFullscreen })
    const link = screen.getByLabelText('Abrir vista completa') as HTMLAnchorElement
    expect(link.getAttribute('href')).toBe('/agent')
    fireEvent.click(link)
    expect(onOpenFullscreen).toHaveBeenCalledWith({ channelId: null })
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('renders nothing when hidden', () => {
    const { container } = mount({ hidden: true, defaultOpen: true })
    expect(container.querySelector('button')).toBeNull()
  })
})
