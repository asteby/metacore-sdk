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
})
