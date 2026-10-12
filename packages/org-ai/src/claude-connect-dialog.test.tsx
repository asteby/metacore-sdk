// @vitest-environment happy-dom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ClaudeConnectDialog } from './claude-connect-dialog'
import { createClaudeConnectApi } from './api'

const get = vi.fn()
const post = vi.fn()
const del = vi.fn()
const put = vi.fn()
const api = createClaudeConnectApi({
  get: (...a: [string]) => get(...a),
  post: (...a: [string, unknown?]) => post(...a),
  delete: (...a: [string]) => del(...a),
  put: (...a: [string, unknown?]) => put(...a),
})

const ok = (data: unknown) => Promise.resolve({ data: { success: true, data } })
const fail = (code: string) => Promise.reject({ response: { data: { error: { code } } } })
const future = () => new Date(Date.now() + 5 * 60_000).toISOString()

function renderDialog(props: Partial<React.ComponentProps<typeof ClaudeConnectDialog>> = {}) {
  const qc = new QueryClient()
  const onOpenChange = vi.fn()
  const view = render(
    <QueryClientProvider client={qc}>
      <ClaudeConnectDialog open onOpenChange={onOpenChange} api={api} {...props} />
    </QueryClientProvider>,
  )
  return { qc, onOpenChange, ...view }
}
const session = () => ok({ session_id: 's1', url: 'https://example.test/x', expires_at: future() })

beforeEach(() => {
  for (const m of [get, post, del, put]) m.mockReset()
  del.mockResolvedValue({})
})
afterEach(cleanup)

describe('ClaudeConnectDialog', () => {
  it('offers install when the runtime is missing, then starts the session', async () => {
    get.mockReturnValue(ok({ installed: false }))
    post.mockImplementation((url: string) =>
      url.endsWith('/install') ? (get.mockReturnValue(ok({ installed: true })), ok({ installed: true })) : session(),
    )
    renderDialog()
    fireEvent.click(await screen.findByText('Install'))
    expect(await screen.findByText('Open sign-in page')).toBeTruthy()
    expect(post).toHaveBeenCalledWith('/organization/ai-config/claude/install')
  })

  it('opens the link through openUrl, submits the trimmed code and reports success', async () => {
    get.mockReturnValue(ok({ installed: true }))
    post.mockImplementation((url: string) => (url.endsWith('/connect') ? session() : ok({ connected: true })))
    const openUrl = vi.fn()
    const onConnected = vi.fn()
    const { qc } = renderDialog({ onConnected, openUrl })
    const inv = vi.spyOn(qc, 'invalidateQueries')
    fireEvent.click(await screen.findByText('Open sign-in page'))
    expect(openUrl).toHaveBeenCalledWith('https://example.test/x')
    fireEvent.change(screen.getByLabelText('Authorization code'), { target: { value: ' abc-123 ' } })
    fireEvent.click(screen.getByText('Connect'))
    expect(await screen.findByText('Claude connected')).toBeTruthy()
    expect(post).toHaveBeenCalledWith('/organization/ai-config/claude/connect/s1/code', { code: 'abc-123' })
    await waitFor(() => expect(onConnected).toHaveBeenCalled())
    expect(inv).toHaveBeenCalled()
    expect(del).not.toHaveBeenCalled()
  })

  it('invalid_code keeps the field for retry and announces the error', async () => {
    get.mockReturnValue(ok({ installed: true }))
    post.mockImplementation((url: string) => (url.endsWith('/connect') ? session() : fail('invalid_code')))
    renderDialog()
    await screen.findByText('Open sign-in page')
    fireEvent.change(screen.getByLabelText('Authorization code'), { target: { value: 'bad' } })
    fireEvent.click(screen.getByText('Connect'))
    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toContain('not valid')
    expect((screen.getByLabelText('Authorization code') as HTMLInputElement).value).toBe('bad')
  })

  it('shows mapped error with retry when start fails (busy)', async () => {
    get.mockReturnValue(ok({ installed: true }))
    post.mockReturnValue(fail('busy'))
    renderDialog()
    expect((await screen.findByRole('alert')).textContent).toContain('Another connection')
    expect(screen.getByText('Try again')).toBeTruthy()
  })

  it('uses host translations when t is provided', async () => {
    get.mockReturnValue(ok({ installed: true }))
    post.mockReturnValue(session())
    renderDialog({ t: (k) => (k === 'org_ai.claude_connect.open_link' ? 'Abrir enlace' : k) })
    expect(await screen.findByText('Abrir enlace')).toBeTruthy()
  })

  it('closing cancels the server session', async () => {
    get.mockReturnValue(ok({ installed: true }))
    post.mockReturnValue(ok({ session_id: 's9', url: 'https://example.test/x', expires_at: future() }))
    const { onOpenChange, rerender, qc } = renderDialog()
    fireEvent.click(await screen.findByText('Cancel'))
    expect(onOpenChange).toHaveBeenCalledWith(false)
    rerender(
      <QueryClientProvider client={qc}>
        <ClaudeConnectDialog open={false} onOpenChange={onOpenChange} api={api} />
      </QueryClientProvider>,
    )
    await waitFor(() => expect(del).toHaveBeenCalledWith('/organization/ai-config/claude/connect/s9'))
  })

  describe('token flow', () => {
    beforeEach(() => {
      get.mockReturnValue(ok({ installed: true }))
      post.mockReturnValue(session())
    })
    it('saves a masked token and succeeds', async () => {
      put.mockReturnValue(ok({ connected: true }))
      const onConnected = vi.fn()
      renderDialog({ onConnected })
      fireEvent.click(await screen.findByText('Use a token instead'))
      const input = screen.getByLabelText('Access token') as HTMLInputElement
      expect(input.type).toBe('password')
      expect(input.autocomplete).toBe('off')
      fireEvent.change(input, { target: { value: '  tok-123 ' } })
      fireEvent.click(screen.getByText('Save token'))
      expect(await screen.findByText('Claude connected')).toBeTruthy()
      expect(put).toHaveBeenCalledWith('/organization/ai-config/claude/token', { token: 'tok-123' })
      await waitFor(() => expect(onConnected).toHaveBeenCalled())
    })
    it('invalid_token shows the error and keeps the code flow', async () => {
      put.mockImplementation(() => fail('invalid_token'))
      renderDialog()
      fireEvent.click(await screen.findByText('Use a token instead'))
      fireEvent.change(screen.getByLabelText('Access token'), { target: { value: 'nope' } })
      fireEvent.click(screen.getByText('Save token'))
      expect((await screen.findByRole('alert')).textContent).toContain('token is not valid')
      expect(screen.getByLabelText('Authorization code')).toBeTruthy()
    })
  })
})
