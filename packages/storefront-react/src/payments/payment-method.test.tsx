// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { renderToString } from 'react-dom/server'
import axe from 'axe-core'
import { createRef } from 'react'
import type { PaymentClient, PaymentMethod } from '@asteby/storefront'
import { PaymentMethodSection, buildPayChoices, formFields, paymentMethodMessages, type PaymentFormAdapter, type PaymentMethodSectionProps } from './index.js'

afterEach(() => {
  cleanup()
  try {
    window.sessionStorage.clear()
  } catch {
    /* no storage */
  }
})

const client: PaymentClient = { kind: 'fake', sdk_url: 'https://sdk.example.com/js', public_key: 'pk' }
const method: PaymentMethod = {
  key: 'prov',
  kind: 'provider',
  default: true,
  client,
  options: [
    { key: 'card', redirect: false },
    { key: 'cash', redirect: false, points: [
      { id: 'a', payment_method_id: 'store', label: 'Tienda 1', group: 'main' },
      { id: 'b', payment_method_id: 'bank', label: 'Banco', group: 'more' },
    ] },
    { key: 'wallet', redirect: true, label: 'Mi cuenta' },
  ],
}
const total = { amount: '2185.00', currency_code: 'MXN' }

function fakeAdapter() {
  const mounts: string[] = []
  const adapter: PaymentFormAdapter = {
    kind: 'fake',
    async load() {},
    async mount(o) {
      mounts.push(o.amount.amount)
      queueMicrotask(() => o.onReady())
      return { collect: async () => ({ provider_data: { token: 't' } }), unmount() {} }
    },
  }
  return { adapter, mounts }
}

function setup(over: Partial<PaymentMethodSectionProps> = {}, methods: PaymentMethod[] = [method]) {
  const formRef = createRef<HTMLFormElement>()
  const onDone = vi.fn()
  const fa = fakeAdapter()
  const props: PaymentMethodSectionProps = {
    choices: buildPayChoices(methods),
    amount: total,
    scope: 'cart_1',
    formRef,
    payUrl: '/pagar/cobrar',
    statusUrl: '/pagar/estado',
    delivery: 'rate:1',
    onDone,
    brickProps: { adapter: fa.adapter, storage: null },
    ...over,
  }
  const view = render(
    <form ref={formRef} onSubmit={(e) => e.preventDefault()}>
      <input name="email" aria-label="Correo" defaultValue="a@b.co" />
      <PaymentMethodSection {...props} />
    </form>,
  )
  return { ...view, onDone, mounts: fa.mounts, formRef }
}

describe('PaymentMethodSection', () => {
  it('renders one radio per server option with texts from props and the card preselected', () => {
    setup({ messages: { legend: 'Cómo pagas' } })
    expect(screen.getByRole('group', { name: 'Cómo pagas' })).toBeTruthy()
    const radios = screen.getAllByRole('radio', { name: /Tarjeta|Efectivo|Mi cuenta/ })
    expect(radios.map((r) => (r as HTMLInputElement).value)).toEqual(['prov|card', 'prov|cash', 'prov|wallet'])
    expect((radios[0] as HTMLInputElement).checked).toBe(true)
    expect(screen.getByText('Mi cuenta')).toBeTruthy()
    expect(screen.getByText('Tarjeta de crédito o débito')).toBeTruthy()
  })
  it('mounts the card form with the server total once the delivery is synced, and the button charges through the ref', async () => {
    const syncDelivery = vi.fn(async () => true)
    const { mounts } = setup({ syncDelivery })
    await waitFor(() => expect(mounts).toEqual(['2185.00']))
    expect(syncDelivery).toHaveBeenCalledTimes(1)
    expect(syncDelivery).toHaveBeenCalledWith('rate:1')
    expect(screen.getByRole('button', { name: /Realizar el pedido/ })).toBeTruthy()
  })
  it('waits for delivery: no form until it is chosen', async () => {
    const { mounts } = setup({ deliveryReady: false })
    expect(screen.getByRole('status').textContent).toMatch(/entrega/i)
    await new Promise((r) => setTimeout(r, 30))
    expect(mounts).toEqual([])
  })
  it('a failed delivery sync degrades to redirect with an alert and no card form', async () => {
    const { mounts } = setup({ syncDelivery: async () => false })
    await screen.findByRole('alert')
    expect(mounts).toEqual([])
    expect(screen.getByRole('button', { name: 'Continuar al pago' })).toBeTruthy()
  })
  it('cash shows its points and the button submits the page form normally', async () => {
    const { container } = setup({ syncDelivery: async () => true })
    fireEvent.click(screen.getByRole('radio', { name: /Efectivo/ }))
    const panel = container.querySelector('[data-sf-pay-panel="cash"]') as HTMLElement
    expect(panel.hidden).toBe(false)
    expect(screen.getByRole('radio', { name: 'Tienda 1' })).toBeTruthy()
    expect((screen.getByRole('radio', { name: 'Tienda 1' }) as HTMLInputElement).checked).toBe(true)
    const submit = vi.fn()
    container.querySelector('form')!.addEventListener('submit', submit)
    fireEvent.click(screen.getByRole('button', { name: /Generar ficha de pago/ }))
    expect(submit).toHaveBeenCalled()
    expect(formFields(container.querySelector('form'))).toMatchObject({ payment_choice: 'prov|cash', cash_point: 'a', email: 'a@b.co' })
  })
  it('cash also saves the delivery first, so the button total holds the shipping', async () => {
    const syncDelivery = vi.fn(async () => true)
    const choices = buildPayChoices([method])
    setup({ syncDelivery, choices, defaultChoice: 'prov|cash' })
    await waitFor(() => expect(syncDelivery).toHaveBeenCalledWith('rate:1'))
    expect(syncDelivery).toHaveBeenCalledTimes(1)
    await waitFor(() => expect(screen.getByRole('button', { name: /Generar ficha de pago/ }).textContent).toContain('2,185.00'))
    // Changing the row with the same delivery does not save it again.
    fireEvent.click(screen.getByRole('radio', { name: 'Mi cuenta' }))
    expect(syncDelivery).toHaveBeenCalledTimes(1)
  })
  it('the button hides the stale total while the delivery is being saved', async () => {
    let resolve: (ok: boolean) => void = () => {}
    const syncDelivery = vi.fn(() => new Promise<boolean>((r) => (resolve = r)))
    setup({ syncDelivery, defaultChoice: 'prov|cash' })
    await waitFor(() => expect(syncDelivery).toHaveBeenCalled())
    expect(screen.getByRole('button').textContent).toBe('Generar ficha de pago')
    resolve(true)
    await waitFor(() => expect(screen.getByRole('button').textContent).toMatch(/Generar ficha de pago .*2,185/))
  })
  it("a re-quote is a status, not a failure: the card stays and the sync runs again with the new rate", async () => {
    const syncDelivery = vi.fn(async (d: string) => (d === 'rate:1' ? ('requote' as const) : true))
    const view = setup({ syncDelivery })
    await screen.findByText(/tarifas de envío se actualizaron/)
    expect(screen.queryByRole('alert')).toBeNull()
    expect(screen.getByRole('button').textContent).toBe('Realizar el pedido')
    view.rerender(
      <form ref={view.formRef} onSubmit={(e) => e.preventDefault()}>
        <input name="email" aria-label="Correo" defaultValue="a@b.co" />
        <PaymentMethodSection choices={buildPayChoices([method])} amount={total} scope="cart_1" formRef={view.formRef} payUrl="/p" delivery="rate:2" syncDelivery={syncDelivery} onDone={() => {}} brickProps={{ adapter: fakeAdapter().adapter, storage: null }} />
      </form>,
    )
    await waitFor(() => expect(syncDelivery).toHaveBeenCalledWith('rate:2'))
    await waitFor(() => expect(screen.queryByText(/tarifas de envío se actualizaron/)).toBeNull())
  })
  it('draws brand marks: card networks, cash points and the provider on its own rows', () => {
    const mp: PaymentMethod = { ...method, key: 'mercadopago', options: [
      { key: 'card', redirect: false },
      { key: 'cash', redirect: false, points: [
        { id: 'oxxo', payment_method_id: 'oxxo', label: 'OXXO', group: 'main' },
        { id: '7eleven', payment_method_id: 'paycash', payment_point: '7eleven', label: '7 Eleven', group: 'main' },
        { id: 'bbva', payment_method_id: 'bancomer', label: 'BBVA', group: 'more' },
      ] },
      { key: 'wallet', redirect: true },
    ] }
    const { container } = setup({ cardBrands: ['visa', 'mastercard', 'amex'] }, [mp])
    const row = (v: string) => container.querySelector(`input[value="${v}"]`)!.closest('label')!
    const marks = (el: Element) => [...el.querySelectorAll('[data-sf-brand-mark]')].map((n) => n.getAttribute('data-sf-brand-mark'))
    expect(marks(row('mercadopago|card'))).toEqual(['visa', 'mastercard', 'amex'])
    expect(marks(row('mercadopago|cash'))).toEqual(['oxxo', '7eleven'])
    expect(marks(row('mercadopago|wallet'))).toEqual(['mercadopago'])
    const points = container.querySelectorAll('[data-sf-pay-point]')
    expect([...points].map((p) => p.querySelector('[data-sf-brand-mark]')?.getAttribute('data-sf-brand-mark'))).toEqual(['oxxo', '7eleven', 'bbva'])
    // Text-only when the shop turns them off.
    cleanup()
    const plain = setup({ brandMarks: false, cardBrands: ['visa'] }, [mp])
    expect(plain.container.querySelector('[data-sf-brand-mark]')).toBeNull()
  })
  it('redirect rows explain the redirect and the button says so', () => {
    setup()
    fireEvent.click(screen.getByRole('radio', { name: 'Mi cuenta' }))
    expect(screen.getByText(/Te llevamos a la página del proveedor/)).toBeTruthy()
  })
  it('hides the panels of unchecked rows after hydration', () => {
    const { container } = setup()
    expect((container.querySelector('[data-sf-pay-panel="cash"]') as HTMLElement).hidden).toBe(true)
  })
  it('without a card client the card row redirects and no form is offered', () => {
    const { container } = setup({}, [{ ...method, client: undefined }])
    expect(container.querySelector('[data-sf-pay-card]')).toBeNull()
    expect(container.querySelector('input[value="prov|card"]')!.getAttribute('data-mode')).toBe('redirect')
  })
  it('server-rendered HTML has every panel and works without JavaScript', () => {
    const html = renderToString(
      <form>
        <PaymentMethodSection choices={buildPayChoices([method])} amount={total} formRef={createRef()} payUrl="/p" onDone={() => {}} />
      </form>,
    )
    expect(html).toContain('data-sf-pay-panel="cash"')
    expect(html).toContain('name="cash_point"')
    expect(html).toContain('name="payment_choice"')
    expect(html).not.toContain('data-sf-pay-card')
    expect(html).toMatch(/<button type="submit"/)
  })
  it('no methods at all explains it and keeps the button off', () => {
    setup({ blocked: true }, [])
    expect(screen.getByRole('alert').textContent).toMatch(/no hay formas de pago/)
    expect((screen.getByRole('button') as HTMLButtonElement).disabled).toBe(true)
  })
  it('the address-first step reads "continue" and shows no card form', async () => {
    const { mounts } = setup({ addressFirst: true })
    expect(screen.getByRole('button', { name: 'Continuar' })).toBeTruthy()
    await new Promise((r) => setTimeout(r, 20))
    expect(mounts).toEqual([])
  })
  it('speaks English and accepts class names, icons, test ids and an amount renderer', () => {
    const { container } = setup({ locale: 'en-US', classNames: { root: 'r', submit: 'btn' }, icons: { card: <svg data-icon="c" /> }, testIds: { submit: 'place-order', method: 'payment-method' }, renderAmount: () => 'TOTAL' })
    expect(screen.getByText('Payment method')).toBeTruthy()
    expect(container.querySelector('fieldset.r')).toBeTruthy()
    expect(container.querySelector('[data-icon="c"]')).toBeTruthy()
    expect(screen.getAllByTestId('payment-method')).toHaveLength(3)
    expect(screen.getByTestId('place-order').className).toBe('btn')
    fireEvent.click(screen.getByRole('radio', { name: /Cash/ }))
    expect(screen.getByTestId('place-order').textContent).toBe('Get payment slip TOTAL')
  })
  it('opens the card form right under the card row, not after every row', async () => {
    const { container } = setup({ syncDelivery: async () => true })
    await waitFor(() => expect(container.querySelector('[data-sf-pay-card]')).toBeTruthy())
    const cardRow = container.querySelector('input[value="prov|card"]')!.closest('[data-sf-pay-choice]')!
    expect(cardRow.querySelector('[data-sf-pay-card]')).toBeTruthy()
    const rows = [...container.querySelectorAll('[data-sf-pay-choice]')]
    expect(rows.indexOf(cardRow)).toBe(0)
    // Nothing of the card form after the last row.
    expect(rows.at(-1)!.nextElementSibling?.hasAttribute('data-sf-pay-card')).toBeFalsy()
  })
  it('hands the e-mail of the page form to the card form (the provider does not ask for it again)', async () => {
    const emails: Array<string | undefined> = []
    const adapter: PaymentFormAdapter = {
      kind: 'fake',
      async load() {},
      async mount(o) {
        emails.push(o.email)
        queueMicrotask(() => o.onReady())
        return { collect: async () => ({ provider_data: { token: 't' } }), unmount() {} }
      },
    }
    setup({ syncDelivery: async () => true, brickProps: { adapter, storage: null } })
    await waitFor(() => expect(emails).toEqual(['a@b.co']))
    cleanup()
    emails.length = 0
    setup({ syncDelivery: async () => true, payerEmailField: null, brickProps: { adapter, storage: null } })
    await waitFor(() => expect(emails).toEqual([undefined]))
  })
  it('a card form mounted before the e-mail was typed is mounted again once with it', async () => {
    const emails: Array<string | undefined> = []
    const adapter: PaymentFormAdapter = {
      kind: 'fake',
      async load() {},
      async mount(o) {
        emails.push(o.email)
        queueMicrotask(() => o.onReady())
        return { collect: async () => ({ provider_data: { token: 't' } }), unmount() {} }
      },
    }
    // A guest arrives with the e-mail still empty.
    const formRef = createRef<HTMLFormElement>()
    render(
      <form ref={formRef}>
        <input name="email" aria-label="Correo" defaultValue="" />
        <PaymentMethodSection choices={buildPayChoices([method])} amount={total} scope="cart_9" formRef={formRef} payUrl="/p" delivery="rate:1" syncDelivery={async () => true} onDone={() => {}} brickProps={{ adapter, storage: null }} />
      </form>,
    )
    await waitFor(() => expect(emails).toEqual([undefined]))
    const field = screen.getByLabelText('Correo') as HTMLInputElement
    fireEvent.change(field, { target: { value: 'ana@correo.mx' } })
    await waitFor(() => expect(emails).toEqual([undefined, 'ana@correo.mx']))
    // Further edits do not remount it (the server uses the cart e-mail).
    fireEvent.change(field, { target: { value: 'otra@correo.mx' } })
    await new Promise((r) => setTimeout(r, 30))
    expect(emails).toHaveLength(2)
  })
  it('remembers the chosen row and cash point for the cart: a reload does not ask again', async () => {
    const first = setup()
    fireEvent.click(screen.getByRole('radio', { name: /Efectivo/ }))
    fireEvent.click(screen.getByRole('radio', { name: 'Banco' }))
    first.unmount()
    const again = setup()
    await waitFor(() => expect((screen.getByRole('radio', { name: /Efectivo/ }) as HTMLInputElement).checked).toBe(true))
    await waitFor(() => expect((screen.getByRole('radio', { name: 'Banco' }) as HTMLInputElement).checked).toBe(true))
    // The remembered point lives under "more": the list opens by itself.
    expect((again.container.querySelector('[data-sf-pay-panel="cash"] details') as HTMLDetailsElement).open).toBe(true)
    again.unmount()
    // Another cart starts from the server default.
    setup({ scope: 'cart_2' })
    expect((screen.getByRole('radio', { name: /Tarjeta/ }) as HTMLInputElement).checked).toBe(true)
  })
  it('ignores a remembered row the server no longer publishes, and can be turned off', async () => {
    window.sessionStorage.setItem('sf:pay-choice:cart_1', JSON.stringify({ choice: 'prov|credits' }))
    const a = setup()
    await new Promise((r) => setTimeout(r, 10))
    expect((screen.getByRole('radio', { name: /Tarjeta/ }) as HTMLInputElement).checked).toBe(true)
    a.unmount()
    window.sessionStorage.clear()
    const b = setup({ rememberChoice: false })
    fireEvent.click(screen.getByRole('radio', { name: /Efectivo/ }))
    expect(window.sessionStorage.getItem('sf:pay-choice:cart_1')).toBeNull()
    b.unmount()
  })
  it('cashPointsVisible keeps the first N points in sight and moves the rest under "more"', () => {
    const many: PaymentMethod = { ...method, options: [
      { key: 'cash', redirect: false, points: ['a', 'b', 'c', 'd', 'e'].map((id) => ({ id, payment_method_id: id, label: `Punto ${id}`, group: 'main' as const })) },
    ] }
    const { container } = setup({ cashPointsVisible: 2 }, [many])
    const panel = container.querySelector('[data-sf-pay-panel="cash"]')!
    const direct = panel.querySelectorAll(':scope fieldset > [data-sf-pay-points] [data-sf-pay-point]')
    expect([...direct].map((p) => (p.querySelector('input') as HTMLInputElement).value)).toEqual(['a', 'b'])
    expect(panel.querySelectorAll('details [data-sf-pay-point]')).toHaveLength(3)
  })
  it('without a delivery the button says what is missing and does not pay', () => {
    const { container } = setup({ deliveryReady: false, defaultChoice: 'prov|cash' })
    const submit = vi.fn()
    container.querySelector('form')!.addEventListener('submit', submit)
    const button = screen.getByRole('button', { name: 'Elige la entrega para continuar' })
    fireEvent.click(button)
    expect(submit).not.toHaveBeenCalled()
  })
  it('has no axe violations in card, cash and empty states', async () => {
    const { container } = setup({ syncDelivery: async () => true })
    const run = async () => (await axe.run(container, { rules: { 'color-contrast': { enabled: false } } })).violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.html).join('|')}`)
    await waitFor(() => expect(container.querySelector('[data-sf-pay-status="ready"]')).toBeTruthy())
    expect(await run()).toEqual([])
    fireEvent.click(screen.getByRole('radio', { name: /Efectivo/ }))
    expect(await run()).toEqual([])
    cleanup()
    const empty = setup({}, [])
    expect((await axe.run(empty.container, { rules: { 'color-contrast': { enabled: false } } })).violations).toEqual([])
  })
})

describe('paymentMethodMessages', () => {
  it('merges overrides over the locale defaults', () => {
    const m = paymentMethodMessages('en-US', { pay: 'Buy', options: { cash: 'Cash at store' } })
    expect(m.pay).toBe('Buy')
    expect(m.options.cash).toBe('Cash at store')
    expect(m.options.card).toBe('Credit or debit card')
    expect(paymentMethodMessages().legend).toBe('Método de pago')
  })
})
