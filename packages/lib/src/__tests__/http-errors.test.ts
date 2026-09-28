import { describe, expect, it } from 'vitest'
import { handleServerError } from '../errors'
import {
  HtmlResponseError,
  detectHtmlResponse,
  isHtmlResponseError,
  looksLikeHtml,
} from '../http-errors'

// The exact first bytes hub.asteby.com's Next.js catch-all answered for a
// misrouted /gateway call (ops, "Conectar WhatsApp", 2026-09-28).
const NEXT_404 =
  '<!DOCTYPE html><html lang="es" class="geistsans_d5a4f12f-module__kaJMUW__variable"><head><meta charSet="utf-8"/>' +
  '<title>404: This page could not be found.</title><link rel="stylesheet" href="/_next/static/chunks/1-brnwz3m8bwr.css"/>' +
  '<script>self.__next_f=[]</script></head><body><div>404</div></body></html>'

describe('looksLikeHtml', () => {
  it('detects documents and fragments', () => {
    expect(looksLikeHtml(NEXT_404)).toBe(true)
    expect(looksLikeHtml('  \n<html><body>x</body></html>')).toBe(true)
    expect(looksLikeHtml('<head><title>502 Bad Gateway</title></head>')).toBe(true)
    expect(looksLikeHtml('<div class="cf-error">oops</div>')).toBe(true)
  })

  it('leaves plain messages and non-strings alone', () => {
    expect(looksLikeHtml('device not found')).toBe(false)
    expect(looksLikeHtml('a < b and b > c')).toBe(false)
    expect(looksLikeHtml('<5 items left')).toBe(false)
    expect(looksLikeHtml(undefined)).toBe(false)
    expect(looksLikeHtml({ message: NEXT_404 })).toBe(false)
  })
})

describe('detectHtmlResponse', () => {
  it('flags an HTML body', () => {
    const err = detectHtmlResponse({ status: 404, url: 'POST /gateway', contentType: 'text/html; charset=utf-8', body: NEXT_404 })
    expect(err).toBeInstanceOf(HtmlResponseError)
    expect(err?.embedded).toBe(false)
    expect(err?.status).toBe(404)
    expect(err?.title).toBe('404: This page could not be found.')
  })

  it('flags HTML forwarded inside a JSON envelope', () => {
    const err = detectHtmlResponse({ status: 400, body: { success: false, message: NEXT_404 } })
    expect(err?.embedded).toBe(true)
  })

  it('flags HTML in a nested {error:{message}} envelope', () => {
    const err = detectHtmlResponse({ status: 502, body: { success: false, error: { code: 'gateway_status', message: NEXT_404 } } })
    expect(err?.embedded).toBe(true)
  })

  it('flags a non-markup body served as text/html', () => {
    expect(detectHtmlResponse({ contentType: 'text/html', body: 'Bad Gateway' })).toBeInstanceOf(HtmlResponseError)
  })

  it('passes JSON, plain text and empty bodies through', () => {
    expect(detectHtmlResponse({ body: { success: false, message: 'device not found' } })).toBeUndefined()
    expect(detectHtmlResponse({ contentType: 'text/plain', body: 'rate limited' })).toBeUndefined()
    expect(detectHtmlResponse({ body: '' })).toBeUndefined()
    expect(detectHtmlResponse({ body: null })).toBeUndefined()
  })
})

describe('HtmlResponseError', () => {
  it('never exposes the page as its message and keeps a correlatable detail', () => {
    const err = new HtmlResponseError({ status: 404, url: 'POST /api/x', html: NEXT_404, message: 'No pudimos contactar el servicio' })
    expect(err.message).toBe('No pudimos contactar el servicio')
    expect(err.message).not.toContain('<')
    expect(err.correlationId).toMatch(/^ERR-[A-Z0-9]{6}$/)
    expect(err.snippet).not.toContain('<')
    expect(err.snippet).not.toContain('__next_f')
    const details = err.details()
    expect(details).toContain('status: 404')
    expect(details).toContain(err.correlationId)
    expect(details).not.toContain('<!DOCTYPE')
    expect(isHtmlResponseError(err)).toBe(true)
    expect(isHtmlResponseError(new Error('x'))).toBe(false)
  })

  it('reads as a human message through axios-style consumers', () => {
    const err = new HtmlResponseError({ status: 502, html: NEXT_404 })
    expect(err.response.data.message).toBe(err.message)
    expect(err.response.status).toBe(502)
  })
})

describe('handleServerError', () => {
  const silent = { logger: {} }

  it('does not surface an HTML message from an axios-style error', () => {
    const msg = handleServerError({ isAxiosError: true, response: { status: 400, data: { message: NEXT_404 } } }, undefined, {
      ...silent,
      labels: { generic: 'Algo salió mal' },
    })
    expect(msg).toBe('Algo salió mal')
  })

  it('does not surface an HTML string error', () => {
    expect(handleServerError(NEXT_404, undefined, silent)).not.toContain('<')
  })

  it('keeps regular server messages', () => {
    expect(handleServerError({ response: { status: 422, data: { message: 'RFC inválido' } } }, undefined, silent)).toBe('RFC inválido')
  })
})
