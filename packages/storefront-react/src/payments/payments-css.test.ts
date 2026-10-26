import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

describe('payments.css: 3DS dialog', () => {
  it('stays light inside a dark page (the bank page is white): fixed colors and color-scheme light', () => {
    const css = readFileSync(new URL('./payments.css', import.meta.url), 'utf8')
    const rule = css.match(/dialog\[data-sf-challenge\]\s*\{([^}]*)\}/)?.[1] ?? ''
    expect(rule).toMatch(/background:\s*#ffffff/)
    expect(rule).toMatch(/color-scheme:\s*light/)
  })
})
