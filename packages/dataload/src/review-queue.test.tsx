// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react'
import { ReviewQueue } from './review-queue'
import { review } from './fixtures'
import type { ReviewEntry } from './types'

const pageOf = (items: ReviewEntry[]) => ({ items, counts: {} })
import { fakeApi, wrap } from './test-utils'

afterEach(cleanup)

const two = [review(), review({ key: 'SKU-6', row: 6, hash: 'h6', outcome: 'create', record: { sku: 'SKU-6', name: 'Nuevo' }, items: [{ code: 'ambiguous', severity: 'revisar' }] })]

describe('ReviewQueue', () => {
  it('lists the held rows in a table with reason, outcome and state', async () => {
    const api = fakeApi({ reviews: vi.fn(async (f) => pageOf(f?.state === 'approved' ? [] : two)) })
    wrap(<ReviewQueue api={api} entity='product' />)
    const table = await screen.findByRole('table', { name: 'Filas en revisión' })
    const headers = within(table).getAllByRole('columnheader').map((h) => h.textContent)
    expect(headers).toEqual(expect.arrayContaining(['Fila', 'Identidad', 'Motivo', 'Al aplicar', 'Estado', 'Acciones']))
    expect(within(table).getByText('value_suspect')).toBeTruthy()
    expect(within(table).getByText('Se actualizaría')).toBeTruthy()
    expect(within(table).getByText('Se crearía')).toBeTruthy()
    expect(within(table).getAllByText('Pendiente')).toHaveLength(2)
    expect(api.reviews).toHaveBeenCalledWith({ limit: 500, entity: 'product', state: 'pending' })
  })

  it('shows the field diff from the stored plan of the run', async () => {
    const api = fakeApi({ reviews: vi.fn(async (f) => pageOf(f?.state === 'approved' ? [] : two)) })
    wrap(<ReviewQueue api={api} />)
    const btn = await screen.findByRole('button', { name: 'Ver detalle de la fila 5' })
    expect(btn.getAttribute('aria-expanded')).toBe('false')
    fireEvent.click(btn)
    await screen.findByText('100')
    // The plan is paged on the server: exactly the held row is asked for.
    expect(api.runPlan).toHaveBeenCalledWith('r1', { offset: 4, limit: 1 })
    expect(screen.getByText('valor fuera de rango')).toBeTruthy()
    expect(btn.getAttribute('aria-expanded')).toBe('true')
  })

  it('approves in batch with a comment, then applies the approved rows', async () => {
    const notify = { success: vi.fn(), error: vi.fn() }
    let approved = false
    const api = fakeApi({ reviews: vi.fn(async (f) => pageOf(f?.state === 'approved' ? (approved ? two.map((e) => ({ ...e, state: 'approved' as const })) : []) : two)) })
    const decide = api.decideReviews as ReturnType<typeof vi.fn>
    decide.mockImplementation(async (ds: never[]) => {
      approved = true
      return ds
    })
    wrap(<ReviewQueue api={api} entity='product' notify={notify} />)
    fireEvent.click(await screen.findByLabelText('Seleccionar todas las abiertas de esta página'))
    expect(screen.getByText('2 seleccionadas')).toBeTruthy()
    fireEvent.change(screen.getByLabelText('Comentario (opcional)'), { target: { value: 'revisado con proveedor' } })
    fireEvent.click(screen.getByRole('button', { name: /Aprobar seleccionadas/ }))
    await waitFor(() => expect(decide).toHaveBeenCalledTimes(1))
    expect(decide.mock.calls[0]?.[0]).toEqual([
      { entity: 'product', key: 'SKU-5', hash: 'h5', approve: true, note: 'revisado con proveedor' },
      { entity: 'product', key: 'SKU-6', hash: 'h6', approve: true, note: 'revisado con proveedor' },
    ])
    await waitFor(() => expect(notify.success).toHaveBeenCalledWith('2 decisiones registradas.'))
    expect(screen.getByRole('status', { hidden: true }).textContent).toContain('2 decisiones registradas.')

    const apply = await screen.findByRole('button', { name: /Aplicar aprobadas \(2\)/ })
    fireEvent.click(apply)
    await waitFor(() => expect(api.applyApproved).toHaveBeenCalledWith('product'))
    await waitFor(() => expect(notify.success).toHaveBeenCalledWith('Aprobadas aplicadas: 0 nuevas, 1 actualizadas, 0 sin cambios.'))
  })

  it('rejects one row and explains a stale decision', async () => {
    const api = fakeApi({
      reviews: vi.fn(async (f) => pageOf(f?.state === 'approved' ? [] : two)),
      decideReviews: vi.fn(async () => {
        throw { response: { status: 409, data: { message: 'cambió' } } }
      }),
    })
    wrap(<ReviewQueue api={api} />)
    fireEvent.click(await screen.findByRole('button', { name: 'Rechazar fila 6' }))
    await screen.findByText(/Una fila cambió desde que se revisó/, { selector: '[role=alert]' })
    expect(api.decideReviews).toHaveBeenCalledWith([{ entity: 'product', key: 'SKU-6', hash: 'h6', approve: false }])
    // The queue is refetched after a failed decision too.
    await waitFor(() => expect((api.reviews as ReturnType<typeof vi.fn>).mock.calls.length).toBeGreaterThan(2))
  })

  it('is read-only without the approve capability', async () => {
    const api = fakeApi({ reviews: vi.fn(async () => pageOf(two)) })
    wrap(<ReviewQueue api={api} capabilities={{ launch: true }} />)
    await screen.findByRole('table')
    expect(screen.getByText('Puedes ver la cola, pero no tienes permiso para decidir.')).toBeTruthy()
    expect(screen.queryByRole('checkbox')).toBeNull()
    expect(screen.queryByRole('button', { name: /Aprobar/ })).toBeNull()
    expect(screen.queryByLabelText('Comentario (opcional)')).toBeNull()
  })

  it('hides itself when there is nothing to decide or the endpoints are not mounted', async () => {
    const api = fakeApi()
    const { container } = wrap(<ReviewQueue api={api} hideWhenEmpty />)
    await waitFor(() => expect(api.reviews).toHaveBeenCalled())
    expect(container.textContent).toBe('')
    cleanup()
    const missing = fakeApi({ reviews: vi.fn(async () => { throw { response: { status: 404 } } }) })
    const r = wrap(<ReviewQueue api={missing} hideWhenEmpty />)
    await waitFor(() => expect(missing.reviews).toHaveBeenCalled())
    expect(r.container.textContent).toBe('')
  })
})
