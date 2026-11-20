import { execSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { ApiError, getApiErrorMessage, getApiFieldErrors } from '../envelope'
import {
  interpolateErrorTemplate,
  kernelErrorCatalog,
  registerErrorCatalog,
  translateErrorCode,
} from '../error-catalog'

function kernelJsonPath(): string | undefined {
  if (process.env.KERNEL_ERRORS_JSON) return process.env.KERNEL_ERRORS_JSON
  try {
    const dir = execSync('go list -m -f {{.Dir}} github.com/asteby/metacore-kernel', {
      cwd: resolve(__dirname, '../../../..'),
      env: { ...process.env, GOWORK: 'off' },
      stdio: ['ignore', 'pipe', 'ignore'],
    })
      .toString()
      .trim()
    const p = join(dir, 'errcodes/locales/errors.json')
    return existsSync(p) ? p : undefined
  } catch {
    return undefined
  }
}

describe('error catalog', () => {
  it('interpolates {param}', () => {
    expect(interpolateErrorTemplate('a {x} b {y}', { x: 1 })).toBe('a 1 b {y}')
  })

  it('translates a kernel code in es and en', () => {
    expect(translateErrorCode('automation.not_found', 'es-MX')).toBe('Automatización no encontrada.')
    expect(translateErrorCode('automation.not_found', 'en')).toBe('Automation not found.')
    expect(translateErrorCode('importer.required', 'es', { column: 'sku' })).toBe("Falta 'sku'.")
    expect(translateErrorCode('nope', 'es')).toBeUndefined()
  })

  const v422 = {
    success: false,
    message: 'validation.failed',
    errors: {
      lines: [
        {
          code: 'exceeds_remaining',
          params: { line: 2, requested: 5, remaining: 3, source: 'OC-1' },
          message: 'Line 2: quantity 5 exceeds ...',
        },
      ],
      customer_id: [{ code: 'source_not_found', params: { source: 'OC-9' } }],
    },
  }

  it('422 field errors (errors[col][i]) are translated by code', () => {
    const err = { response: { data: v422 } }
    expect(getApiFieldErrors(err, { lang: 'es' })).toEqual({
      lines: [expect.stringContaining('Renglón 2: la cantidad 5 excede lo pendiente de OC-1 (3)')],
      customer_id: ['No se encontró el documento origen elegido OC-9.'],
    })
    expect(getApiFieldErrors(err, { lang: 'en' }).lines[0]).toMatch(/^Line 2: quantity 5 exceeds/)
    // sin lang: usa message propio, o el code
    expect(getApiFieldErrors(err)).toEqual({
      lines: ['Line 2: quantity 5 exceeds ...'],
      customer_id: ['source_not_found'],
    })
    expect(getApiErrorMessage(err, 'x', { lang: 'es' })).toMatch(/^Renglón 2/)
    expect(getApiErrorMessage(err, 'x')).toBe('Line 2: quantity 5 exceeds ...')
  })

  it('flat bodies: unknown_filter (400) and automation.* (root code)', () => {
    const f = { response: { data: { success: false, message: 'unknown filter', code: 'unknown_filter' } } }
    expect(getApiErrorMessage(f, 'x', { lang: 'es' })).toMatch(/filtro/)
    expect(getApiErrorMessage(f, 'x')).toBe('unknown filter')
    const a = { response: { data: { success: false, message: 'not found', code: 'automation.not_found' } } }
    expect(getApiErrorMessage(a, 'x', { lang: 'es' })).toBe('Automatización no encontrada.')
  })

  it('importer issues {code, params, message} and error{} envelopes', () => {
    const imp = { response: { data: { error: { code: 'importer.number', message: 'm', params: { column: 'qty', value: 'z' } } } } }
    expect(getApiErrorMessage(imp, 'x', { lang: 'es' })).toBe("'qty' debe ser un número (recibido: z).")
    const unknown = { response: { data: { code: 'zzz', message: 'fallback msg' } } }
    expect(getApiErrorMessage(unknown, 'x', { lang: 'es' })).toBe('fallback msg')
  })

  it('ApiError with envelope details', () => {
    const e = new ApiError('m', { code: 'automation.limit' })
    expect(getApiErrorMessage(e, 'x', { lang: 'es' })).toBe('Límite de automatizaciones alcanzado.')
  })

  it('registerErrorCatalog adds app codes', () => {
    registerErrorCatalog('es', { app_custom: 'Hola {n}' })
    expect(translateErrorCode('app_custom', 'es', { n: 2 })).toBe('Hola 2')
  })

  it('stays in parity with the kernel errcodes JSON', { timeout: 60_000 }, () => {
    const p = kernelJsonPath()
    if (!p) return // kernel module not resolvable offline
    expect(JSON.parse(readFileSync(p, 'utf8'))).toEqual(kernelErrorCatalog)
  })
})
