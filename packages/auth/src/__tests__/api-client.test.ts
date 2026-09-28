import { describe, expect, it, vi } from 'vitest'
import { AxiosError, AxiosHeaders } from 'axios'
import type { AxiosAdapter, InternalAxiosRequestConfig } from 'axios'
import { createApiClient, HtmlResponseError, isHtmlResponseError } from '../api-client'

const NEXT_404 =
  '<!DOCTYPE html><html lang="es"><head><meta charSet="utf-8"/><title>404: This page could not be found.</title>' +
  '<link rel="stylesheet" href="/_next/static/chunks/1-brnwz3m8bwr.css"/></head><body>404</body></html>'

type Reply = { status: number; data: unknown; contentType: string }

/** Adapter that answers every request with `reply`, rejecting non-2xx the way axios' own adapters do. */
function adapter(reply: Reply): AxiosAdapter {
  return async (config: InternalAxiosRequestConfig) => {
    const response = {
      data: reply.data,
      status: reply.status,
      statusText: String(reply.status),
      headers: new AxiosHeaders({ 'content-type': reply.contentType }),
      config,
      request: {},
    }
    if (reply.status >= 200 && reply.status < 300) return response
    throw new AxiosError(`Request failed with status code ${reply.status}`, 'ERR_BAD_RESPONSE', config, {}, response)
  }
}

function client(reply: Reply, extra: Parameters<typeof createApiClient>[0] = { baseURL: '/api' }) {
  return createApiClient({ ...extra, axiosConfig: { adapter: adapter(reply) } })
}

describe('createApiClient — HTML responses', () => {
  vi.spyOn(console, 'error').mockImplementation(() => {})

  it('rejects a 200 HTML page (SPA catch-all) with HtmlResponseError', async () => {
    const api = client({ status: 200, data: NEXT_404, contentType: 'text/html; charset=utf-8' })
    const err = await api.get('/kernel/things').catch((e: unknown) => e)
    expect(err).toBeInstanceOf(HtmlResponseError)
    expect(isHtmlResponseError(err)).toBe(true)
    const typed = err as HtmlResponseError
    expect(typed.status).toBe(200)
    expect(typed.url).toBe('GET /kernel/things')
    expect(typed.message).not.toContain('<')
    expect(typed.response.data.message).toBe(typed.message)
  })

  it('rejects a 404 HTML error page with HtmlResponseError, keeping the status', async () => {
    const api = client({ status: 404, data: NEXT_404, contentType: 'text/html' })
    const err = (await api.post('/gateway', {}).catch((e: unknown) => e)) as HtmlResponseError
    expect(err).toBeInstanceOf(HtmlResponseError)
    expect(err.status).toBe(404)
    expect(err.embedded).toBe(false)
    expect(err.title).toBe('404: This page could not be found.')
  })

  it('rejects a JSON envelope whose message is an upstream HTML page', async () => {
    const api = client({ status: 400, data: { success: false, message: NEXT_404 }, contentType: 'application/json' })
    const err = (await api.post('/data/Device/me/1/action/connect_device').catch((e: unknown) => e)) as HtmlResponseError
    expect(err).toBeInstanceOf(HtmlResponseError)
    expect(err.embedded).toBe(true)
    expect(err.message).not.toContain('DOCTYPE')
  })

  it('uses the app-provided human message', async () => {
    const api = client(
      { status: 502, data: NEXT_404, contentType: 'text/html' },
      { baseURL: '/api', htmlErrorMessage: (s) => `No pudimos contactar el servicio (HTTP ${s})` },
    )
    const err = (await api.get('/x').catch((e: unknown) => e)) as HtmlResponseError
    expect(err.message).toBe('No pudimos contactar el servicio (HTTP 502)')
  })

  it('still runs onUnauthorized for an HTML 401', async () => {
    const onUnauthorized = vi.fn()
    const api = client({ status: 401, data: NEXT_404, contentType: 'text/html' }, { baseURL: '/api', onUnauthorized })
    const err = await api.get('/me').catch((e: unknown) => e)
    expect(onUnauthorized).toHaveBeenCalledOnce()
    expect(err).toBeInstanceOf(HtmlResponseError)
  })

  it('passes JSON through untouched', async () => {
    const api = client({ status: 200, data: { success: true, data: { ok: 1 } }, contentType: 'application/json' })
    const res = await api.get('/ok')
    expect(res.data).toEqual({ success: true, data: { ok: 1 } })
  })

  it('keeps regular JSON errors as axios errors', async () => {
    const api = client({ status: 422, data: { success: false, message: 'RFC inválido' }, contentType: 'application/json' })
    const err = await api.post('/x').catch((e: unknown) => e)
    expect(err).toBeInstanceOf(AxiosError)
    expect(isHtmlResponseError(err)).toBe(false)
  })

  it('lets a request that asked for text opt out', async () => {
    const api = client({ status: 200, data: NEXT_404, contentType: 'text/html' })
    const res = await api.get('/print/invoice.html', { responseType: 'text' })
    expect(res.data).toBe(NEXT_404)
  })
})
