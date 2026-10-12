// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { CopilotChat } from './copilot-chat'
import { CopilotProvider } from './context'
import { CopilotWidget } from './copilot-widget'
import type { ChatClient } from './types'

afterEach(cleanup)

const client = (over: Partial<ChatClient> = {}): ChatClient => ({
  send: vi.fn().mockResolvedValue({ sessionId: 'S', reply: 'respuesta' }),
  ...over,
})

describe('CopilotChat', () => {
  it('shows injected suggestions and sends one through the client', async () => {
    const c = client()
    render(
      <CopilotProvider client={c} suggestions={['Resumen de hoy']}>
        <CopilotChat />
      </CopilotProvider>,
    )
    fireEvent.click(screen.getByText('Resumen de hoy'))
    await waitFor(() => expect(c.send).toHaveBeenCalled())
    expect((c.send as any).mock.calls[0][0]).toMatchObject({ message: 'Resumen de hoy', sessionId: null })
    await screen.findByText('respuesta')
  })

  it('falls back to default platform suggestions when none are injected', () => {
    render(
      <CopilotProvider client={client()}>
        <CopilotChat />
      </CopilotProvider>,
    )
    expect(screen.getByText('Busca un registro')).toBeTruthy()
  })

  it('renders an alert when the client fails', async () => {
    const c = client({ send: vi.fn().mockRejectedValue(new Error('x')) })
    render(
      <CopilotProvider client={c} suggestions={['Hola']}>
        <CopilotChat />
      </CopilotProvider>,
    )
    fireEvent.click(screen.getByText('Hola'))
    expect((await screen.findByRole('alert')).textContent).toContain('No pude')
  })

  it('blocks the panel and the widget without chat permission', () => {
    const { container } = render(
      <CopilotProvider client={client()} permissions={{ canChat: false }}>
        <CopilotChat />
        <CopilotWidget />
      </CopilotProvider>,
    )
    expect(screen.getByRole('status').textContent).toContain('No tienes permiso')
    expect(container.querySelector('button')).toBeNull()
  })

  it('widget toggles the panel', () => {
    render(
      <CopilotProvider client={client()} suggestions={[]}>
        <CopilotWidget />
      </CopilotProvider>,
    )
    expect(screen.queryByRole('log')).toBeNull()
    fireEvent.click(screen.getByLabelText('Abrir copiloto'))
    expect(screen.getByRole('log')).toBeTruthy()
  })

  it('does not crash when scrollIntoView returns a Promise (effect must not return it as cleanup)', async () => {
    const orig = Element.prototype.scrollIntoView
    Element.prototype.scrollIntoView = vi.fn(() => Promise.resolve()) as any
    const errors: unknown[] = []
    const spy = vi.spyOn(console, 'error').mockImplementation((...a) => void errors.push(a))
    try {
      const c = client()
      render(
        <CopilotProvider client={c} suggestions={['Hola']}>
          <CopilotChat />
        </CopilotProvider>,
      )
      fireEvent.click(screen.getByText('Hola'))
      await screen.findByText('respuesta')
      cleanup() // runs effect cleanups; a Promise cleanup throws "destroy is not a function"
      expect(errors.flat().map(String).join('\n')).not.toMatch(/destroy|cleanup function/i)
    } finally {
      spy.mockRestore()
      Element.prototype.scrollIntoView = orig
    }
  })

  const wrap = (c: ChatClient, props: Record<string, unknown> = {}, ui: React.ReactNode = <CopilotChat />) =>
    render(
      <CopilotProvider client={c} suggestions={['Hola']} {...props}>
        {ui}
      </CopilotProvider>,
    )

  it('widget is a labelled non-modal dialog; focus moves in on open and back to the FAB on close', () => {
    wrap(client(), { branding: { name: 'Gobi' } }, <CopilotWidget />)
    const fab = screen.getByLabelText('Abrir copiloto')
    fab.focus()
    fireEvent.click(fab)
    const dialog = screen.getByRole('dialog')
    expect(dialog.getAttribute('aria-label')).toBe('Gobi')
    expect(dialog.getAttribute('aria-modal')).toBe('false')
    expect(document.activeElement?.tagName).toBe('TEXTAREA')
    fireEvent.keyDown(document.activeElement!, { key: 'Escape' })
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(document.activeElement).toBe(fab)
  })

  it('Escape closes the panel; Enter sends, Shift+Enter does not', async () => {
    const onClose = vi.fn()
    const c = client()
    wrap(c, {}, <CopilotChat onClose={onClose} />)
    const box = screen.getByRole('textbox')
    fireEvent.change(box, { target: { value: 'hola' } })
    fireEvent.keyDown(box, { key: 'Enter', shiftKey: true })
    expect(c.send).not.toHaveBeenCalled()
    fireEvent.keyDown(box, { key: 'Enter' })
    await waitFor(() => expect(c.send).toHaveBeenCalledTimes(1))
    fireEvent.keyDown(box, { key: 'Escape' })
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('icon buttons expose names and the 44px touch target classes', () => {
    wrap(client(), {}, <CopilotChat onClose={() => {}} />)
    for (const name of ['Nueva conversación', 'Cerrar copiloto', 'Enviar']) {
      expect(screen.getByRole('button', { name }).className).toMatch(/min-h-11/)
    }
  })

  it('shows the demo badge only when demo is set', () => {
    const { unmount } = wrap(client())
    expect(screen.queryByText('Datos demostrativos')).toBeNull()
    unmount()
    wrap(client(), { demo: true })
    expect(screen.getByText('Datos demostrativos')).toBeTruthy()
  })

  it('shows the empty state', () => {
    wrap(client(), { suggestions: [] })
    expect(screen.getByText('¿En qué te ayudo?')).toBeTruthy()
  })

  it('offline: shows status and blocks sending until back online', async () => {
    const c = client()
    const nav = vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false)
    wrap(c)
    expect(screen.getByRole('status').textContent).toContain('Sin conexión')
    expect((screen.getByRole('button', { name: 'Enviar' }) as HTMLButtonElement).disabled).toBe(true)
    nav.mockReturnValue(true)
    window.dispatchEvent(new Event('online'))
    await waitFor(() => expect(screen.queryByText(/Sin conexión/)).toBeNull())
    nav.mockRestore()
  })

  it('error shows a retry button that re-sends the same message', async () => {
    const send = vi
      .fn()
      .mockRejectedValueOnce(new Error('x'))
      .mockResolvedValueOnce({ sessionId: 'S', reply: 'ya' })
    wrap(client({ send }))
    fireEvent.click(screen.getByText('Hola'))
    await screen.findByRole('alert')
    fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }))
    await screen.findByText('ya')
    expect(send).toHaveBeenCalledTimes(2)
    expect(send.mock.calls[1][0].message).toBe('Hola')
    expect(screen.queryByRole('alert')).toBeNull()
    expect(screen.getAllByText('Hola')).toHaveLength(1)
  })

  it('loadHistory failure shows an alert with retry', async () => {
    const loadHistory = vi
      .fn()
      .mockRejectedValueOnce(new Error('x'))
      .mockResolvedValueOnce([{ id: '1', role: 'ai', content: 'antes' }])
    wrap(client({ loadHistory }), {}, <CopilotChat sessionId="S1" />)
    expect((await screen.findByRole('alert')).textContent).toContain('No se pudo cargar')
    fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }))
    await screen.findByText('antes')
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('proposals in action/model/payload form render and decide errors are surfaced', async () => {
    const decideProposal = vi.fn().mockRejectedValue(new Error('x'))
    const send = vi.fn().mockResolvedValue({
      sessionId: 'S',
      reply: 'propongo',
      proposals: [{ id: 'p1', action: 'create', model: 'finding', payload: { a: 1 } }],
    })
    wrap(client({ send, decideProposal }))
    fireEvent.click(screen.getByText('Hola'))
    await screen.findByText('create · finding')
    expect(screen.getByText('{"a":1}')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: /Aprobar/ }))
    expect((await screen.findByRole('alert')).textContent).toContain('No se pudo registrar')
    expect(screen.getByRole('button', { name: /Aprobar/ })).toBeTruthy() // still pending
  })

  it('session picker calls onSelectSession', () => {
    const onSelect = vi.fn()
    wrap(
      client(),
      {},
      <CopilotChat sessions={[{ id: 'a', title: 'Una' }, { id: 'b', title: 'Otra' }]} onSelectSession={onSelect} />,
    )
    fireEvent.change(screen.getByLabelText('Conversaciones'), { target: { value: 'b' } })
    expect(onSelect).toHaveBeenCalledWith('b')
  })

  describe('widget regressions', () => {
    const openWidget = (props = {}) => {
      render(
        <CopilotProvider client={client()} suggestions={[]}>
          <CopilotWidget {...props} />
        </CopilotProvider>,
      )
      fireEvent.click(screen.getByLabelText('Abrir copiloto'))
    }

    it('closes on Escape pressed outside the panel (e.g. a toast)', () => {
      const toast = document.createElement('button')
      document.body.appendChild(toast)
      openWidget()
      expect(screen.getByRole('log')).toBeTruthy()
      fireEvent.keyDown(toast, { key: 'Escape' })
      expect(screen.queryByRole('log')).toBeNull()
      toast.remove()
    })

    it('does not close when Escape targets another modal dialog or an outside text field', () => {
      const modal = document.createElement('div')
      modal.setAttribute('aria-modal', 'true')
      const inner = document.createElement('button')
      modal.appendChild(inner)
      const input = document.createElement('input')
      document.body.append(modal, input)
      openWidget()
      fireEvent.keyDown(inner, { key: 'Escape' })
      fireEvent.keyDown(input, { key: 'Escape' })
      expect(screen.getByRole('log')).toBeTruthy()
      modal.remove()
      input.remove()
    })

    it('forwards sessions, onSelectSession and demo to CopilotChat', () => {
      const onSelect = vi.fn()
      openWidget({ sessions: [{ id: 's1', title: 'Primera' }], onSelectSession: onSelect, demo: true })
      expect(screen.getByText('Datos demostrativos')).toBeTruthy()
      fireEvent.change(screen.getByRole('combobox'), { target: { value: 's1' } })
      expect(onSelect).toHaveBeenCalledWith('s1')
    })
  })
})
