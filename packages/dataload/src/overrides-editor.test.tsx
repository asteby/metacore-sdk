// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react'
import { OverridesEditor } from './overrides-editor'
import { profile } from './fixtures'
import { fakeApi, wrap } from './test-utils'

afterEach(cleanup)

const source = { format: 'csv' as const, name: 'a.csv', content: 'SKU\n1' }

describe('OverridesEditor', () => {
  it('edits ignore, rename, drop, defaults and cleaning and emits compact overrides', () => {
    const onChange = vi.fn()
    wrap(<OverridesEditor profile={profile} value={{ valuesAdd: { price: { gratis: '0' } } }} onChange={onChange} />)
    const table = screen.getByRole('table', { name: 'Campos del perfil' })
    expect(within(table).getAllByRole('rowheader').map((h) => h.textContent)).toEqual(['skuidentidad', 'name', 'price', 'images'])
    // The identity cannot be dropped.
    expect((screen.getByLabelText('Quitar el campo sku') as HTMLInputElement).disabled).toBe(true)

    fireEvent.change(screen.getByLabelText('Columnas a ignorar'), { target: { value: 'Meta: _wc*\n\ntmp' } })
    fireEvent.change(screen.getByLabelText('Encabezados adicionales de name (separados por coma)'), { target: { value: 'Título, Title' } })
    fireEvent.click(screen.getByLabelText('Quitar el campo images'))
    fireEvent.click(screen.getByRole('button', { name: /Agregar valor/ }))
    fireEvent.change(screen.getByLabelText('Campo destino'), { target: { value: 'price' } })
    fireEvent.change(screen.getByLabelText('Valor'), { target: { value: '0' } })
    fireEvent.click(screen.getByLabelText('Reemplazar las reglas globales del perfil'))
    fireEvent.click(screen.getByLabelText(/Quitar HTML/))
    fireEvent.change(screen.getByLabelText(/Quitar líneas que coincidan/), { target: { value: '(?i)^aviso' } })

    expect(onChange).toHaveBeenLastCalledWith({
      ignoreHeaders: ['Meta: _wc*', 'tmp'],
      rename: { name: ['Título', 'Title'] },
      drop: ['images'],
      defaults: { price: 0 },
      clean: ['trim', 'strip_html', 'drop_lines:(?i)^aviso'],
      valuesAdd: { price: { gratis: '0' } },
    })
    expect(screen.getByText('Se conservan sin cambios 1 ajustes avanzados (campos o traducciones de valores).')).toBeTruthy()
    expect(screen.getByText('Resultado: 3 campos, 2 patrones ignorados, 1 valores por omisión.')).toBeTruthy()
  })

  it('validates against the kernel rules and blocks save and preview', () => {
    const api = fakeApi()
    wrap(<OverridesEditor api={api} profile={profile} source={source} />)
    fireEvent.change(screen.getByLabelText('Limpieza adicional de name (reglas separadas por coma)'), { target: { value: 'upper, mayus' } })
    expect(screen.getByText('Limpieza adicional: regla de limpieza desconocida «mayus».')).toBeTruthy()
    expect((screen.getByRole('button', { name: /Guardar ajustes/ }) as HTMLButtonElement).disabled).toBe(true)
    expect((screen.getByRole('button', { name: /Vista previa del plan/ }) as HTMLButtonElement).disabled).toBe(true)
    fireEvent.change(screen.getByLabelText('Limpieza adicional de name (reglas separadas por coma)'), { target: { value: 'upper' } })
    expect(screen.getByText('Los ajustes son válidos para este perfil.')).toBeTruthy()
  })

  it('previews the plan with the edited overrides and saves them with the profile', async () => {
    const api = fakeApi()
    const notify = { success: vi.fn(), error: vi.fn() }
    wrap(<OverridesEditor api={api} profile={profile} source={source} notify={notify} />)
    fireEvent.change(screen.getByLabelText('Columnas a ignorar'), { target: { value: 'tmp*' } })
    fireEvent.click(screen.getByRole('button', { name: /Vista previa del plan/ }))
    await waitFor(() => expect(api.dryRun).toHaveBeenCalledWith({ profile: 'catalogo', overrides: { ignoreHeaders: ['tmp*'] }, source }))
    await screen.findByText('SKU-2')
    fireEvent.click(screen.getByRole('button', { name: /Guardar ajustes/ }))
    await waitFor(() => expect(api.saveProfile).toHaveBeenCalledWith({ profile, overrides: { ignoreHeaders: ['tmp*'] } }))
    expect(notify.success).toHaveBeenCalledWith('Ajustes guardados.')
  })

  it('is read-only without editOverrides', () => {
    const api = fakeApi()
    wrap(<OverridesEditor api={api} profile={profile} capabilities={{ launch: true }} />)
    expect(screen.getByText('Puedes ver los ajustes, pero no tienes permiso para cambiarlos.')).toBeTruthy()
    expect((screen.getByLabelText('Columnas a ignorar') as HTMLTextAreaElement).disabled).toBe(true)
    expect(screen.queryByRole('button', { name: /Guardar ajustes/ })).toBeNull()
  })
})
