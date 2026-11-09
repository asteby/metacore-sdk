// @vitest-environment happy-dom
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import axe from 'axe-core'
import { renderToString } from 'react-dom/server'
import type { Order } from '@asteby/storefront'
import { afterEach, describe, expect, it } from 'vitest'
import { ReturnRequestForm } from './index.js'

afterEach(cleanup)
const AXE = { rules: { 'color-contrast': { enabled: false } } }
const money = { amount: '10.00', currency_code: 'MXN' }
const order = (over: Partial<Order> = {}): Order => ({
  id: 'ord_1',
  number: '1001',
  status: 'delivered',
  created_at: '2026-08-20T10:00:00Z',
  total: money,
  lines: [
    { title: 'Balata', variant_title: null, sku: 'BC-1', quantity: 3, unit: money, total: money, image: null },
    { title: 'Disco', variant_title: 'Delantero', sku: 'DS-2', quantity: 1, unit: money, total: money, image: null },
    { title: 'Sin SKU', variant_title: null, sku: null, quantity: 1, unit: money, total: money, image: null },
  ],
  progress: { stage: 'delivered', steps: [{ key: 'delivered', state: 'done', at: '2026-09-01T12:00:00Z' }] },
  ...over,
})

describe('<ReturnRequestForm />', () => {
  it('is a plain POST form with named fields and a hidden intent (works without JS)', () => {
    const html = renderToString(<ReturnRequestForm order={order()} locale="es-MX" />)
    expect(html).toContain('method="post"')
    expect(html).toContain('name="intent" value="request-return"')
    expect(html).toContain('name="order_id" value="ord_1"')
    expect(html).toContain('name="lines.0.sku" value="BC-1"')
    expect(html).toContain('name="lines.0.selected"')
    expect(html).toContain('name="lines.1.quantity"')
    expect(html).not.toContain('lines.2')
    expect(html).toContain('name="reason"')
    expect(html).toContain('name="notes"')
    expect(html).toContain('maxLength="500"')
    expect(html).not.toContain('<script')
    expect(html).not.toContain('style=')
  })

  it('shows a checkbox + quantity per returnable line, the four reasons and the notes', () => {
    const { container } = render(<ReturnRequestForm order={order()} locale="es-MX" />)
    expect(container.querySelectorAll('[data-sf-return-line]')).toHaveLength(2)
    const qty = screen.getByLabelText('Cantidad de Balata') as HTMLInputElement
    expect([qty.min, qty.max, qty.step, qty.type]).toEqual(['1', '3', '1', 'number'])
    expect(screen.getByLabelText('Devolver Disco (Delantero)')).toBeTruthy()
    const select = screen.getByLabelText('Motivo') as HTMLSelectElement
    expect([...select.options].map((o) => o.value)).toEqual(['defective', 'not_wanted', 'wrong_item', 'warranty'])
    expect(select.value).toBe('not_wanted')
    const notes = screen.getByLabelText('Notas') as HTMLTextAreaElement
    expect(notes.maxLength).toBe(500)
    expect(screen.getByRole('button', { name: 'Solicitar devolución' })).toBeTruthy()
  })

  it('speaks English', () => {
    render(<ReturnRequestForm order={order()} locale="en-US" />)
    expect(screen.getByLabelText('Reason')).toBeTruthy()
    expect(screen.getByLabelText('Notes')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Request return' })).toBeTruthy()
  })

  it('counts the notes when asked', async () => {
    const { container } = render(<ReturnRequestForm order={order()} locale="en-US" showNotesCount />)
    expect(container.querySelector('[data-sf-return-count]')!.textContent).toBe('0 of 500')
    await userEvent.type(screen.getByLabelText('Notes'), 'hola')
    expect(container.querySelector('[data-sf-return-count]')!.textContent).toBe('4 of 500')
  })

  it('shows why instead of the form when the order cannot be returned', () => {
    const { container } = render(<ReturnRequestForm order={order({ status: 'shipped', progress: { stage: 'in_transit', steps: [] } })} locale="es-MX" />)
    expect(container.querySelector('form')).toBeNull()
    expect(container.querySelector('[data-sf-return-reason]')!.getAttribute('data-sf-return-reason')).toBe('not_delivered')
    expect(screen.getByText(/cuando el pedido sea entregado/)).toBeTruthy()
  })

  it('shows the deadline from the store policy, and only warranty once the return window is over', () => {
    const { container } = render(<ReturnRequestForm order={order()} locale="en-US" timeZone="UTC" now={Date.parse('2026-10-15T12:00:00Z')} eligibility={{ returnsDays: 30, warrantyDays: 365 }} />)
    expect([...(screen.getByLabelText('Reason') as HTMLSelectElement).options].map((o) => o.value)).toEqual(['warranty'])
    expect(container.querySelector('[data-sf-return-deadline]')!.textContent).toBe('You can request it until September 1, 2027.')
  })

  it('has no deadline text when the order carries no delivery date', () => {
    const { container } = render(<ReturnRequestForm order={order({ progress: undefined, status: 'delivered' })} eligibility={{ returnsDays: 30 }} />)
    expect(container.querySelector('[data-sf-return-deadline]')).toBeNull()
    expect(container.querySelector('form')).not.toBeNull()
  })

  it('shows field errors linked to their controls, and keeps what the buyer typed', () => {
    const { container } = render(
      <ReturnRequestForm
        order={order()}
        locale="es-MX"
        data={{ ok: false, error: { code: 'validation' }, fieldErrors: { 'lines.0': 'invalid_quantity', notes: 'notes_too_long' }, values: { lines: { 'BC-1': 9 }, reason: 'warranty', notes: 'texto largo' } }}
      />,
    )
    expect(screen.getByRole('alert').textContent).toBe('Revisa los datos marcados.')
    const qty = screen.getByLabelText('Cantidad de Balata') as HTMLInputElement
    expect(qty.value).toBe('9')
    expect(qty.getAttribute('aria-invalid')).toBe('true')
    expect(container.querySelector(`#${CSS.escape(qty.getAttribute('aria-describedby')!)}`)!.textContent).toBe('Indica una cantidad válida (entero entre 1 y 3).')
    expect((screen.getByLabelText('Devolver Balata') as HTMLInputElement).checked).toBe(true)
    expect((screen.getByLabelText('Devolver Disco (Delantero)') as HTMLInputElement).checked).toBe(false)
    expect((screen.getByLabelText('Motivo') as HTMLSelectElement).value).toBe('warranty')
    const notes = screen.getByLabelText('Notas') as HTMLTextAreaElement
    expect(notes.value).toBe('texto largo')
    expect(notes.getAttribute('aria-invalid')).toBe('true')
    expect(notes.getAttribute('aria-describedby')).toContain('notes-err')
  })

  it('confirms when the request went through', () => {
    const { container } = render(<ReturnRequestForm order={order()} locale="en-US" data={{ ok: true, intent: 'request-return', orderId: 'ord_1', request: { id: 'r', order_id: 'ord_1', status: 'requested' } }} />)
    expect(screen.getByRole('status').textContent).toBe('We received your return request. We will email you.')
    expect(container.querySelector('form')).toBeNull()
  })

  it('takes classNames on every slot and locks the button while pending', () => {
    const { container } = render(<ReturnRequestForm order={order()} pending classNames={{ root: 'r', form: 'f', line: 'l', submit: 's', textarea: 't', select: 'sel' }} />)
    for (const c of ['r', 'f', 'l', 's', 't', 'sel']) expect(container.querySelector(`.${c}`), c).not.toBeNull()
    expect((container.querySelector('.s') as HTMLButtonElement).disabled).toBe(true)
  })

  it('has no accessibility violations (form, errors and ineligible)', async () => {
    const withErrors = render(<ReturnRequestForm order={order()} data={{ ok: false, error: { code: 'validation' }, fieldErrors: { lines: 'lines_required', reason: 'invalid_reason' } }} showNotesCount />)
    expect((await axe.run(withErrors.container, AXE)).violations).toEqual([])
    cleanup()
    const blocked = render(<ReturnRequestForm order={order({ status: 'cancelled', progress: undefined })} />)
    expect((await axe.run(blocked.container, AXE)).violations).toEqual([])
  })
})
