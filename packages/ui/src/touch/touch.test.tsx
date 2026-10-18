import { describe, it, expect } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { TouchButton } from './touch-button'
import { TouchGrid } from './touch-grid'
import { VirtualKeyboard } from './virtual-keyboard'
import { applyKeyAction, charFor, nextShift, rowsFor, type KeyDef } from './keyboard-layouts'

describe('TouchButton', () => {
  it('defaults the min target to the theme var with a 60px fallback', () => {
    const html = renderToStaticMarkup(<TouchButton>Ok</TouchButton>)
    expect(html).toContain('min-height:var(--touch-min-target, 60px)')
    expect(html).toContain('type="button"')
  })
  it('accepts a configurable min target', () => {
    const html = renderToStaticMarkup(<TouchButton minTarget={80}>Ok</TouchButton>)
    expect(html).toContain('min-height:80px')
    expect(html).toContain('min-width:80px')
  })
})

describe('TouchGrid', () => {
  it('uses a fixed column count', () => {
    const html = renderToStaticMarkup(<TouchGrid columns={3}>x</TouchGrid>)
    expect(html).toContain('repeat(3, minmax(0, 1fr))')
  })
  it('auto-fits at 3x the target by default', () => {
    expect(renderToStaticMarkup(<TouchGrid>x</TouchGrid>)).toContain('minmax(calc(var(--touch-min-target, 60px) * 3), 1fr)')
    expect(renderToStaticMarkup(<TouchGrid minTarget={80}>x</TouchGrid>)).toContain('minmax(240px, 1fr)')
  })
})

describe('keyboard layouts', () => {
  it('numeric puts enter last on the right', () => {
    for (const d of [false, true]) {
      const last = rowsFor('numeric', d).at(-1)!
      expect(last.at(-1)!.kind).toBe('enter')
    }
  })
  it('email .com stays lowercase under shift', () => {
    const k = rowsFor('email').flat().find((x) => x.kind === 'char' && x.value === '.com')!
    expect(charFor(k as Extract<KeyDef, { kind: 'char' }>, 'lock')).toBe('.com')
  })
  it('numeric has digits, backspace and enter; decimal is opt-in', () => {
    const keys = (d: boolean) => rowsFor('numeric', d).flat().map((k) => (k.kind === 'char' ? k.value : k.kind))
    expect(keys(false)).toEqual(expect.arrayContaining(['0', '9', 'backspace', 'enter']))
    expect(keys(false)).not.toContain('.')
    expect(keys(true)).toContain('.')
  })
  it('email exposes @ and .com', () => {
    const keys = rowsFor('email').flat().map((k) => (k.kind === 'char' ? k.value : k.kind))
    expect(keys).toEqual(expect.arrayContaining(['@', '.com']))
  })
  it('cycles shift off -> once -> lock -> off', () => {
    expect(nextShift('off')).toBe('once')
    expect(nextShift('once')).toBe('lock')
    expect(nextShift('lock')).toBe('off')
  })
  it('applies actions, backspace is codepoint-safe', () => {
    expect(applyKeyAction('ab', { type: 'char', value: 'c' })).toBe('abc')
    expect(applyKeyAction('a', { type: 'space' })).toBe('a ')
    expect(applyKeyAction('a😀', { type: 'backspace' })).toBe('a')
    expect(applyKeyAction('a', { type: 'enter' })).toBe('a')
  })
})

describe('VirtualKeyboard markup', () => {
  it('is an accessible labelled group of buttons with a min target', () => {
    const html = renderToStaticMarkup(<VirtualKeyboard layout='text' />)
    expect(html).toContain('role="group"')
    expect(html).toContain('aria-label="Teclado virtual"')
    expect(html).toContain('aria-label="Borrar"')
    expect(html).toContain('aria-pressed="false"')
    expect(html).toContain('min-height:var(--touch-min-target, 60px)')
  })
  it('renders custom rows', () => {
    const html = renderToStaticMarkup(
      <VirtualKeyboard rows={[[{ kind: 'char', value: 'ж' }, { kind: 'enter' }]]} />,
    )
    expect(html).toContain('data-key="ж"')
    expect(html).not.toContain('data-key="q"')
  })
  it('honours label overrides and minTarget', () => {
    const html = renderToStaticMarkup(
      <VirtualKeyboard layout='numeric' minTarget={72} labels={{ group: 'Keypad', enter: 'Done' }} />,
    )
    expect(html).toContain('aria-label="Keypad"')
    expect(html).toContain('aria-label="Done"')
    expect(html).toContain('min-height:72px')
  })
})
