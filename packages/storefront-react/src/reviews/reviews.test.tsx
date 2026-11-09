// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import axe from 'axe-core'
import { createStorefrontClient, StorefrontError } from '@asteby/storefront'
import { createMockStorefront, MOCK_CUSTOMER_EMAIL } from '@asteby/storefront/mock'
import { ProductReviews, ReviewsPolicy, reviewsApiFromClient, type ReviewsApi } from './index.js'

afterEach(cleanup)
const AXE = { rules: { 'color-contrast': { enabled: false } } }
const HANDLE = 'playera-basica'

function seeds(n: number) {
  return Array.from({ length: n }, (_, i) => ({ product_handle: HANDLE, rating: 1 + (i % 5), body: `Reseña número ${i + 1} del producto.`, display_name: `Cliente ${String.fromCharCode(65 + (i % 26))}.`, created_at: `2026-01-${String(28 - (i % 27)).padStart(2, '0')}T12:00:00.000Z` }))
}

async function setup(opts: { seed?: ReturnType<typeof seeds>; signedIn?: boolean; purchased?: () => boolean } = {}) {
  const mock = createMockStorefront({ reviews: { seed: opts.seed ?? [], ...(opts.purchased ? { purchased: opts.purchased } : {}) } })
  let sf = createStorefrontClient({ baseUrl: 'https://mock.local/api/gw', token: 'sk_mock', fetch: mock.fetch })
  if (opts.signedIn !== false) {
    await sf.customer.requestOtp({ email: MOCK_CUSTOMER_EMAIL })
    sf = sf.withCustomerToken((await sf.customer.createSession({ email: MOCK_CUSTOMER_EMAIL, code: '000000' })).token)
  }
  const api = reviewsApiFromClient(sf)
  const spy: ReviewsApi = { list: vi.fn(api.list), eligibility: vi.fn(api.eligibility), create: vi.fn(api.create) }
  return { sf, api: spy }
}

const clickWrite = async () => {
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: 'Escribir una reseña' }))
  })
}

describe('ProductReviews: reading', () => {
  it('loads the first page on its own when the server gave none, then "Más reseñas" and the rating filter', async () => {
    const { api } = await setup({ seed: seeds(14) })
    render(<ProductReviews handle={HANDLE} api={api} locale="es-MX" />)
    await waitFor(() => expect(screen.getAllByRole('listitem').filter((li) => li.hasAttribute('data-sf-review'))).toHaveLength(10))
    expect(api.list).toHaveBeenCalledWith(HANDLE, expect.objectContaining({ first: 10 }))
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Más reseñas' }))
    })
    await waitFor(() => expect(document.querySelectorAll('[data-sf-review]')).toHaveLength(14))
    expect(screen.queryByRole('button', { name: 'Más reseñas' })).toBeNull()
    await act(async () => {
      fireEvent.change(screen.getByLabelText('Calificación'), { target: { value: '5' } })
    })
    await waitFor(() => expect(api.list).toHaveBeenLastCalledWith(HANDLE, expect.objectContaining({ rating: 5 })))
    await waitFor(() => expect(document.querySelectorAll('[data-sf-review]').length).toBeLessThan(14))
  })

  it('shows the distribution as text for assistive technology and passes axe', async () => {
    const { api } = await setup({ seed: seeds(5) })
    const { container } = render(<ProductReviews handle={HANDLE} api={api} />)
    await waitFor(() => expect(document.querySelectorAll('[data-sf-review]')).toHaveLength(5))
    expect(screen.getByLabelText('5 estrellas: 1')).toBeTruthy()
    expect((await axe.run(container, AXE)).violations).toEqual([])
  })

  it('a failing list shows an error with a retry, never a blank section', async () => {
    const api: ReviewsApi = { list: vi.fn().mockRejectedValueOnce(new Error('x')).mockResolvedValue(null), eligibility: vi.fn(), create: vi.fn() }
    render(<ProductReviews handle={HANDLE} api={api} />)
    await screen.findByText(/No pudimos cargar las reseñas/)
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }))
    })
    await waitFor(() => expect(screen.queryByText(/No pudimos cargar/)).toBeNull())
  })
})

describe('ProductReviews: who can write', () => {
  it('anonymous: asks to sign in and links there', async () => {
    const { api } = await setup({ signedIn: false })
    render(<ProductReviews handle={HANDLE} api={api} initial={undefined} signInHref="/cuenta" />)
    await clickWrite()
    expect(await screen.findByText('Inicia sesión para dejar tu reseña.')).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Iniciar sesión' }).getAttribute('href')).toBe('/cuenta')
    expect(document.querySelector('[data-sf-reviews-form]')).toBeNull()
  })

  it('signed in without the purchase: «Compra este producto para dejar tu reseña»', async () => {
    const { api } = await setup({ purchased: () => false })
    render(<ProductReviews handle={HANDLE} api={api} />)
    await clickWrite()
    expect(await screen.findByText('Compra este producto para dejar tu reseña.')).toBeTruthy()
    expect(document.querySelector('[data-sf-reviews-form]')).toBeNull()
  })

  it('a buyer: form, keyboard stars, validation, success message, no form afterwards', async () => {
    const { api } = await setup()
    const { container } = render(<ProductReviews handle={HANDLE} api={api} market="mx" locale="es-MX" />)
    await clickWrite()
    const form = await screen.findByRole('form', { name: 'Tu reseña' })
    expect(document.activeElement?.tagName).toBe('H3')
    expect((await axe.run(container, AXE)).violations).toEqual([])

    // Sending empty names every problem and focuses the first.
    await act(async () => {
      fireEvent.submit(form)
    })
    expect(screen.getByText('Elige una calificación de 1 a 5 estrellas.')).toBeTruthy()
    expect(screen.getByText('El título debe tener entre 3 y 80 caracteres.')).toBeTruthy()
    expect(screen.getByText('Tu opinión debe tener entre 10 y 2000 caracteres.')).toBeTruthy()
    expect(api.create).not.toHaveBeenCalled()

    // Stars by keyboard: radiogroup, arrows select.
    const group = screen.getByRole('radiogroup', { name: 'Tu calificación' })
    const first = screen.getByRole('radio', { name: '1 de 5' })
    first.focus()
    fireEvent.keyDown(group, { key: 'ArrowRight' })
    fireEvent.keyDown(group, { key: 'ArrowRight' })
    expect(screen.getByRole('radio', { name: '2 de 5' }).getAttribute('aria-checked')).toBe('true')
    fireEvent.keyDown(group, { key: 'End' })
    expect(screen.getByRole('radio', { name: '5 de 5' }).getAttribute('aria-checked')).toBe('true')
    fireEvent.keyDown(group, { key: 'ArrowLeft' })
    expect(screen.getByRole('radio', { name: '4 de 5' }).getAttribute('aria-checked')).toBe('true')
    fireEvent.click(screen.getByRole('radio', { name: '2 de 5' }))

    fireEvent.change(screen.getByLabelText('Título'), { target: { value: 'No me convenció' } })
    fireEvent.change(screen.getByLabelText('Tu opinión'), { target: { value: 'La tela es delgada y tardó en llegar.' } })
    fireEvent.change(screen.getByLabelText(/Nombre que se mostrará/), { target: { value: 'maría fernanda lópez' } })
    await act(async () => {
      fireEvent.submit(form)
    })
    await screen.findByText('Gracias, tu reseña será revisada.')
    expect(api.create).toHaveBeenCalledWith(HANDLE, expect.objectContaining({ rating: 2, title: 'No me convenció', display_name: 'maría fernanda lópez', market: 'mx', locale: 'es' }))
    expect(document.querySelector('[data-sf-reviews-form]')).toBeNull()
    expect((await api.eligibility(HANDLE)).reason).toBe('already_reviewed')
  })

  it('the honeypot is out of reach of people and assistive tech and is sent only if a bot fills it', async () => {
    const { api } = await setup()
    render(<ProductReviews handle={HANDLE} api={api} />)
    await clickWrite()
    await screen.findByRole('form')
    const hp = document.querySelector('[data-sf-reviews-hp]') as HTMLElement
    expect(hp.getAttribute('aria-hidden')).toBe('true')
    const input = hp.querySelector('input')!
    expect(input.tabIndex).toBe(-1)
  })

  it('maps server refusals to clear messages', async () => {
    const cases: [number, string, string, RegExp][] = [
      [403, 'not_purchased', 'x', /Solo quien compró este producto/],
      [409, 'already_reviewed', 'x', /Ya dejaste una reseña/],
      [429, 'rate_limited', 'x', /Enviaste muchas reseñas/],
      [401, 'login_required', 'x', /Inicia sesión e inténtalo/],
      [422, 'validation', 'body: links_not_allowed', /No se permiten enlaces/],
      [500, 'server_error', 'boom', /No pudimos enviar tu reseña/],
    ]
    for (const [status, code, message, expected] of cases) {
      const api: ReviewsApi = {
        list: async () => null,
        eligibility: async () => ({ can_review: true, reason: 'ok' }),
        create: async () => {
          throw new StorefrontError({ status, code, message, ...(status === 422 ? { field: 'body' } : {}), ...(status === 429 ? { retryAfter: 600 } : {}) })
        },
      }
      render(<ProductReviews handle={HANDLE} api={api} initial={undefined} />)
      await clickWrite()
      const form = await screen.findByRole('form')
      fireEvent.click(screen.getByRole('radio', { name: '3 de 5' }))
      fireEvent.change(screen.getByLabelText('Título'), { target: { value: 'Título válido' } })
      fireEvent.change(screen.getByLabelText('Tu opinión'), { target: { value: 'Un texto de opinión suficientemente largo.' } })
      await act(async () => {
        fireEvent.submit(form)
      })
      await screen.findByText(expected)
      // The form stays open with the text kept, so nothing the buyer wrote is lost.
      expect((screen.getByLabelText('Tu opinión') as HTMLTextAreaElement).value).toContain('suficientemente largo')
      cleanup()
    }
  })

  it('English texts', async () => {
    const { api } = await setup({ purchased: () => false })
    render(<ProductReviews handle={HANDLE} api={api} locale="en-US" />)
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Write a review' }))
    })
    expect(await screen.findByText('Buy this product to leave your review.')).toBeTruthy()
  })
})

describe('ReviewsPolicy', () => {
  it('passes axe', async () => {
    const { container } = render(<ReviewsPolicy />)
    expect((await axe.run(container, AXE)).violations).toEqual([])
  })
})
