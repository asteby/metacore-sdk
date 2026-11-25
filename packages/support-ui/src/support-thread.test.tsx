// @vitest-environment happy-dom
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { createInstance } from 'i18next'
import { I18nextProvider, initReactI18next } from 'react-i18next'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { baseResources } from '@asteby/metacore-i18n'
import type { SupportCallbackEvent, SupportCase, SupportMessage } from '@asteby/metacore-sdk/support'
import { SupportThread } from './support-thread'
import type { SupportThreadApi } from './use-support-thread'

afterEach(() => {
  cleanup()
  localStorage.clear()
})

const NOW = Date.parse('2026-11-25T12:00:00Z')

function i18n(lng: 'es' | 'en') {
  const inst = createInstance()
  void inst.use(initReactI18next).init({ lng, resources: baseResources, interpolation: { escapeValue: false }, initAsync: false })
  return inst
}

const msg = (over: Partial<SupportMessage> & Pick<SupportMessage, 'id' | 'author_type'>): SupportMessage => ({
  body: 'texto',
  created_at: '2026-11-25T10:00:00Z',
  ...over,
})

const baseCase = (over: Partial<SupportCase> = {}): SupportCase => ({
  folio: 'OPS-000123',
  subject: 'Stock mismatch',
  status: 'open',
  messages: [
    msg({ id: 'm1', author_type: 'reporter', author_name: 'Ana', body: 'Los conteos no coinciden' }),
    msg({ id: 'm2', author_type: 'agent', author_name: 'Soporte', body: 'Mande la sucursal', created_at: '2026-11-25T10:30:00Z' }),
    msg({ id: 'm3', author_type: 'ai', author_name: 'Aby', body: 'Concilie la sucursal 2', created_at: '2026-11-25T11:00:00Z' }),
  ],
  ...over,
})

function fakeApi(c: SupportCase | Error, extra: Partial<SupportThreadApi> = {}) {
  let listener: ((e: SupportCallbackEvent) => void) | undefined
  const api = {
    getCase: vi.fn(async () => {
      if (c instanceof Error) throw c
      return c
    }),
    sendMessage: vi.fn(async (_f: string, input: { clientMessageId: string; body: string }) =>
      msg({ id: `srv_${input.clientMessageId}`, author_type: 'reporter', body: input.body, created_at: '2026-11-25T12:00:01Z' }),
    ),
    subscribe: vi.fn((_f: string, on: (e: SupportCallbackEvent) => void) => {
      listener = on
      return () => {}
    }),
    ...extra,
  } satisfies SupportThreadApi
  return { api, emit: (e: SupportCallbackEvent) => act(() => listener?.(e)) }
}

function view(api: SupportThreadApi, props: Partial<Parameters<typeof SupportThread>[0]> = {}, lng: 'es' | 'en' = 'es') {
  return render(
    <I18nextProvider i18n={i18n(lng)}>
      <SupportThread api={api} folio="OPS-000123" now={() => NOW} newId={() => 'cid1'} {...props} />
    </I18nextProvider>,
  )
}

const png = (name: string, over: Record<string, unknown> = {}) => ({
  id: name,
  name,
  url: `https://hub.example/files/${name}?sig=z`,
  content_type: 'image/png',
  size: 2048,
  ...over,
})

describe('SupportThread states', () => {
  it('shows a polite loading state while the case loads', () => {
    const api = { ...fakeApi(baseCase()).api, getCase: vi.fn(() => new Promise<SupportCase>(() => {})) }
    view(api)
    expect(screen.getAllByRole('status').length).toBeGreaterThan(0)
    expect(screen.queryByRole('log')).toBeNull()
  })

  it('shows an error with retry that reloads the case', async () => {
    const { api } = fakeApi(new Error('boom'))
    view(api)
    expect(await screen.findByText('No se pudo cargar el caso')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }))
    await waitFor(() => expect(api.getCase).toHaveBeenCalledTimes(2))
  })

  it('shows the empty state and still lets the person write', async () => {
    view(fakeApi(baseCase({ messages: [] })).api)
    expect(await screen.findByText('Aún no hay mensajes')).toBeTruthy()
    expect(screen.getByRole('textbox')).toBeTruthy()
  })

  it('lists person, agent and AI messages with the case status', async () => {
    view(fakeApi(baseCase()).api)
    const log = await screen.findByRole('log')
    expect(within(log).getByText('Los conteos no coinciden')).toBeTruthy()
    expect(within(log).getByText('Mande la sucursal')).toBeTruthy()
    expect(within(log).getByText('Concilie la sucursal 2')).toBeTruthy()
    expect(within(log).getByText('Tú')).toBeTruthy()
    expect(within(log).getByText('Soporte')).toBeTruthy()
    expect(within(log).getByText('IA')).toBeTruthy()
    expect(screen.getByTestId('case-status').textContent).toBe('Abierto')
    expect(screen.getByText('Stock mismatch')).toBeTruthy()
  })

  it('renders in English', async () => {
    view(fakeApi(baseCase()).api, {}, 'en')
    expect((await screen.findByTestId('case-status')).textContent).toBe('Open')
    expect(screen.getByRole('textbox').getAttribute('placeholder')).toBe('Write a message to support…')
  })

  it('appends messages that arrive through the event stream', async () => {
    const { api, emit } = fakeApi(baseCase())
    view(api)
    await screen.findByRole('log')
    emit({
      event: 'desk_message',
      ticket_folio: 'OPS-000123',
      issue_url: '',
      issue_number: 0,
      comment: '',
      solution: '',
      body: 'Ya lo reviso',
      author_name: 'Soporte',
      message_id: 'dm_9',
      delivery_id: 'd9',
      timestamp: 1764065200,
    })
    expect(await screen.findByText('Ya lo reviso')).toBeTruthy()
  })
})

describe('SupportThread composer', () => {
  it('sends the typed text with an idempotency key and shows the saved message', async () => {
    const { api } = fakeApi(baseCase())
    view(api)
    await screen.findByRole('log')
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Adjunto el reporte' } })
    fireEvent.click(screen.getByRole('button', { name: 'Enviar' }))
    await waitFor(() => expect(api.sendMessage).toHaveBeenCalledTimes(1))
    expect(api.sendMessage).toHaveBeenCalledWith('OPS-000123', { clientMessageId: 'cid1', body: 'Adjunto el reporte', attachments: undefined })
    expect(await screen.findByText('Adjunto el reporte')).toBeTruthy()
    await waitFor(() => expect((screen.getByRole('textbox') as HTMLTextAreaElement).value).toBe(''))
  })

  it('does not send an empty message', async () => {
    const { api } = fakeApi(baseCase())
    view(api)
    await screen.findByRole('log')
    expect((screen.getByRole('button', { name: 'Enviar' }) as HTMLButtonElement).disabled).toBe(true)
  })

  it('marks a failed message and re-sends it with the same key', async () => {
    const { api } = fakeApi(baseCase())
    api.sendMessage.mockRejectedValueOnce(new Error('offline'))
    view(api)
    await screen.findByRole('log')
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Hola' } })
    fireEvent.click(screen.getByRole('button', { name: 'Enviar' }))
    const retry = await screen.findByRole('button', { name: 'Reintentar' })
    expect(screen.getByText('No se envió')).toBeTruthy()
    fireEvent.click(retry)
    await waitFor(() => expect(api.sendMessage).toHaveBeenCalledTimes(2))
    expect(api.sendMessage.mock.calls[1]?.[1]).toMatchObject({ clientMessageId: 'cid1', body: 'Hola' })
    await waitFor(() => expect(screen.queryByText('No se envió')).toBeNull())
  })

  it('uploads attached files through the host and sends them with the message', async () => {
    const { api } = fakeApi(baseCase())
    const uploadAttachment = vi.fn(async (f: File) => png(f.name))
    view(api, { uploadAttachment })
    await screen.findByRole('log')
    const input = screen.getByTestId('composer-file-input')
    fireEvent.change(input, { target: { files: [new File(['x'], 'foto.png', { type: 'image/png' })] } })
    await waitFor(() => expect(uploadAttachment).toHaveBeenCalled())
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Mira' } })
    await waitFor(() => expect((screen.getByRole('button', { name: 'Enviar' }) as HTMLButtonElement).disabled).toBe(false))
    fireEvent.click(screen.getByRole('button', { name: 'Enviar' }))
    await waitFor(() => expect(api.sendMessage).toHaveBeenCalled())
    expect(api.sendMessage.mock.calls[0]?.[1].attachments?.[0]).toMatchObject({ name: 'foto.png', url: 'https://hub.example/files/foto.png?sig=z' })
  })

  it('hides the formatting toolbar buttons (plain support chat)', async () => {
    view(fakeApi(baseCase()).api)
    await screen.findByRole('log')
    expect(screen.queryByRole('button', { name: 'Negrita' })).toBeNull()
    expect(screen.getByRole('button', { name: 'Adjuntar archivos' })).toBeTruthy()
  })
})

describe('SupportThread attachments', () => {
  const withAtt = (attachments: unknown[]) =>
    baseCase({ messages: [msg({ id: 'm2', author_type: 'agent', author_name: 'Soporte', body: 'Ver archivo', attachments: attachments as never })] })

  it('shows a thumbnail that opens a viewer with a download link', async () => {
    view(fakeApi(withAtt([png('c.png')])).api)
    const thumb = await screen.findByRole('button', { name: 'Abrir c.png' })
    expect(within(thumb).getByRole('img').getAttribute('alt')).toBe('Miniatura de c.png')
    fireEvent.click(thumb)
    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByText('Vista previa de c.png')).toBeTruthy()
    const dl = within(dialog).getByRole('link', { name: /Descargar/ })
    expect(dl.getAttribute('href')).toBe('https://hub.example/files/c.png?sig=z')
    expect(dl.getAttribute('download')).toBe('c.png')
  })

  it('warns about an expired attachment and offers no thumbnail nor download', async () => {
    view(fakeApi(withAtt([png('old.png', { expires_at: '2026-11-25T11:00:00Z' })])).api)
    const alert = await screen.findByTestId('attachment-expired')
    expect(alert.textContent).toContain('Adjunto caducado')
    expect(alert.textContent).toContain('old.png')
    expect(screen.queryByRole('button', { name: 'Abrir old.png' })).toBeNull()
    expect(document.querySelector('a[href*="old.png"]')).toBeNull()
    // The chip still opens the viewer, which explains instead of linking to a dead URL.
    fireEvent.click(screen.getByRole('button', { name: /old\.png/ }))
    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByText('Adjunto caducado')).toBeTruthy()
    expect(within(dialog).queryByRole('link')).toBeNull()
  })

  it('treats the server flag as expired and never links unsafe URLs', async () => {
    view(fakeApi(withAtt([png('a.png', { expired: true }), png('b.png', { url: 'javascript:alert(1)' })])).api)
    await screen.findByTestId('attachment-expired')
    expect(document.querySelector('a[href^="javascript"]')).toBeNull()
    expect(screen.queryByRole('button', { name: 'Abrir b.png' })).toBeNull()
  })
})

describe('SupportThread resolved cases', () => {
  it('shows the solution, removes the composer and reopens on request', async () => {
    const resolved = baseCase({ status: 'resolved', solution: 'Se conciliaron los conteos' })
    const { api } = fakeApi(resolved)
    const onReopen = vi.fn(async () => {})
    view(api, { onReopen })
    expect(await screen.findByText('Caso resuelto')).toBeTruthy()
    expect(screen.getByText('Se conciliaron los conteos')).toBeTruthy()
    expect(screen.getByTestId('case-status').textContent).toBe('Resuelto')
    expect(screen.queryByRole('textbox')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Reabrir caso' }))
    await waitFor(() => expect(onReopen).toHaveBeenCalledTimes(1))
    await waitFor(() => expect(api.getCase).toHaveBeenCalledTimes(2))
  })

  it('offers no reopen button without a handler, and none for closed cases', async () => {
    view(fakeApi(baseCase({ status: 'closed' })).api, { onReopen: async () => {} })
    expect(await screen.findByText('Caso cerrado')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Reabrir caso' })).toBeNull()
  })
})

describe('SupportThread accessibility', () => {
  it('exposes a live log, a labelled textbox and named buttons, reachable by keyboard', async () => {
    view(fakeApi(baseCase()).api)
    const log = await screen.findByRole('log')
    expect(log.getAttribute('aria-live')).toBe('polite')
    expect(log.getAttribute('aria-label')).toBe('Stock mismatch')
    const box = screen.getByRole('textbox')
    expect(box.getAttribute('aria-label')).toBeTruthy()
    for (const b of screen.getAllByRole('button')) {
      expect((b.textContent || b.getAttribute('aria-label') || '').trim().length).toBeGreaterThan(0)
      expect(b.getAttribute('tabindex')).not.toBe('-1')
    }
    box.focus()
    expect(document.activeElement).toBe(box)
  })

  it('labels message groups by author', async () => {
    view(fakeApi(baseCase()).api)
    await screen.findByRole('log')
    expect(screen.getByRole('region', { name: 'Soporte' })).toBeTruthy()
  })
})
