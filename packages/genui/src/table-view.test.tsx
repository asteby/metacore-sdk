// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render, within } from '@testing-library/react'
import { GenUI, GenerativeUI, TABLE_MAX_HEIGHT, TableView, humanize } from './index'

afterEach(cleanup)

// Las pruebas del renderer no dependen del esquema nuevo del kernel: se monta `TableView` directo.
const cols = [
  { key: 'name', label: 'Nombre' },
  { key: 'status', label: 'Estado', variant: 'badge' as const, tones: { ok: 'success', late: 'danger' } as const },
]
const rows = [
  { name: 'Unidad 1', status: 'ok' },
  { name: 'Unidad 2', status: 'in_progress' },
]
const wide = (c: HTMLElement) => c.querySelector<HTMLElement>('[data-genui-table-scroll="table"]')!
const narrow = (c: HTMLElement) => c.querySelector<HTMLElement>('[data-genui-table-scroll="list"]')!

describe('TableView', () => {
  it('max_height: scroll interno, cabecera fija y alcanzable por teclado', () => {
    const { container } = render(<TableView block={{ columns: cols, rows, title: 'Flota', max_height: 'md' }} />)
    const s = wide(container)
    expect(TABLE_MAX_HEIGHT.md).toBe('24rem')
    expect(s.style.maxHeight).toBe('24rem')
    expect(s.className).toContain('overflow-auto')
    expect(s.tabIndex).toBe(0)
    expect(s.getAttribute('aria-label')).toBe('Flota')
    expect(s.querySelector('th')!.className).toContain('sticky')
    expect(narrow(container).style.maxHeight).toBe('24rem')
  })

  it('sin max_height no limita el alto ni fija la cabecera', () => {
    const { container } = render(<TableView block={{ columns: cols, rows }} />)
    expect(wide(container).style.maxHeight).toBe('')
    expect(wide(container).querySelector('th')!.className).not.toContain('sticky')
  })

  it('badge con tono, etiqueta del host e icono', () => {
    const Icon = ({ className }: { className?: string }) => <svg data-testid='ico' className={className} />
    const { container } = render(
      <TableView
        block={{ columns: [cols[0]!, { ...cols[1]!, labels: { ok: { $t: 'status.ok' } }, icons: { ok: 'CheckCircle' } }], rows: [rows[0]!] }}
        text={(v) => (typeof v === 'string' ? v : v && typeof v === 'object' && '$t' in v ? ({ 'status.ok': 'Operativa' } as Record<string, string>)[(v as { $t: string }).$t]! : '')}
        resolveIcon={(n) => (n === 'CheckCircle' ? Icon : null)}
      />,
    )
    const badge = within(wide(container)).getByText('Operativa')
    expect(badge.closest('[data-slot="badge"]')?.className).toMatch(/success/)
    expect(badge.parentElement!.querySelector('[data-testid="ico"]')).toBeTruthy()
  })

  it('etiqueta ausente o sin traducir cae al valor humanizado, nunca la clave cruda', () => {
    const { container } = render(
      <TableView block={{ columns: [cols[0]!, { ...cols[1]!, labels: { late: { $t: 'status.late' } } }], rows: [{ name: 'A', status: 'in_progress' }, { name: 'B', status: 'late' }] }} text={(v) => (typeof v === 'string' ? v : (v as { $t: string }).$t)} />,
    )
    const t = within(wide(container))
    expect(t.getByText('In progress')).toBeTruthy()
    expect(t.queryByText('in_progress')).toBeNull()
    expect(t.getByText('Late')).toBeTruthy()
    expect(t.queryByText('status.late')).toBeNull()
    expect(humanize('inProgress')).toBe('In progress')
    expect(humanize('Ya legible')).toBe('Ya legible')
  })

  it('icono desconocido se omite sin romper', () => {
    const { container } = render(<TableView block={{ columns: [cols[0]!, { ...cols[1]!, icons: { ok: 'NoExiste' } }], rows: [rows[0]!] }} resolveIcon={() => null} />)
    expect(within(wide(container)).getByText('Ok')).toBeTruthy()
    expect(wide(container).querySelector('svg')).toBeNull()
  })

  it('format relative_date usa la configuracion regional del host', () => {
    const iso = new Date(Date.now() - 3 * 3_600_000).toISOString()
    const { container } = render(<TableView block={{ columns: [{ key: 'at', label: 'Visto', format: 'relative_date' }], rows: [{ at: iso }] }} locale='es-MX' />)
    const time = wide(container).querySelector('time')!
    expect(time.getAttribute('datetime')).toBe(iso)
    expect(time.textContent).toMatch(/hace 3 horas/)
    expect(time.getAttribute('title')).toBeTruthy()
    expect(time.textContent).not.toContain('T')
  })

  it('density compact: filas compactas en estrecho, sin tarjetas con pares etiqueta/valor', () => {
    const { container } = render(<TableView block={{ columns: [...cols, { key: 'zone', label: 'Zona' }], rows: [{ name: 'Unidad 1', status: 'ok', zone: 'Norte' }], density: 'compact' }} />)
    const list = narrow(container)
    expect(list.getAttribute('data-density')).toBe('compact')
    expect(list.getAttribute('role')).toBe('list')
    expect(list.querySelector('li')!.className).not.toContain('bg-card')
    expect(list.querySelector('li p')!.textContent).toBe('Unidad 1')
    // El estado (insignia) va aparte de los metadatos y cada valor conserva su encabezado accesible.
    expect(within(list).getByText('Estado').className).toContain('sr-only')
    expect(within(list).getByText('Norte')).toBeTruthy()
  })

  it('sin density mantiene las tarjetas (retrocompatible)', () => {
    const { container } = render(<TableView block={{ columns: cols, rows }} />)
    expect(narrow(container).getAttribute('data-density')).toBe('comfortable')
    expect(narrow(container).querySelector('li')!.className).toContain('bg-card')
  })
})

describe('GenUI con el esquema del kernel', () => {
  it('acepta y pinta variant/tones/labels/max_height', () => {
    const { container } = render(<GenUI spec={{ version: 'genui/v2', blocks: [{ type: 'table', max_height: 'sm', density: 'compact', columns: [{ key: 'a', label: 'A' }, { key: 's', label: 'S', variant: 'badge', tones: { ok: 'success' }, labels: { ok: 'Listo' } }], rows: [{ a: 'x', s: 'ok' }] }] }} />)
    expect(within(wide(container)).getByText('Listo')).toBeTruthy()
    expect(wide(container).style.maxHeight).toBe('16rem')
  })

  it('rechaza tones sin variant badge/icon_text', () => {
    const { container } = render(<GenUI spec={{ version: 'genui/v2', blocks: [{ type: 'table', columns: [{ key: 's', label: 'S', tones: { ok: 'success' } }] }] }} />)
    expect(container.querySelector('[data-genui-table]')).toBeNull()
  })
})

describe('v1 y v2 sin propiedades nuevas', () => {
  it('v1 sigue pintando su tabla', () => {
    const { container } = render(<GenerativeUI spec={{ version: 'genui/v1', blocks: [{ type: 'table', columns: [{ key: 'a', label: 'A' }], rows: [{ a: 'uno' }, { a: null }] }] }} />)
    expect(within(wide(container)).getByText('uno')).toBeTruthy()
    expect(within(wide(container)).getByText('—')).toBeTruthy()
  })

  it('el bloque table de v2 (via GenUI) conserva el pasaje v1', () => {
    const { container } = render(<GenUI spec={{ version: 'genui/v1', blocks: [{ type: 'table', title: 'T', columns: [{ key: 'a', label: 'A' }], rows: [{ a: 'x' }] }] }} />)
    expect(within(wide(container)).getByText('x')).toBeTruthy()
    expect(wide(container).getAttribute('aria-label')).toBe('T')
  })
})
