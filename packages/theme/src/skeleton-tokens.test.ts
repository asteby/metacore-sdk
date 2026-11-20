import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const css = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), '../styles/tokens.css'), 'utf8')

describe('skeleton tokens', () => {
  it('defines the comfortable defaults and a compact density override', () => {
    for (const t of ['--skeleton-row-h', '--skeleton-row-h-lg', '--skeleton-line-h', '--skeleton-avatar', '--skeleton-radius']) {
      expect(css).toContain(`${t}:`)
    }
    expect(css).toMatch(/:root\[data-ui-density='compact'\]\s*\{[^}]*--skeleton-row-h:/)
  })
})
