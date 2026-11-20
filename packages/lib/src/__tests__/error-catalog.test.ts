import { execSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { getApiErrorMessage } from '../envelope'
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

  it('getApiErrorMessage prefers the catalog over message when lang is given', () => {
    const err = { response: { data: { success: false, code: 'unknown_filter', message: 'unknown filter' } } }
    expect(getApiErrorMessage(err, 'x', { lang: 'es' })).toMatch(/filtro/)
    expect(getApiErrorMessage(err, 'x')).toBe('unknown filter')
    const nested = { response: { data: { error: { code: 'importer.number', message: 'm', params: { column: 'qty', value: 'z' } } } } }
    expect(getApiErrorMessage(nested, 'x', { lang: 'es' })).toBe("'qty' debe ser un número (recibido: z).")
    const unknown = { response: { data: { code: 'zzz', message: 'fallback msg' } } }
    expect(getApiErrorMessage(unknown, 'x', { lang: 'es' })).toBe('fallback msg')
  })

  it('registerErrorCatalog adds app codes', () => {
    registerErrorCatalog('es', { app_custom: 'Hola {n}' })
    expect(translateErrorCode('app_custom', 'es', { n: 2 })).toBe('Hola 2')
  })

  it('stays in parity with the kernel errcodes JSON', () => {
    const p = kernelJsonPath()
    if (!p) return // kernel module not resolvable offline
    expect(JSON.parse(readFileSync(p, 'utf8'))).toEqual(kernelErrorCatalog)
  })
})
