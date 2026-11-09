import { describe, expect, it } from 'vitest'
import { createStorefrontClient } from '../index.js'
import { MOCK_CUSTOMER_EMAIL, createMockStorefront } from './index.js'
import { cleanReviewText, publicReviewName, reviewTextProblem, summarizeReviews } from './reviews.js'
import { buildProducts, MOCK_CURRENCY, MOCK_IMAGE_URL } from './seed.js'

const handles = buildProducts(MOCK_CURRENCY, MOCK_IMAGE_URL).map((p) => ({ handle: p.handle, title: p.title }))
const BOUGHT = handles.find((p) => p.title === 'Playera básica')!.handle
const OTHER = handles.find((p) => p.title !== 'Playera básica')!.handle
const GOOD = { rating: 2, title: 'No me gustó', body: 'Tardó mucho en llegar y la talla no era la que pedí.' }

function setup(seed: Parameters<typeof createMockStorefront>[0] = {}) {
  const mock = createMockStorefront(seed)
  const sf = createStorefrontClient({ baseUrl: 'https://mock.local/api/gw', token: 'sk_mock', fetch: mock.fetch })
  return { mock, sf }
}

async function signIn(sf: ReturnType<typeof setup>['sf']) {
  await sf.customer.requestOtp({ email: MOCK_CUSTOMER_EMAIL })
  const session = await sf.customer.createSession({ email: MOCK_CUSTOMER_EMAIL, code: '000000' })
  return sf.withCustomerToken(session.token)
}

describe('reviews text rules', () => {
  it('cleans markup and refuses links, e-mail and phone numbers', () => {
    expect(cleanReviewText('<b>Hola</b> <script>x</script>mundo')).toBe('Hola xmundo')
    expect(reviewTextProblem('mira www.spam.com ahora mismo', 10, 100)).toBe('links_not_allowed')
    expect(reviewTextProblem('escríbeme a ana@correo.com por favor', 10, 100)).toBe('personal_data')
    expect(reviewTextProblem('llámame al 55 1234 5678 si quieres', 10, 100)).toBe('personal_data')
    expect(reviewTextProblem('corto', 10, 100)).toBe('length')
    expect(reviewTextProblem('Pagué $1,299 y llegó roto, muy decepcionado.', 10, 100)).toBeNull()
  })
  it('shows every name as First L.', () => {
    expect(publicReviewName('maría fernanda lópez')).toBe('María L.')
    expect(publicReviewName('juan@mail.com')).toBe('')
    expect(publicReviewName('Ana')).toBe('Ana')
  })
  it('summarizes with a distribution', () => {
    expect(summarizeReviews([{ rating: 5 }, { rating: 4 }, { rating: 4 }])).toEqual({ count: 3, average: 4.33, distribution: { '1': 0, '2': 0, '3': 0, '4': 2, '5': 1 } })
    expect(summarizeReviews([]).average).toBe(0)
  })
})

describe('mock: product reviews', () => {
  it('lists only approved reviews, newest first, with the summary of those rows', async () => {
    const { sf } = setup({
      reviews: {
        seed: [
          { product_handle: BOUGHT, rating: 5, body: 'Excelente producto, llegó rápido.', display_name: 'Ana P.', created_at: '2026-01-02T12:00:00.000Z' },
          { product_handle: BOUGHT, rating: 1, body: 'Muy malo, se rompió al primer uso.', display_name: 'Luis G.', created_at: '2026-03-02T12:00:00.000Z' },
          { product_handle: BOUGHT, rating: 5, body: 'Pendiente de moderar todavía.', display_name: 'Eva', status: 'pending' },
          { product_handle: BOUGHT, rating: 5, body: 'Rechazada por spam obvio.', display_name: 'Bot', status: 'rejected' },
        ],
      },
    })
    const l = (await sf.reviews.list(BOUGHT))!
    expect(l.summary).toMatchObject({ count: 2, average: 3 })
    expect(l.nodes.map((n) => n.display_name)).toEqual(['Luis G.', 'Ana P.'])
    expect(Object.keys(l.nodes[0]!).sort()).toEqual(['body', 'created_at', 'display_name', 'id', 'rating', 'title'])
    expect((await sf.reviews.list(BOUGHT, { rating: 5 }))!.nodes).toHaveLength(1)
    expect((await sf.reviews.list(BOUGHT, { sort: 'lowest', first: 1 }))!.page_info.has_next_page).toBe(true)
    expect(await sf.reviews.list('no-such-product')).toBeNull()
  })

  it('only a buyer can write; the review is pending and invisible until approved', async () => {
    const { sf } = setup()
    expect((await sf.reviews.eligibility(BOUGHT)).reason).toBe('login_required')
    await expect(sf.reviews.create(BOUGHT, GOOD)).rejects.toMatchObject({ status: 401, code: 'login_required' })
    const me = await signIn(sf)
    expect((await me.reviews.eligibility(OTHER)).reason).toBe('not_purchased')
    await expect(me.reviews.create(OTHER, GOOD)).rejects.toMatchObject({ status: 403, code: 'not_purchased' })
    expect((await me.reviews.eligibility(BOUGHT)).can_review).toBe(true)
    const created = await me.reviews.create(BOUGHT, GOOD)
    expect(created.status).toBe('pending')
    expect((await sf.reviews.list(BOUGHT))!.summary.count).toBe(0)
    await expect(me.reviews.create(BOUGHT, GOOD)).rejects.toMatchObject({ status: 409, code: 'already_reviewed' })
    const mine = await me.reviews.mine()
    expect(mine).toHaveLength(1)
    expect(mine[0]).toMatchObject({ status: 'pending', product_handle: BOUGHT })
    expect((await me.reviews.eligibility(BOUGHT)).reason).toBe('already_reviewed')
  })

  it('validates the text and ignores the honeypot', async () => {
    const { sf } = setup()
    const me = await signIn(sf)
    await expect(me.reviews.create(BOUGHT, { ...GOOD, rating: 6 })).rejects.toMatchObject({ status: 422, field: 'rating' })
    await expect(me.reviews.create(BOUGHT, { ...GOOD, body: 'visita www.tienda-spam.com para ofertas' })).rejects.toMatchObject({ status: 422, field: 'body' })
    await expect(me.reviews.create(BOUGHT, { ...GOOD, title: 'ab' })).rejects.toMatchObject({ status: 422, field: 'title' })
    await me.reviews.create(BOUGHT, { ...GOOD, website: 'http://bot.example' })
    expect(await me.reviews.mine()).toHaveLength(0)
  })

  it('lets the author edit (back to moderation) and withdraw', async () => {
    const { sf } = setup({ reviews: { seed: [{ product_handle: BOUGHT, rating: 4, body: 'Me gustó bastante el producto.', display_name: 'Cliente', customer_id: 'cus_1' }] } })
    const me = await signIn(sf)
    const [mine] = await me.reviews.mine()
    const edited = await me.reviews.update(mine!.id, { rating: 5, body: 'Mejoró con el uso, ahora me encanta.' })
    expect(edited.status).toBe('pending')
    expect((await sf.reviews.list(BOUGHT))!.summary.count).toBe(0)
    await me.reviews.delete(mine!.id)
    expect(await me.reviews.mine()).toHaveLength(0)
    await expect(me.reviews.update(mine!.id, { rating: 1 })).rejects.toMatchObject({ status: 404 })
  })

  it('imports idempotently', async () => {
    const { sf } = setup()
    const items = [{ handle: BOUGHT, author: 'Cesar De Alba', rating: 3, text: 'En general todo bien.', date: '2025-09-01', external_ref: 'woocommerce:1' }]
    expect(await sf.reviews.import({ market: 'mx', items })).toEqual({ created: 1, skipped: 0, unknown_products: [] })
    expect(await sf.reviews.import({ market: 'mx', items })).toEqual({ created: 0, skipped: 1, unknown_products: [] })
    const l = (await sf.reviews.list(BOUGHT))!
    expect(l.summary.count).toBe(1)
    expect(l.nodes[0]).toMatchObject({ display_name: 'Cesar De Alba', created_at: '2025-09-01T12:00:00.000Z' })
  })
})
