// @vitest-environment happy-dom
import * as React from 'react'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { createInstance } from 'i18next'
import { I18nextProvider, initReactI18next } from 'react-i18next'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { baseResources } from '@asteby/metacore-i18n'
import { EmbedHttpError, type EmbedSessionInfo, type EmbedTransport, type SupportRequest } from '@asteby/metacore-sdk/support'
import { SupportFrame, type FramePort } from './support-frame'
import type { ToFrame, ToParent } from './protocol'

afterEach(() => {
  cleanup()
  try {
    window.localStorage.clear()
  } catch {
    // sin almacenamiento
  }
  document.documentElement.removeAttribute('style')
  document.documentElement.classList.remove('dark')
})

const API = '/v1/support/embed'
const CASE = {
  case_id: 'c-1',
  folio: 'TIENDA-000007',
  channel: 'sch_A',
  subject: 'Donde esta mi pedido',
  status: 'open',
  messages: [
    { id: 'm1', author_type: 'reporter', author_name: 'Ana', body: 'No veo el rastreo', created_at: '2026-11-25T11:00:00Z' },
    { id: 'm2', author_type: 'agent', author_name: 'Soporte', body: '<img src=x onerror=alert(1)> revisando', created_at: '2026-11-25T11:10:00Z' },
  ],
}

function i18n(lng: 'es' | 'en') {
  const inst = createInstance()
  void inst.use(initReactI18next).init({ lng, resources: baseResources, interpolation: { escapeValue: false }, initAsync: false })
  return inst
}

function fakePort() {
  const sent: ToParent[] = []
  let handler: ((m: ToFrame) => void) | undefined
  const port: FramePort = { send: (m) => sent.push(m), on: (h) => ((handler = h), () => (handler = undefined)) }
  return { port, sent, emit: (m: ToFrame) => act(() => handler?.(m)) }
}

function fakeEmbed(opts: { start?: () => Promise<EmbedSessionInfo>; cases?: unknown[] } = {}) {
  const requests: SupportRequest[] = []
  const info: EmbedSessionInfo = {
    expiresAt: Date.now() + 900_000,
    renewAt: Date.now() + 720_000,
    identified: false,
    visitor: { display_name: 'Ana' },
    profile: { version: 3, brand_color: '#0E7490', position: 'bottom-left', texts: { 'es-MX': { launcher: 'Te ayudamos?', greeting: 'Hola, en que podemos ayudarte?' } } },
  }
  const embed: EmbedTransport = {
    transport: (async (req: SupportRequest) => {
      requests.push(req)
      if (req.method === 'GET' && req.path === `${API}/cases`) return { data: opts.cases ?? [CASE], headers: { get: () => null } }
      if (req.method === 'GET' && req.path === `${API}/cases/c-1`) return { data: CASE }
      if (req.method === 'GET' && req.path === `${API}/cases/c-2`) return { data: { ...CASE, case_id: 'c-2', messages: [] } }
      if (req.method === 'POST' && req.path === `${API}/cases`) return { data: { ...CASE, case_id: 'c-2', messages: [] } }
      throw new Error(`inesperada ${req.method} ${req.path}`)
    }) as EmbedTransport['transport'],
    start: vi.fn(opts.start ?? (async () => info)),
    stop: vi.fn(),
    logout: vi.fn(),
    info: () => info,
    events: () => () => () => {},
  }
  return { embed, requests, info }
}

function renderFrame(embed: EmbedTransport, port: FramePort, extra: Partial<React.ComponentProps<typeof SupportFrame>> = {}) {
  const identity = { current: undefined as string | undefined }
  const view = render(
    <I18nextProvider i18n={i18n('es')}>
      <SupportFrame embed={embed} apiBase={API} locale="es-MX" port={port} identity={identity} {...extra} />
    </I18nextProvider>,
  )
  return { ...view, identity }
}

describe('SupportFrame', () => {
  it('abre sesion, aplica el tema del perfil, avisa al padre y muestra la lista de tickets (no un hilo mezclado)', async () => {
    const { embed, requests } = fakeEmbed()
    const { port, sent } = fakePort()
    renderFrame(embed, port)
    expect(screen.getByText('Conectando…')).toBeTruthy()
    expect(await screen.findByText('Donde esta mi pedido')).toBeTruthy()
    // El ultimo mensaje es de Soporte: el cliente lo ve como "Esperando tu respuesta", con 1 sin leer y "Nuevo ticket" a la mano.
    expect(screen.getAllByText('Esperando tu respuesta').length).toBeGreaterThan(0)
    expect(screen.getByLabelText('1 sin leer')).toBeTruthy()
    expect(screen.getByTestId('new-ticket')).toBeTruthy()
    expect(screen.queryByText('No veo el rastreo')).toBeNull()
    fireEvent.click(screen.getByText('Donde esta mi pedido'))
    expect(await screen.findByText('No veo el rastreo')).toBeTruthy()
    expect(screen.getByText('Hola, en que podemos ayudarte?')).toBeTruthy()
    expect(document.documentElement.style.getPropertyValue('--primary')).toBe('#0E7490')
    expect(sent).toContainEqual({ t: 'profile', position: 'bottom-left', launcher: 'Te ayudamos?', brand_color: '#0E7490', on_brand: expect.stringMatching(/^#/) })
    expect(sent).toContainEqual({ t: 'ready' })
    // El hilo se pide por case_id y por la API del widget.
    expect(requests.some((r) => r.path === `${API}/cases/c-1`)).toBe(true)
  })

  it('pinta el texto del equipo como texto (sin HTML) y no ofrece adjuntar sin uploadAttachment', async () => {
    const { embed } = fakeEmbed()
    const { port } = fakePort()
    const { container } = renderFrame(embed, port)
    fireEvent.click(await screen.findByText('Donde esta mi pedido'))
    await screen.findByText(/revisando/)
    expect(container.querySelector('img[src="x"]')).toBeNull()
    expect(screen.queryByLabelText(/adjuntar/i)).toBeNull()
    expect(screen.queryByRole('button', { name: /adjuntar/i })).toBeNull()
  })

  it('sin casos muestra el formulario y crea el caso con asunto y mensaje', async () => {
    const { embed, requests } = fakeEmbed({ cases: [] })
    const { port } = fakePort()
    renderFrame(embed, port)
    fireEvent.change(await screen.findByLabelText('Cuéntanos qué pasa'), { target: { value: 'Hola, necesito ayuda' } })
    fireEvent.change(screen.getByLabelText('Asunto (opcional)'), { target: { value: 'Pedido' } })
    fireEvent.click(screen.getByText('Abrir ticket'))
    await waitFor(() => expect(requests.some((r) => r.method === 'POST' && r.path === `${API}/cases`)).toBe(true))
    expect(requests.find((r) => r.method === 'POST')!.body).toMatchObject({ subject: 'Pedido', description: 'Hola, necesito ayuda' })
    await waitFor(() => expect(requests.some((r) => r.method === 'GET' && r.path === `${API}/cases/c-2`)).toBe(true))
  })

  it('si abre otro ticket teniendo uno abierto, avisa con el folio y deja continuar el existente o abrir uno nuevo', async () => {
    const { embed, requests } = fakeEmbed()
    const { port } = fakePort()
    renderFrame(embed, port)
    fireEvent.click(await screen.findByTestId('new-ticket'))
    fireEvent.change(await screen.findByLabelText('Cuéntanos qué pasa'), { target: { value: 'Otro tema' } })
    fireEvent.click(screen.getByText('Abrir ticket'))
    const notice = await screen.findByTestId('support-duplicate-notice')
    expect(notice.textContent).toContain('TIENDA-000007')
    expect(requests.some((r) => r.method === 'POST')).toBe(false)
    fireEvent.click(screen.getByText('Abrir uno nuevo'))
    await waitFor(() => expect(requests.some((r) => r.method === 'POST' && r.path === `${API}/cases`)).toBe(true))
  })

  it('un ticket resuelto pregunta "¿Se resolvió?" y ofrece reabrir (si el canal lo permite) y abrir otro; sin "Finalizar" porque el Hub no lo tiene', async () => {
    const resolved = { ...CASE, status: 'resolved', solution: 'Ya salio el paquete', messages: CASE.messages }
    const { embed } = fakeEmbed({ cases: [resolved] })
    const orig = embed.transport
    embed.transport = (async (req: SupportRequest) =>
      req.method === 'GET' && req.path === `${API}/cases/c-1` ? { data: resolved } : orig(req)) as EmbedTransport['transport']
    const { port } = fakePort()
    renderFrame(embed, port, { allowReopen: true })
    fireEvent.click(await screen.findByText('Donde esta mi pedido'))
    expect(await screen.findByText('¿Se resolvió?')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Reabrir' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Abrir otro ticket' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Finalizar' })).toBeNull()
  })

  it('origen no permitido o canal inactivo: avisa al loader para retirarse y muestra fuera de servicio', async () => {
    const err = new EmbedHttpError(403, { error: { code: 'origin_not_allowed', message: 'x' } })
    const { embed } = fakeEmbed({ start: async () => Promise.reject(err) })
    const { port, sent } = fakePort()
    renderFrame(embed, port)
    expect(await screen.findByText('El soporte está fuera de servicio')).toBeTruthy()
    expect(sent).toContainEqual({ t: 'unavailable' })
  })

  it('un fallo de red ofrece reintentar y vuelve a abrir sesion', async () => {
    let n = 0
    const { embed, info } = fakeEmbed()
    embed.start = vi.fn(async () => {
      if (n++ === 0) throw new EmbedHttpError(500, undefined)
      return info
    })
    const { port } = fakePort()
    renderFrame(embed, port)
    fireEvent.click(await screen.findByText('Reintentar'))
    expect(await screen.findByText('Donde esta mi pedido')).toBeTruthy()
    expect(embed.start).toHaveBeenCalledTimes(2)
  })

  it('identify del padre guarda el JWT y reinicia la sesion; logout la cierra y borra el token de visitante', async () => {
    const { embed } = fakeEmbed()
    const { port, emit } = fakePort()
    const { identity } = renderFrame(embed, port)
    await screen.findByText('Donde esta mi pedido')
    await emit({ t: 'identify', token: 'aaa.bbb.ccc' })
    expect(identity.current).toBe('aaa.bbb.ccc')
    expect(embed.stop).toHaveBeenCalled()
    await waitFor(() => expect(embed.start).toHaveBeenCalledTimes(2))
    await emit({ t: 'logout' })
    expect(identity.current).toBeUndefined()
    expect(embed.logout).toHaveBeenCalled()
  })

  it('descarta campos invalidos del perfil sin romper el widget', async () => {
    const { embed, info } = fakeEmbed()
    info.profile = { brand_color: 'url(javascript:x)', logo_url: 'http://insegura.example/l.png', texts: { 'es-MX': { greeting: 'Hola' } } }
    const { port } = fakePort()
    const { container } = renderFrame(embed, port)
    await screen.findByText('Hola')
    expect(document.documentElement.style.getPropertyValue('--primary')).toBe('')
    expect(container.querySelector('img')).toBeNull()
  })

  it('el boton de cerrar del encabezado avisa al padre', async () => {
    const { embed } = fakeEmbed()
    const { port, sent } = fakePort()
    renderFrame(embed, port)
    fireEvent.click(await screen.findByLabelText('Cerrar'))
    expect(sent).toContainEqual({ t: 'close' })
  })
})
