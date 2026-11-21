// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { GenUIProvider } from './registry'
import { SeriesView } from './tiles'
import { RankedList } from './tiles'
import es from '../../i18n/src/locales/es.json'
import en from '../../i18n/src/locales/en.json'
import { GENUI_LABELS } from './labels'

afterEach(cleanup)

const flat = (o: Record<string, unknown>, p = ''): Record<string, string> =>
  Object.entries(o).reduce((a, [k, v]) => (typeof v === 'object' && v ? { ...a, ...flat(v as Record<string, unknown>, `${p}${k}.`) } : { ...a, [`${p}${k}`]: String(v) }), {})

describe('genui labels', () => {
  it('every key has es and en translations in the i18n package', () => {
    for (const bundle of [es, en]) {
      const f = flat((bundle as { genui: Record<string, unknown> }).genui, 'genui.')
      expect(Object.keys(f).sort()).toEqual(Object.keys(GENUI_LABELS).sort())
    }
  })
  it('falls back to Spanish without a translator or when t returns the key', () => {
    render(<RankedList items={[{ id: 'a', label: 'A' }]} ranked label='x' />)
    expect(screen.getByLabelText('Posicion 1')).toBeTruthy()
    cleanup()
    render(
      <GenUIProvider t={(k) => k}>
        <RankedList items={[{ id: 'a', label: 'A' }]} ranked label='x' />
      </GenUIProvider>,
    )
    expect(screen.getByLabelText('Posicion 1')).toBeTruthy()
  })
  it('uses the host translator with arguments', () => {
    const dict = flat((en as { genui: Record<string, unknown> }).genui, 'genui.')
    const t = (k: string, a?: Record<string, unknown>) => (dict[k] ?? k).replace(/\{\{(\w+)\}\}/g, (_, n: string) => String(a?.[n]))
    render(
      <GenUIProvider t={t}>
        <RankedList items={[{ id: 'a', label: 'A' }]} ranked label='x' />
        <SeriesView title='t' columns={[{ key: 'v', label: 'V' }]} rows={[{ label: 'r', v: 1 }]} chart={<i />} toggle='single' />
      </GenUIProvider>,
    )
    expect(screen.getByLabelText('Position 1')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Show table' })).toBeTruthy()
  })
})
