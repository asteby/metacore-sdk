// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import axe from 'axe-core'
import { renderToString } from 'react-dom/server'
import { useState } from 'react'
import type { CartPromotions, CartRecommendation, Money, PromotionAnnouncement } from '@asteby/storefront'
import { CartProgressBars, CrossSellModal, OrderNote, PromoPopup, memorySeenStore, type PromoPopupEvent } from './index.js'

const mxn = (amount: string): Money => ({ amount, currency_code: 'MXN' })

async function noViolations(container: HTMLElement) {
  const r = await axe.run(container, { rules: { 'color-contrast': { enabled: false }, region: { enabled: false } } })
  expect(r.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.html).join(' | ')}`)).toEqual([])
}

const announcement = (patch: Partial<PromotionAnnouncement> = {}): PromotionAnnouncement => ({
  id: 'camp1',
  version: 1,
  placement: 'entry_popup',
  headline: 'Desbloquea tu descuento en el carrito de compras',
  cta_label: 'Ver productos',
  cta_url: '/colecciones/todo',
  tiers: [
    { threshold: mxn('2700.00'), reward: { kind: 'percent', percent: '10' } },
    { threshold: mxn('2300.00'), reward: { kind: 'percent', percent: '5' } },
  ],
  free_shipping_threshold: mxn('0.00'),
  legal_text: 'Los descuentos se aplican automáticamente al alcanzar el monto correspondiente.',
  combines_with_codes: true,
  starts_at: null,
  ends_at: '2026-10-31T23:59:59Z',
  frequency: 'days',
  ...patch,
})

beforeEach(() => {
  try {
    sessionStorage.clear()
  } catch {
    /* */
  }
})
afterEach(() => cleanup())

// Lets timers due within `ms` fire AND flushes the renders they trigger. Only for asserting that
// something does NOT happen; assertions that something happens use waitFor.
const elapse = (ms: number) => act(async () => { await new Promise((r) => setTimeout(r, ms)) })

const NOW = Date.parse('2026-10-25T12:00:00Z')
const UA = 'Mozilla/5.0 Chrome/120 Safari/537.36'
const base = { userAgent: UA, webdriver: false, now: () => NOW, trigger: { delayMs: 20, pageviews: false as const, scrollPercent: false as const } }

describe('PromoPopup mechanism', () => {
  it('renders nothing on the server and on the first client render (hydration safe)', () => {
    expect(renderToString(<PromoPopup announcement={announcement()} {...base} store={memorySeenStore()} />)).toBe('')
    const { container } = render(<PromoPopup announcement={announcement()} {...base} store={memorySeenStore()} pathname="/" />)
    expect(container.querySelector('dialog')).toBeNull()
  })

  it('opens after the delay with content from data, focus on the title, labelled, 44px close', async () => {
    const events: PromoPopupEvent[] = []
    const { container } = render(<PromoPopup announcement={announcement()} {...base} store={memorySeenStore()} pathname="/" onEvent={(e) => events.push(e)} />)
    await waitFor(() => expect(container.querySelector('dialog[open]')).not.toBeNull())
    const dlg = container.querySelector('dialog')!
    const title = screen.getByRole('heading', { name: /Desbloquea tu descuento/ })
    expect(dlg.getAttribute('aria-labelledby')).toBe(title.id)
    expect(document.activeElement).toBe(title)
    const close = screen.getByRole('button', { name: 'Cerrar' })
    expect(close.style.minWidth).toBe('44px')
    expect(close.style.minHeight).toBe('44px')
    const tiers = container.querySelector('[data-sf-promo-tiers]')!.textContent!.replace(/ /g, ' ')
    expect(tiers).toContain('10 % comprando $2,700')
    expect(tiers).toContain('5 % comprando $2,300')
    expect(tiers).toContain('Envíos gratis sin mínimo de compra')
    expect(container.textContent).toContain('Por tiempo limitado')
    expect(container.textContent).toMatch(/Válido hasta el 31 de octubre de 2026/)
    expect(container.querySelector('[data-sf-promo-cta]')?.getAttribute('href')).toBe('/colecciones/todo')
    expect(events).toEqual([{ type: 'view', id: 'camp1', version: 1, via: 'delay' }])
    await noViolations(container)
  })

  it.each([
    ['Esc', (d: HTMLElement) => fireEvent(d, new Event('cancel', { cancelable: true })), 'esc'],
    ['X', () => fireEvent.click(screen.getByRole('button', { name: 'Cerrar' })), 'x'],
  ])('closes with %s and reports how', async (_n, act_, how) => {
    const events: PromoPopupEvent[] = []
    const { container } = render(<PromoPopup announcement={announcement()} {...base} store={memorySeenStore()} pathname="/" onEvent={(e) => events.push(e)} />)
    await waitFor(() => expect(container.querySelector('dialog[open]')).not.toBeNull())
    act_(container.querySelector('dialog')!)
    await waitFor(() => expect(container.querySelector('dialog')).toBeNull())
    expect(events.at(-1)).toEqual({ type: 'close', id: 'camp1', how })
  })

  it('backdrop click closes; clicking inside does not', async () => {
    const { container } = render(<PromoPopup announcement={announcement()} {...base} store={memorySeenStore()} pathname="/" />)
    await waitFor(() => expect(container.querySelector('dialog[open]')).not.toBeNull())
    fireEvent.click(container.querySelector('[data-sf-promo-body]')!)
    expect(container.querySelector('dialog')).not.toBeNull()
    fireEvent.click(container.querySelector('dialog')!)
    await waitFor(() => expect(container.querySelector('dialog')).toBeNull())
  })

  it('returns focus to the element that had it', async () => {
    const { container } = render(
      <>
        <button data-testid="opener">menu</button>
        <PromoPopup announcement={announcement()} {...base} store={memorySeenStore()} pathname="/" />
      </>,
    )
    screen.getByTestId('opener').focus()
    await waitFor(() => expect(container.querySelector('dialog[open]')).not.toBeNull())
    fireEvent.click(screen.getByRole('button', { name: 'Cerrar' }))
    await waitFor(() => expect(document.activeElement).toBe(screen.getByTestId('opener')))
  })

  describe('frequency', () => {
    const mount = (store: ReturnType<typeof memorySeenStore>, ann = announcement(), extra: Record<string, unknown> = {}, now = NOW) => {
      const r = render(<PromoPopup announcement={ann} {...base} now={() => now} store={store} pathname="/" {...extra} />)
      return r
    }
    it.each([
      ['days: second visit 2 days later', { frequency: 'days' as const }, 2 * 86_400_000, false],
      ['days: 8 days later', { frequency: 'days' as const }, 8 * 86_400_000, true],
      ['session: later in the same session', { frequency: 'session' as const }, 3_600_000, false],
      ['campaign: months later', { frequency: 'campaign' as const }, 90 * 86_400_000, false],
    ])('%s -> shows again: %s', async (_n, ann, delta, again) => {
      const store = memorySeenStore()
      const first = mount(store, announcement({ ...ann, ends_at: null }))
      await waitFor(() => expect(first.container.querySelector('dialog[open]')).not.toBeNull())
      first.unmount()
      const second = mount(store, announcement({ ...ann, ends_at: null }), {}, NOW + delta)
      if (again) {
        // Positive: wait for the condition (timer + render), not a fixed sleep that load can outrun.
        await waitFor(() => expect(second.container.querySelector('dialog[open]')).not.toBeNull())
      } else {
        await elapse(80)
        expect(second.container.querySelector('dialog')).toBeNull()
      }
    })
    it('a new version of the announcement shows again immediately', async () => {
      const store = memorySeenStore()
      const first = mount(store)
      await waitFor(() => expect(first.container.querySelector('dialog[open]')).not.toBeNull())
      first.unmount()
      const second = mount(store, announcement({ version: 2 }))
      await waitFor(() => expect(second.container.querySelector('dialog[open]')).not.toBeNull())
    })
  })

  describe('never shows', () => {
    it.each([
      ['excluded path /carrito', { pathname: '/carrito' }, announcement()],
      ['excluded path with market /mx/pagar/gracias', { pathname: '/mx/pagar/gracias' }, announcement()],
      ['crawler', { userAgent: 'Googlebot/2.1' }, announcement()],
      ['webdriver', { webdriver: true }, announcement()],
      ['campaign ended', { now: () => Date.parse('2026-11-02T00:00:00Z') }, announcement()],
      ['campaign not started', {}, announcement({ starts_at: '2026-12-01T00:00:00Z' })],
      ['no announcement', {}, null],
    ])('%s', async (_n, extra, ann) => {
      const { container } = render(<PromoPopup announcement={ann} {...base} store={memorySeenStore()} pathname="/" {...extra} />)
      await elapse(80)
      expect(container.querySelector('dialog')).toBeNull()
    })
    it('custom excludePaths replace the defaults', async () => {
      const { container } = render(<PromoPopup announcement={announcement()} {...base} store={memorySeenStore()} pathname="/carrito" excludePaths={['/otra']} />)
      await waitFor(() => expect(container.querySelector('dialog[open]')).not.toBeNull())
    })
    it('closes if the buyer navigates into an excluded path', async () => {
      const store = memorySeenStore()
      const { container, rerender } = render(<PromoPopup announcement={announcement()} {...base} store={store} pathname="/" />)
      await waitFor(() => expect(container.querySelector('dialog[open]')).not.toBeNull())
      rerender(<PromoPopup announcement={announcement()} {...base} store={store} pathname="/pagar" />)
      await waitFor(() => expect(container.querySelector('dialog')).toBeNull())
    })
  })

  describe('triggers', () => {
    it('second page view of the session fires without waiting for the delay', async () => {
      sessionStorage.setItem('sf_promo_pv', '1')
      const events: PromoPopupEvent[] = []
      const { container } = render(
        <PromoPopup announcement={announcement()} {...base} trigger={{ delayMs: false, pageviews: 2, scrollPercent: false }} store={memorySeenStore()} pathname="/" onEvent={(e) => events.push(e)} />,
      )
      await waitFor(() => expect(container.querySelector('dialog[open]')).not.toBeNull())
      expect(events[0]).toMatchObject({ via: 'pageviews' })
    })
    it('first page view alone does not fire when only pageviews is enabled', async () => {
      const { container } = render(<PromoPopup announcement={announcement()} {...base} trigger={{ delayMs: false, pageviews: 2, scrollPercent: false }} store={memorySeenStore()} pathname="/" />)
      await elapse(60)
      expect(container.querySelector('dialog')).toBeNull()
    })
    it('scroll depth fires once it passes the threshold', async () => {
      Object.defineProperty(window, 'innerHeight', { value: 800, configurable: true })
      Object.defineProperty(document.documentElement, 'scrollHeight', { value: 2800, configurable: true })
      const events: PromoPopupEvent[] = []
      const { container } = render(
        <PromoPopup announcement={announcement()} {...base} trigger={{ delayMs: false, pageviews: false, scrollPercent: 40 }} store={memorySeenStore()} pathname="/" onEvent={(e) => events.push(e)} />,
      )
      Object.defineProperty(window, 'scrollY', { value: 400, configurable: true }) // 20 %
      fireEvent.scroll(window)
      expect(container.querySelector('dialog')).toBeNull()
      Object.defineProperty(window, 'scrollY', { value: 900, configurable: true }) // 45 %
      fireEvent.scroll(window)
      await waitFor(() => expect(container.querySelector('dialog[open]')).not.toBeNull())
      expect(events[0]).toMatchObject({ via: 'scroll' })
    })
    it('the announcement can carry its own trigger', async () => {
      const { container } = render(
        <PromoPopup announcement={announcement({ trigger: { delay_ms: 10, pageviews: 99, scroll_percent: 99 } })} userAgent={UA} webdriver={false} now={() => NOW} store={memorySeenStore()} pathname="/" />,
      )
      await waitFor(() => expect(container.querySelector('dialog[open]')).not.toBeNull())
    })
  })

  describe('content safety', () => {
    it.each([
      ['//evil.com', false],
      ['https://evil.com', false],
      ['javascript:alert(1)', false],
      ['/colecciones/whey', true],
    ])('CTA url %s rendered: %s', async (url, rendered) => {
      const { container } = render(<PromoPopup announcement={announcement({ cta_url: url })} {...base} store={memorySeenStore()} pathname="/" />)
      await waitFor(() => expect(container.querySelector('dialog[open]')).not.toBeNull())
      expect(container.querySelector('[data-sf-promo-cta]') !== null).toBe(rendered)
    })
    it('no "limited time" text without end date; image has the alt from OPS; CTA click reports and closes; custom renderCta', async () => {
      const events: PromoPopupEvent[] = []
      const { container } = render(
        <PromoPopup
          announcement={announcement({ ends_at: null, image: { url: 'https://cdn.test/a.jpg', alt: 'Proteína' } })}
          {...base}
          store={memorySeenStore()}
          pathname="/"
          onEvent={(e) => events.push(e)}
          renderCta={({ href, label, onClick }) => (
            <button data-testid="cta" data-href={href} onClick={onClick}>
              {label}
            </button>
          )}
        />,
      )
      await waitFor(() => expect(container.querySelector('dialog[open]')).not.toBeNull())
      expect(container.textContent).not.toContain('Por tiempo limitado')
      expect(container.querySelector('img')?.getAttribute('alt')).toBe('Proteína')
      fireEvent.click(screen.getByTestId('cta'))
      expect(events.at(-1)).toEqual({ type: 'cta', id: 'camp1' })
      await waitFor(() => expect(container.querySelector('dialog')).toBeNull())
    })
    it('speaks English', async () => {
      const { container } = render(<PromoPopup announcement={announcement()} {...base} locale="en-US" store={memorySeenStore()} pathname="/" />)
      await waitFor(() => expect(container.querySelector('dialog[open]')).not.toBeNull())
      expect(container.textContent).toContain('Limited time')
      expect(container.textContent).toContain('10% when you spend MX$2,700')
      expect(screen.getByRole('button', { name: 'Close' })).toBeTruthy()
    })
  })
})

const promos = (patch: Partial<CartPromotions> = {}): CartPromotions => ({
  version: 1,
  promotion_id: 'p1',
  title: 'Descuento por monto',
  basis: mxn('749.00'),
  tiers: [
    { id: 't5', threshold: mxn('2300.00'), reward: { kind: 'percent', percent: '5' }, reached: false, percent_of_max: 85 },
    { id: 't10', threshold: mxn('2700.00'), reward: { kind: 'percent', percent: '10' }, reached: false, percent_of_max: 100 },
  ],
  applied: null,
  next_tier: { tier_id: 't5', threshold: mxn('2300.00'), remaining: mxn('1551.00'), reward: { kind: 'percent', percent: '5' }, percent: 32 },
  max_reached: false,
  percent_of_max: 27,
  combines_with_codes: true,
  ends_at: null,
  excluded_line_ids: [],
  suppressed: null,
  free_shipping: { threshold: mxn('1500.00'), basis: mxn('749.00'), remaining: mxn('751.00'), reached: false, percent: 49 },
  ...patch,
})

describe('CartProgressBars', () => {
  it('renders both bars with the server numbers and an accessible progressbar', async () => {
    const { container } = render(<CartProgressBars promotions={promos()} locale="es-MX" />)
    const bars = screen.getAllByRole('progressbar')
    expect(bars).toHaveLength(2)
    expect(bars[0]!.getAttribute('aria-valuenow')).toBe('27')
    expect(bars[0]!.getAttribute('aria-valuetext')).toBe('Añade $1,551 para activar tu descuento automático')
    expect(bars[0]!.getAttribute('aria-label')).toBe('Progreso del descuento automático')
    expect(bars[1]!.getAttribute('aria-valuenow')).toBe('49')
    expect(bars[1]!.getAttribute('aria-valuetext')).toBe('Añade $751 para envío gratis')
    expect((bars[0]!.firstElementChild as HTMLElement).style.width).toBe('27%')
    expect(container.querySelector('[data-sf-promo-milestones]')!.textContent).toContain('5 %')
    await noViolations(container)
  })
  it.each([
    ['shipping reached', promos({ tiers: [], next_tier: null, free_shipping: { threshold: mxn('1500.00'), basis: mxn('1600.00'), remaining: mxn('0.00'), reached: true, percent: 100 } }), 1, '¡Felicidades! Tienes envío gratis'],
    ['no minimum -> text only, no bar', promos({ tiers: [], next_tier: null, free_shipping: { threshold: mxn('0.00'), basis: mxn('10.00'), remaining: mxn('0.00'), reached: true, percent: 100 } }), 0, 'Envío gratis en todo tu pedido'],
  ])('%s', (_n, p, bars, text) => {
    const { container } = render(<CartProgressBars promotions={p} />)
    expect(screen.queryAllByRole('progressbar')).toHaveLength(bars)
    expect(container.textContent).toContain(text)
  })
  it('renders nothing without promotions and updates when the cart changes (aria-live text)', () => {
    const { container, rerender } = render(<CartProgressBars promotions={null} />)
    expect(container.innerHTML).toBe('')
    rerender(<CartProgressBars promotions={promos()} />)
    expect(container.querySelector('[aria-live=polite]')).not.toBeNull()
    rerender(
      <CartProgressBars
        promotions={promos({ applied: { tier_id: 't5', reward: { kind: 'percent', percent: '5' }, amount: mxn('115.00') }, next_tier: { tier_id: 't10', threshold: mxn('2700.00'), remaining: mxn('400.00'), reward: { kind: 'percent', percent: '10' }, percent: 85 }, percent_of_max: 85, free_shipping: null })}
      />,
    )
    expect(container.textContent).toContain('Añade $400 para subir a 10 %')
  })
})

const rec = (id: string, over: Partial<CartRecommendation> = {}): CartRecommendation => ({
  product: { id, handle: id, title: `Producto ${id}`, featured_image: null, options: [], vendor: null },
  variants: [
    { id: `${id}-v1`, title: 'Chocolate', sku: 's1', price: mxn('899.00'), compare_at_price: null, available_for_sale: true, quantity_available: 5, selected_options: [] } as never,
    { id: `${id}-v2`, title: 'Vainilla', sku: 's2', price: mxn('899.00'), compare_at_price: null, available_for_sale: true, quantity_available: 5, selected_options: [] } as never,
  ],
  default_variant_id: `${id}-v1`,
  source: 'curated',
  unlocks: { tier_id: 't5', reward: { kind: 'percent', percent: '5' }, remaining_after: mxn('0.00') },
  ...over,
})

describe('CrossSellModal', () => {
  const props = (over: Partial<Parameters<typeof CrossSellModal>[0]> = {}) => ({
    open: true,
    promotions: promos(),
    recommendations: [rec('a'), rec('b', { unlocks: null })],
    totalSaved: mxn('0.00'),
    onAdd: vi.fn(async () => undefined),
    onContinue: vi.fn(),
    onSkip: vi.fn(),
    locale: 'es-MX',
    ...over,
  })

  it('shows the server numbers, tags the card that unlocks, focuses the title and is accessible', async () => {
    const p = props()
    const { container } = render(<CrossSellModal {...p} />)
    const text = container.textContent!.replace(/ /g, ' ')
    expect(text).toContain('Te faltan $1,551')
    expect(text).toContain('Desbloqueas 5 % de descuento')
    expect(text).toContain('Total ahorrado')
    expect(text).toContain('Pendiente')
    expect(text).toContain('Siguiente recompensa 5 % · $2,300')
    expect(text).toContain('Desbloquea tu 5 %')
    expect(text).toContain('Tu mejor descuento se aplica automáticamente')
    expect(document.activeElement).toBe(screen.getByRole('heading', { name: 'Completa tu compra y desbloquea más' }))
    expect(screen.getByRole('progressbar').getAttribute('aria-valuenow')).toBe('27')
    expect(screen.getAllByLabelText('Sabor')).toHaveLength(2)
    await noViolations(container)
  })

  it('Esc, X, backdrop and "continue without adding" all skip; continue goes to payment', () => {
    const p = props()
    const { container } = render(<CrossSellModal {...p} />)
    fireEvent(container.querySelector('dialog')!, new Event('cancel', { cancelable: true }))
    fireEvent.click(screen.getByRole('button', { name: 'Cerrar' }))
    fireEvent.click(container.querySelector('dialog')!)
    fireEvent.click(screen.getByRole('button', { name: 'Continuar sin agregar' }))
    expect(p.onSkip.mock.calls.map((c) => c[0])).toEqual(['esc', 'x', 'backdrop', 'skip'])
    fireEvent.click(screen.getByRole('button', { name: /Continuar al pago/ }))
    expect(p.onContinue).toHaveBeenCalledTimes(1)
    expect(screen.getAllByRole('button').every((b) => (b as HTMLElement).style.minHeight === '44px' || b.getAttribute('aria-label') === 'Cerrar')).toBe(true)
  })

  it('add uses the chosen flavor, is busy once (double click) and the new cart updates the bar', async () => {
    let release!: () => void
    const gate = new Promise<void>((r) => (release = r))
    const onAdd = vi.fn(async () => void (await gate))
    const p = props({ onAdd })
    const { rerender } = render(<CrossSellModal {...p} />)
    fireEvent.change(screen.getAllByLabelText('Sabor')[0]!, { target: { value: 'a-v2' } })
    const add = screen.getAllByRole('button', { name: /Agregar y avanzar/ })[0]!
    fireEvent.click(add)
    fireEvent.click(add)
    expect(onAdd).toHaveBeenCalledTimes(1)
    expect(onAdd.mock.calls[0]![0]).toMatchObject({ productId: 'a', variantId: 'a-v2' })
    expect(screen.getByRole('button', { name: 'Agregando…' }).getAttribute('aria-busy')).toBe('true')
    await act(async () => release())
    rerender(
      <CrossSellModal
        {...p}
        totalSaved={mxn('115.00')}
        promotions={promos({ applied: { tier_id: 't5', reward: { kind: 'percent', percent: '5' }, amount: mxn('115.00') }, next_tier: { tier_id: 't10', threshold: mxn('2700.00'), remaining: mxn('400.00'), reward: { kind: 'percent', percent: '10' }, percent: 85 }, percent_of_max: 85 })}
      />,
    )
    const text = document.body.textContent!.replace(/ /g, ' ')
    expect(text).toContain('Activo')
    expect(text).toContain('¡Desbloqueaste 5 %!')
    expect(text).toContain('Te faltan $400')
    expect(screen.getByRole('progressbar').getAttribute('aria-valuenow')).toBe('85')
  })

  it.each([
    ['sold out', async () => ({ error: 'sold_out' as const }), 'Se agotó este sabor'],
    ['failed result', async () => ({ ok: false }), 'No pudimos agregarlo'],
    ['throws', async () => { throw new Error('boom') }, 'No pudimos agregarlo'],
  ])('add error (%s) stays on the card and the rest is usable', async (_n, onAdd, msg) => {
    const p = props({ onAdd })
    render(<CrossSellModal {...p} />)
    await act(async () => void fireEvent.click(screen.getAllByRole('button', { name: /Agregar y avanzar/ })[0]!))
    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toContain(msg)
    expect(screen.getByRole('button', { name: /Continuar al pago/ })).toBeTruthy()
    expect(screen.getAllByRole('button', { name: /Agregar y avanzar/ })).toHaveLength(2)
  })

  it('max level: best discount message, no cards, focus-ready continue', () => {
    const p = props({ promotions: promos({ applied: { tier_id: 't10', reward: { kind: 'percent', percent: '10' }, amount: mxn('270.00') }, next_tier: null, max_reached: true, percent_of_max: 100 }), totalSaved: mxn('270.00') })
    const { container } = render(<CrossSellModal {...p} />)
    expect(container.textContent).toContain('Tienes el mejor descuento: 10 %')
    expect(container.querySelector('[data-sf-crosssell-cards]')).toBeNull()
  })

  it('closed renders nothing; a variant removed by the server keeps the selection valid', () => {
    const { container, rerender } = render(<CrossSellModal {...props({ open: false })} />)
    expect(container.innerHTML).toBe('')
    const r = rec('a')
    rerender(<CrossSellModal {...props({ recommendations: [r] })} />)
    fireEvent.change(screen.getByLabelText('Sabor'), { target: { value: 'a-v2' } })
    rerender(<CrossSellModal {...props({ recommendations: [{ ...r, variants: [r.variants[0]!], default_variant_id: 'a-v1' }] })} />)
    expect(screen.queryByLabelText('Sabor')).toBeNull() // single sellable variant: no selector
    expect(screen.getAllByRole('button', { name: /Agregar y avanzar/ })).toHaveLength(1)
  })
})

describe('OrderNote', () => {
  function Harness({ onSave, initial = null as string | null, debounceMs = 30 }: { onSave: (n: string | null) => Promise<void>; initial?: string | null; debounceMs?: number | false }) {
    const [value, setValue] = useState(initial)
    return (
      <OrderNote
        value={value}
        debounceMs={debounceMs}
        onSave={async (n) => {
          await onSave(n)
          setValue(n)
        }}
      />
    )
  }

  it('has a visible label, autosaves after the debounce and announces "Guardada"', async () => {
    const onSave = vi.fn(async () => undefined)
    const { container } = render(<Harness onSave={onSave} />)
    const field = screen.getByLabelText('Añadir nota') as HTMLTextAreaElement
    fireEvent.change(field, { target: { value: '  Sin picante por favor ' } })
    fireEvent.change(field, { target: { value: '  Sin picante por favor' } })
    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1))
    expect(onSave).toHaveBeenCalledWith('Sin picante por favor')
    await waitFor(() => expect(container.querySelector('[data-sf-note-status]')?.textContent).toBe('Guardada'))
    await noViolations(container)
  })

  it('saves on blur without waiting and clears an emptied note with null', async () => {
    const onSave = vi.fn(async () => undefined)
    render(<Harness onSave={onSave} initial="hola" debounceMs={false} />)
    const field = screen.getByLabelText('Añadir nota') as HTMLTextAreaElement
    expect(field.value).toBe('hola')
    fireEvent.change(field, { target: { value: '   ' } })
    expect(onSave).not.toHaveBeenCalled()
    fireEvent.blur(field)
    await waitFor(() => expect(onSave).toHaveBeenCalledWith(null))
  })

  it('does not save when nothing changed; caps at 1000 characters and shows the counter', async () => {
    const onSave = vi.fn(async () => undefined)
    render(<Harness onSave={onSave} initial="igual" />)
    const field = screen.getByLabelText('Añadir nota') as HTMLTextAreaElement
    fireEvent.blur(field)
    await new Promise((r) => setTimeout(r, 60))
    expect(onSave).not.toHaveBeenCalled()
    expect(field.getAttribute('maxlength')).toBe('1000')
    fireEvent.change(field, { target: { value: 'x'.repeat(1200) } })
    expect(field.value.length).toBe(1000)
    expect(document.body.textContent).toContain('1000 de 1000 caracteres')
  })

  it('shows an alert on failure and keeps the text', async () => {
    const onSave = vi.fn(async () => {
      throw new Error('503')
    })
    render(<Harness onSave={onSave} />)
    const field = screen.getByLabelText('Añadir nota') as HTMLTextAreaElement
    fireEvent.change(field, { target: { value: 'nota' } })
    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toContain('No se pudo guardar')
    expect(field.value).toBe('nota')
  })

  it('no-JS form: posts with the intent and shows a save button only before hydration', () => {
    const html = renderToString(<OrderNote value="x" onSave={() => undefined} form={{ action: '/carrito', intent: 'note' }} />)
    expect(html).toContain('method="post"')
    expect(html).toContain('action="/carrito"')
    expect(html).toContain('name="intent"')
    expect(html).toContain('Guardar nota')
    expect(html).toContain('name="note"')
    const { container } = render(<OrderNote value="x" onSave={() => undefined} form={{ action: '/carrito', intent: 'note' }} />)
    expect(container.querySelector('button[type=submit]')).toBeNull() // hydrated: autosave takes over
  })

  it('English labels', () => {
    render(<OrderNote value={null} onSave={() => undefined} locale="en-US" />)
    expect(screen.getByLabelText('Add a note')).toBeTruthy()
  })
})
