/**
 * Contrast contract of the shipped tokens (tokens.css + glass.css).
 *
 * Measures the real WCAG ratio of every semantic pair the UI paints, in light
 * and dark, and for the glass pack against the composited surface: the
 * translucent card over the inset over the backdrop, evaluated at both
 * extremes of the gradient (bare backdrop and all three blob peaks stacked,
 * no blur). Fails CI when any pair drops below AA.
 */
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { WCAG, composite, contrastRatio, flatten, parseColor, type Rgba } from './contrast.js'
import { chartTokens, colorTokens } from './preset.js'

const stylesDir = resolve(dirname(fileURLToPath(import.meta.url)), '../styles')
const read = (f: string) => readFileSync(resolve(stylesDir, f), 'utf8')
const tokensCss = read('tokens.css')
const glassCss = read('glass.css')

type Vars = Record<string, string>

/** `--x: value;` declarations of the top-level blocks whose selector is exactly `selector`. */
function blockVars(css: string, selector: string): Vars {
  const src = css.replace(/\/\*[\s\S]*?\*\//g, '')
  const out: Vars = {}
  let from = 0
  for (;;) {
    const idx = src.indexOf(`${selector} {`, from)
    if (idx < 0) break
    from = idx + 1
    if (idx > 0 && !/\s/.test(src[idx - 1]!)) continue
    let depth = 1
    let j = src.indexOf('{', idx) + 1
    const start = j
    while (depth && j < src.length) {
      if (src[j] === '{') depth++
      else if (src[j] === '}') depth--
      j++
    }
    for (const m of src.slice(start, j - 1).matchAll(/(--[\w-]+)\s*:\s*([^;{}]+);/g)) {
      out[m[1]!] = m[2]!.trim().replace(/\s+/g, ' ')
    }
  }
  return out
}

function resolver(vars: Vars) {
  const get = (name: string, depth = 0): string => {
    const v = vars[name]
    if (v === undefined || depth > 12) throw new Error(`Missing token ${name}`)
    const ref = /^var\((--[\w-]+)(?:,\s*(.+))?\)$/.exec(v)
    return ref ? get(ref[1]!, depth + 1) : v
  }
  return get
}

const gradientPeaks = (vars: Vars) =>
  ['--glass-gradient-1', '--glass-gradient-2', '--glass-gradient-3'].flatMap((k) =>
    [...(vars[k] ?? '').matchAll(/oklch\([^)]*\)/g)].map((m) => m[0]),
  )

interface Scenario {
  name: string
  get: (name: string) => string
  /** Opaque page colors to evaluate (glass: backdrop extremes). */
  pages: Rgba[]
  glass: boolean
}

const rootVars = blockVars(tokensCss, ':root')
const darkVars = { ...rootVars, ...blockVars(tokensCss, '.dark') }
const glassLight = { ...rootVars, ...blockVars(glassCss, "[data-ui-theme='glass']") }
const glassDark = { ...darkVars, ...blockVars(glassCss, "[data-ui-theme='glass']"), ...blockVars(glassCss, ".dark[data-ui-theme='glass']") }

function scenario(name: string, vars: Vars, glass: boolean): Scenario {
  const get = resolver(vars)
  const pages = glass
    ? [flatten(get('--glass-backdrop')), flatten(get('--glass-backdrop'), ...gradientPeaks(vars))]
    : [flatten(get('--background'))]
  return { name, get, pages, glass }
}

const scenarios = [
  scenario('light', rootVars, false),
  scenario('dark', darkVars, false),
  scenario('glass light', glassLight, true),
  scenario('glass dark', glassDark, true),
]

type Surface = (s: Scenario, page: Rgba) => Rgba
const inset: Surface = (s, page) => (s.glass ? composite(s.get('--background'), page) : page)
const card: Surface = (s, page) => composite(s.get('--card'), inset(s, page))
const on = (token: string, below: Surface): Surface => (s, page) => composite(s.get(token), below(s, page))
const tint = (token: string, pct: number, below: Surface): Surface => (s, page) => {
  const c = parseColor(s.get(token))!
  return composite({ ...c, a: c.a * pct }, below(s, page))
}

/** [label, foreground token, surface, minimum, foreground alpha] */
type Pair = [string, string, Surface, number, number?]
const PAIRS: Pair[] = [
  ['foreground / background', '--foreground', inset, WCAG.text],
  ['card-foreground / card', '--card-foreground', card, WCAG.text],
  ['muted-foreground / card', '--muted-foreground', card, WCAG.text],
  ['muted-foreground / muted chip', '--muted-foreground', on('--muted', card), WCAG.text],
  ['primary-foreground / primary', '--primary-foreground', on('--primary', card), WCAG.text],
  ['primary as text / card', '--primary', card, WCAG.text],
  ['secondary-foreground / secondary', '--secondary-foreground', on('--secondary', card), WCAG.text],
  ['accent-foreground / accent', '--accent-foreground', on('--accent', card), WCAG.text],
  ['destructive as text / card', '--destructive', card, WCAG.text],
  ['destructive-foreground / destructive', '--destructive-foreground', on('--destructive', card), WCAG.text],
  ['popover-foreground / popover', '--popover-foreground', (s, p) => composite(s.get('--popover'), p), WCAG.text],
  ['sidebar-foreground / sidebar', '--sidebar-foreground', (s, p) => composite(s.get('--sidebar'), p), WCAG.text],
  ['sidebar-accent-foreground / sidebar-accent', '--sidebar-accent-foreground', (s, p) => composite(s.get('--sidebar-accent'), composite(s.get('--sidebar'), p)), WCAG.text],
  ...(['success', 'warning', 'info'] as const).flatMap<Pair>((k) => [
    [`${k} as text / card`, `--${k}`, card, WCAG.text],
    [`${k} badge (text on 14% tint)`, `--${k}`, tint(`--${k}`, 0.14, card), WCAG.text],
    [`${k}-foreground / ${k}`, `--${k}-foreground`, on(`--${k}`, card), WCAG.text],
  ]),
  ['destructive badge (text on 12% tint)', '--destructive', tint('--destructive', 0.12, card), WCAG.text],
  ['input (control boundary) / card', '--input', card, WCAG.nonText],
  ['ring at 50% (focus) / card', '--ring', card, WCAG.nonText, 0.5],
  ['primary (button boundary) / card', '--primary', card, WCAG.nonText],
  ...[1, 2, 3, 4, 5, 6, 7, 8].map<Pair>((i) => [`chart-${i} / card`, `--chart-${i}`, card, WCAG.nonText]),
  ...['emerald', 'sky', 'violet', 'amber', 'rose', 'slate'].map<Pair>((k) => [`widget ${k} / card`, `--color-widget-${k}`, card, WCAG.nonText]),
]

function worst(s: Scenario, [, fg, surface, , alpha = 1]: Pair): number {
  return Math.min(
    ...s.pages.map((page) => {
      const c = parseColor(s.get(fg))!
      return contrastRatio({ ...c, a: c.a * alpha }, surface(s, page))
    }),
  )
}

describe.each(scenarios)('token contrast — $name', (s) => {
  it.each(PAIRS)('%s', (...pair) => {
    const ratio = worst(s, pair as Pair)
    expect(ratio, `${s.name}: ${pair[0]} = ${ratio.toFixed(2)}:1`).toBeGreaterThanOrEqual(pair[3])
  })
})

describe('preset.ts mirrors tokens.css', () => {
  const camel = (k: string) => k.replace(/-(\w)/g, (_, c: string) => c.toUpperCase())
  it.each([
    ['light', rootVars],
    ['dark', darkVars],
  ] as const)('%s colors and charts', (mode, vars) => {
    for (const [key, value] of Object.entries(colorTokens[mode])) {
      const cssKey = Object.keys(vars).find((k) => camel(k.slice(2)) === key)
      expect(cssKey, key).toBeDefined()
      expect(value, key).toBe(vars[cssKey!])
    }
    for (const [key, value] of Object.entries(chartTokens[mode])) {
      expect(value, key).toBe(vars[`--chart-${key.slice(5)}`])
    }
  })
})
