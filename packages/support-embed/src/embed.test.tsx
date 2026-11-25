// @vitest-environment happy-dom
import * as React from 'react'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mountSupportEmbed, SupportEmbed, type SupportEmbedOptions } from './embed'

const HUB = 'https://hub.example'
const JWT = 'eyJhbGciOi.eyJpc3MiOiJz.c2lnbmF0dXJl'
const SESSION_SECRET = 'asteby1.SESION-SECRETA-123'

const opts: SupportEmbedOptions = {
  channel: 'sch_7K3M9Q2X8V4N1P6R5T0WABCDEF',
  baseUrl: HUB,
  sessionPath: '/v1/support/embed/sessions',
  apiBase: '/v1/support/embed',
  locale: 'es-MX',
  visitorStore: { get: () => null, set: () => {}, clear: () => {} },
}

const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

let sessions: Array<Record<string, unknown>>
const fetchMock = vi.fn<typeof fetch>()

function stubHub(profile: Record<string, unknown> = {}, status = 201, sessionBody: Record<string, unknown> = {}) {
  fetchMock.mockImplementation(async (input, init) => {
    const url = String(input)
    if (url.endsWith('/sessions')) {
      sessions.push(JSON.parse(String(init?.body)))
      if (status !== 201) return json(status, { error: { code: 'origin_not_allowed', message: 'x' } })
      return json(201, {
        session: SESSION_SECRET,
        expires_at: new Date(Date.now() + 900_000).toISOString(),
        visitor: { display_name: 'Ana' },
        profile: { brand_color: '#0E7490', position: 'bottom-right', texts: { 'es-MX': { launcher: 'Ayuda', greeting: 'Hola' } }, ...profile },
        ...sessionBody,
      })
    }
    return json(200, { items: [], total: 0 })
  })
}

beforeEach(() => {
  sessions = []
  fetchMock.mockReset()
  vi.stubGlobal('fetch', fetchMock)
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  document.body.removeAttribute('style')
  document.documentElement.removeAttribute('style')
})

const panel = () => document.querySelector('[data-metacore-support-embed]') as HTMLElement
const launcher = () => document.querySelector('button[aria-expanded]') as HTMLButtonElement | null

describe('SupportEmbed (embed en codigo)', () => {
  it('modo inline: el panel vive en el sitio donde se renderiza, sin lanzador, con el alto indicado', async () => {
    stubHub()
    const { container } = render(<SupportEmbed {...opts} mode="inline" height={520} />)
    await waitFor(() => expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Hola'))
    expect(container.contains(panel())).toBe(true)
    expect(panel().style.height).toBe('520px')
    expect(panel().style.position).not.toBe('fixed')
    expect(launcher()).toBeNull()
    expect(screen.queryByLabelText(/cerrar|close/i)).toBeNull() // sin boton de cerrar: no hay lanzador que reabra
  })

  it('abre la sesion con el origen de la pagina, el canal y el idioma', async () => {
    stubHub()
    render(<SupportEmbed {...opts} mode="inline" />)
    await waitFor(() => expect(sessions).toHaveLength(1))
    expect(sessions[0]).toMatchObject({ channel: opts.channel, parent_origin: window.location.origin, locale: 'es-MX' })
    expect(sessions[0]!.identity).toBeUndefined()
    expect(String(fetchMock.mock.calls[0]![0])).toBe(`${HUB}/v1/support/embed/sessions`)
  })

  it('modo floating: lanzador visible con el texto del perfil; abre y cierra el panel', async () => {
    stubHub()
    const onOpenChange = vi.fn()
    render(<SupportEmbed {...opts} mode="floating" onOpenChange={onOpenChange} />)
    await waitFor(() => expect(launcher()).not.toBeNull())
    expect(launcher()!.textContent).toBe('Ayuda')
    expect(panel().style.display).toBe('none')
    fireEvent.click(launcher()!)
    expect(panel().style.display).toBe('block')
    expect(panel().style.position).toBe('fixed')
    expect(onOpenChange).toHaveBeenLastCalledWith(true)
    fireEvent.click(await screen.findByLabelText(/cerrar|close/i))
    await waitFor(() => expect(panel().style.display).toBe('none'))
    expect(onOpenChange).toHaveBeenLastCalledWith(false)
  })

  it('toma el modo del perfil publico (push) y el del cliente lo pisa', async () => {
    stubHub({ display_mode: 'push', panel_width: 420, launcher_label: 'Soporte' })
    const { unmount } = render(<SupportEmbed {...opts} />)
    await waitFor(() => expect(launcher()).not.toBeNull())
    expect(panel().getAttribute('data-metacore-support-embed')).toBe('push')
    expect(launcher()!.textContent).toContain('Soporte')
    fireEvent.click(launcher()!)
    expect(document.body.style.marginRight).toBe('420px')
    fireEvent.click(launcher()!)
    expect(document.body.style.marginRight).toBe('')
    unmount()

    stubHub({ display_mode: 'push' })
    render(<SupportEmbed {...opts} mode="floating" offset={40} />)
    await waitFor(() => expect(launcher()).not.toBeNull())
    expect(panel().getAttribute('data-metacore-support-embed')).toBe('floating')
    expect(launcher()!.style.bottom).toBe('40px')
  })

  it('al desmontar con el panel push abierto devuelve el margen de la pagina', async () => {
    stubHub({ display_mode: 'push' })
    const { unmount } = render(<SupportEmbed {...opts} />)
    await waitFor(() => expect(launcher()).not.toBeNull())
    fireEvent.click(launcher()!)
    expect(document.body.style.marginRight).toBe('400px')
    unmount()
    expect(document.body.style.marginRight).toBe('')
  })

  it('modo identificado: el JWT de la empresa viaja como identity y no queda en el DOM', async () => {
    stubHub()
    render(<SupportEmbed {...opts} mode="inline" identity={JWT} />)
    await waitFor(() => expect(sessions).toHaveLength(1))
    expect(sessions[0]!.identity).toBe(JWT)
    await screen.findByRole('heading', { level: 1 })
    const html = document.documentElement.outerHTML
    expect(html).not.toContain(JWT)
    expect(html).not.toContain(SESSION_SECRET)
  })

  it('cambiar la identidad despues de montar reabre la sesion con el JWT nuevo', async () => {
    stubHub()
    const { rerender } = render(<SupportEmbed {...opts} mode="inline" />)
    await waitFor(() => expect(sessions).toHaveLength(1))
    rerender(<SupportEmbed {...opts} mode="inline" identity={JWT} />)
    await waitFor(() => expect(sessions).toHaveLength(2))
    expect(sessions[1]!.identity).toBe(JWT)
  })

  it('un identity que no es un JWT bien formado no se envia', async () => {
    stubHub()
    const { rerender } = render(<SupportEmbed {...opts} mode="inline" />)
    await waitFor(() => expect(sessions).toHaveLength(1))
    rerender(<SupportEmbed {...opts} mode="inline" identity="<script>alert(1)</script>" />)
    await act(async () => {
      await new Promise((r) => setTimeout(r, 30))
    })
    expect(sessions).toHaveLength(1)
  })

  it('si el Hub rechaza el origen, no pinta nada y avisa con onUnavailable', async () => {
    stubHub({}, 403)
    const onUnavailable = vi.fn()
    render(<SupportEmbed {...opts} mode="floating" onUnavailable={onUnavailable} />)
    await waitFor(() => expect(onUnavailable).toHaveBeenCalled())
    expect(panel()).toBeNull()
    expect(launcher()).toBeNull()
  })

  it('el tema solo se aplica al contenedor del widget, no a la pagina anfitriona', async () => {
    stubHub({ brand_color: '#0E7490', appearance: 'dark' })
    render(<SupportEmbed {...opts} mode="inline" />)
    await waitFor(() => expect(panel().style.getPropertyValue('--primary')).not.toBe(''))
    expect(document.documentElement.style.getPropertyValue('--primary')).toBe('')
    expect(document.documentElement.classList.contains('dark')).toBe(false)
  })
})

describe('mountSupportEmbed (sin React)', () => {
  it('monta en el elemento, lo controla (open/close/toggle) y se desmonta limpio', async () => {
    stubHub()
    const el = document.body.appendChild(document.createElement('div'))
    const handle = mountSupportEmbed(el, { ...opts, mode: 'floating' })
    await waitFor(() => expect(launcher()).not.toBeNull())
    expect(el.contains(panel())).toBe(true)
    act(() => handle.open())
    await waitFor(() => expect(panel().style.display).toBe('block'))
    act(() => handle.toggle())
    await waitFor(() => expect(panel().style.display).toBe('none'))
    act(() => handle.update({ mode: 'inline', height: 300 }))
    await waitFor(() => expect(panel().style.height).toBe('300px'))
    act(() => handle.unmount())
    expect(el.children).toHaveLength(0)
  })
})
