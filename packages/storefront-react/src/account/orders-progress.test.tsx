// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import axe from 'axe-core'
import type { Order, OrderProgress as Progress } from '@asteby/storefront'
import { NextActionBar, OrderProgress, OrderStatusBadge, accountMessages, enumText } from './index.js'

afterEach(cleanup)
const AXE = { rules: { 'color-contrast': { enabled: false } } }
const money = { amount: '10.00', currency_code: 'MXN' }
const order = (o: Partial<Order> = {}): Order => ({ id: 'o1', number: '1', status: 'paid', created_at: '2026-08-01T10:00:00Z', total: money, lines: [], ...o })
const progress: Progress = {
  stage: 'in_transit',
  steps: [
    { key: 'paid', state: 'done', at: '2026-08-12T12:00:00Z' },
    { key: 'preparing', state: 'done' },
    { key: 'shipped', state: 'done' },
    { key: 'in_transit', state: 'current' },
    { key: 'delivered', state: 'pending' },
  ],
}

describe('<OrderProgress />', () => {
  it('is an ordered list with the current step marked and every state written out', () => {
    const { container } = render(<OrderProgress progress={progress} timeZone="UTC" />)
    const ol = container.querySelector('ol')!
    expect(ol.getAttribute('aria-label')).toBe('Progreso del pedido')
    const steps = [...container.querySelectorAll('[data-sf-step]')]
    expect(steps.map((s) => s.getAttribute('data-sf-step-state'))).toEqual(['done', 'done', 'done', 'current', 'pending'])
    expect(steps.filter((s) => s.getAttribute('aria-current') === 'step')).toHaveLength(1)
    expect(steps[3]!.textContent).toContain('En camino')
    expect(steps[3]!.textContent).toContain('paso actual')
    expect(steps[4]!.textContent).toContain('pendiente')
    expect(container.querySelector('time')!.getAttribute('datetime')).toBe('2026-08-12T12:00:00Z')
  })

  it('writes the problem out and marks the step', () => {
    const p: Progress = { stage: 'shipped', problem: { code: 'delivery_exception' }, steps: [{ key: 'paid', state: 'done' }, { key: 'shipped', state: 'problem' }] }
    const { container } = render(<OrderProgress progress={p} />)
    expect(container.querySelector('[data-sf-progress-problem=delivery_exception]')!.textContent).toContain('problema con la entrega')
    expect(container.querySelector('[data-sf-step-state=problem]')!.getAttribute('aria-current')).toBe('step')
  })

  it('derives the progress from an older order and renders the pickup variant', () => {
    const { container } = render(<OrderProgress order={order({ status: 'ready_for_pickup', delivery_method: 'pickup' })} />)
    expect([...container.querySelectorAll('[data-sf-step]')].map((s) => s.getAttribute('data-sf-step'))).toEqual(['paid', 'preparing', 'ready_for_pickup', 'delivered'])
  })

  it('has a compact "step n of m" variant', () => {
    const { container } = render(<OrderProgress progress={progress} variant="compact" />)
    expect(container.textContent).toBe('Paso 4 de 5: En camino')
    expect(container.querySelector('ol')).toBeNull()
  })

  it('says it plainly when the order is cancelled or refunded', () => {
    expect(render(<OrderProgress progress={{ stage: 'cancelled', steps: [] }} />).container.textContent).toBe('Este pedido fue cancelado.')
    cleanup()
    expect(render(<OrderProgress order={order({ status: 'refunded' })} />).container.textContent).toBe('Este pedido fue reembolsado.')
  })

  it('never prints a code it does not know', () => {
    const odd = { stage: 'teleporting', problem: { code: 'gremlins' }, steps: [{ key: 'warp', state: 'levitating' }, null as never] } as unknown as Progress
    const { container } = render(<OrderProgress progress={odd} />)
    expect(container.textContent).not.toMatch(/teleporting|gremlins|warp|levitating/)
    expect(container.textContent).toContain('Siguiente paso')
    expect(container.textContent).toContain('Tu pedido tiene una incidencia')
    expect(container.querySelector('[data-sf-step-state=pending]')).toBeTruthy()
    const badge = render(<OrderStatusBadge progress={odd} />).container
    expect(badge.textContent).toContain('En proceso')
    expect(badge.querySelector('[data-sf-tone]')!.getAttribute('data-sf-tone')).toBe('problem')
  })

  it('speaks English and takes message overrides', () => {
    expect(render(<OrderProgress progress={progress} locale="en" />).container.textContent).toContain('On its way')
    cleanup()
    expect(render(<OrderProgress progress={progress} messages={{ 'step.in_transit': 'Rumbo a ti' }} />).container.textContent).toContain('Rumbo a ti')
  })

  it('has no accessibility violations', async () => {
    const r = render(
      <main>
        <OrderProgress progress={progress} />
        <OrderProgress progress={{ ...progress, problem: { code: 'lost' } }} />
        <OrderProgress progress={progress} variant="compact" />
      </main>,
    )
    expect((await axe.run(r.container, AXE)).violations).toEqual([])
  })
})

describe('<OrderStatusBadge />', () => {
  it('gives each stage a tone', () => {
    const tone = (stage: string) => render(<OrderStatusBadge progress={{ stage, steps: [] }} />).container.querySelector('[data-sf-tone]')!.getAttribute('data-sf-tone')
    expect([tone('delivered'), tone('in_transit'), tone('cancelled'), tone('who_knows')]).toEqual(['done', 'current', 'muted', 'muted'])
  })
})

describe('<NextActionBar />', () => {
  it('links to the https tracking page in a new tab and says so', () => {
    const { container } = render(<NextActionBar action={{ kind: 'track', href: 'https://rastreo.example.com/1' }} />)
    const a = container.querySelector('a')!
    expect(a.getAttribute('href')).toBe('https://rastreo.example.com/1')
    expect(a.getAttribute('rel')).toBe('noopener noreferrer')
    expect(a.getAttribute('target')).toBe('_blank')
    expect(a.textContent).toContain('Rastrear envío')
    expect(a.textContent).toContain('pestaña nueva')
  })

  it('drops a link that is not https', () => {
    for (const href of ['javascript:alert(1)', 'http://x.example.com', 'data:text/html,x', '//x.example.com']) {
      expect(render(<NextActionBar action={{ kind: 'track', href }} />).container.innerHTML).toBe('')
      cleanup()
    }
  })

  it('goes where the store says, or fires its handler, or renders nothing', () => {
    const a = render(<NextActionBar action={{ kind: 'download_invoice', ref: 'inv_1' }} hrefFor={(x) => `/facturas/${x.ref}.pdf`} />).container.querySelector('a')!
    expect(a.getAttribute('href')).toBe('/facturas/inv_1.pdf')
    expect(a.getAttribute('target')).toBeNull()
    cleanup()
    const onAction = vi.fn()
    render(<NextActionBar action={{ kind: 'pay' }} onAction={onAction} />)
    fireEvent.click(screen.getByRole('button', { name: 'Pagar ahora' }))
    expect(onAction).toHaveBeenCalledWith({ kind: 'pay' }, expect.anything())
    cleanup()
    expect(render(<NextActionBar action={{ kind: 'pay' }} />).container.innerHTML).toBe('')
    expect(render(<NextActionBar action={{ kind: 'none' }} />).container.innerHTML).toBe('')
  })

  it('derives the action from an older order and labels an unknown kind safely', () => {
    expect(render(<NextActionBar order={order({ status: 'pending_payment' })} onAction={() => {}} />).container.textContent).toBe('Pagar ahora')
    cleanup()
    const c = render(<NextActionBar action={{ kind: 'future_kind' }} onAction={() => {}} />).container
    expect(c.textContent).toBe('Ver detalle')
    expect(c.querySelector('[data-sf-action]')!.getAttribute('data-sf-action')).toBe('future_kind')
  })
})

describe('messages', () => {
  it('falls back to the unknown text for any value, including prototype keys', () => {
    const m = accountMessages('es')
    for (const v of ['nope', '__proto__', 'constructor', 'toString', 5, null, undefined]) expect(enumText(m, 'stage', v)).toBe('En proceso')
  })
})
