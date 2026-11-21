import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const css = readFileSync(resolve(process.cwd(), 'styles/tones.css'), 'utf8')
const tokens = readFileSync(resolve(process.cwd(), 'styles/tokens.css'), 'utf8')
const TONES = ['muted', 'brand', 'success', 'warning', 'danger', 'info']

describe('tones.css', () => {
  it.each(TONES)('tone %s: solid in tokens.css, derived soft/border/text here, Tailwind colors mapped', (k) => {
    expect(tokens).toContain(`--tone-${k}:`)
    for (const v of ['soft', 'border', 'text']) {
      expect(css).toContain(`--tone-${k}-${v}:`)
      expect(css).toContain(`--color-tone-${k}-${v}: var(--tone-${k}-${v})`)
    }
    expect(css).toContain(`--color-tone-${k}: var(--tone-${k})`)
  })

  it('defines the 6 categorical slots and 5 sequential steps in light and dark', () => {
    const dark = css.slice(css.indexOf('.dark {'))
    for (let i = 1; i <= 6; i++) {
      expect(css.slice(0, css.indexOf('.dark {'))).toContain(`--viz-${i}:`)
      expect(dark).toContain(`--viz-${i}:`)
    }
    for (let i = 1; i <= 5; i++) expect(css).toContain(`--viz-seq-${i}:`)
  })

  it('layers the surfaces from the theme grey (card / foreground), never from --primary', () => {
    const surfaceLines = css.split('\n').filter((l) => /^\s*--(surface-(1|2|solid|inset|border|highlight|shadow)|viz-grid):/.test(l))
    expect(surfaceLines.length).toBeGreaterThanOrEqual(14)
    for (const l of surfaceLines) expect(l).not.toContain('--primary')
  })

  it('is imported by index.css and exported', () => {
    expect(readFileSync(resolve(process.cwd(), 'styles/index.css'), 'utf8')).toContain("./tones.css")
    expect(readFileSync(resolve(process.cwd(), 'package.json'), 'utf8')).toContain('"./tones.css"')
  })
})
