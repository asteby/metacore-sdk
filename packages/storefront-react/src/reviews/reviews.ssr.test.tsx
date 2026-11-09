import { describe, expect, it } from 'vitest'
import { renderToString } from 'react-dom/server'
import type { ReviewList } from '@asteby/storefront'
import { ProductReviews, ReviewsPolicy, reviewsJsonLdInput } from './index.js'
import type { ReviewsApi } from './index.js'

const api: ReviewsApi = { list: async () => null, eligibility: async () => ({ can_review: false, reason: 'login_required' }), create: async () => ({ id: 'x', status: 'pending' }) }
const list: ReviewList = {
  summary: { count: 3, average: 3.67, distribution: { '1': 0, '2': 1, '3': 0, '4': 0, '5': 2 } },
  nodes: [
    { id: 'a', rating: 5, title: 'Excelente', body: 'Muy bueno.\nLlegó rápido.', display_name: 'Ana P.', created_at: '2026-03-02T12:00:00.000Z', brand_reply: { body: 'Gracias por tu opinión', created_at: '2026-03-03T12:00:00.000Z' } },
    { id: 'b', rating: 2, title: '', body: 'No me gustó el sabor.', display_name: 'Cesar De Alba', created_at: '2025-09-01T12:00:00.000Z' },
  ],
  page_info: { has_next_page: true, end_cursor: 'c' },
  total_count: 3,
}

describe('ProductReviews without JavaScript (server render)', () => {
  it('renders the summary, the reviews and the write button from `initial`, with no request', () => {
    const html = renderToString(<ProductReviews handle="omega-3" api={api} initial={list} locale="es-MX" />)
    expect(html).toContain('3.7')
    expect(html).toContain('3 reseñas')
    expect(html).toContain('Ana P.')
    expect(html).toContain('Cesar De Alba')
    expect(html).toContain('Respuesta de la tienda')
    expect(html).toContain('Escribir una reseña')
    expect(html).toContain('Más reseñas')
    expect(html).toMatch(/datetime="2026-03-02T12:00:00.000Z"/i)
    expect(html.match(/data-sf-review=""/g)).toHaveLength(2)
  })
  it('shows every review the same: no per-review badge of any kind', () => {
    const html = renderToString(<ProductReviews handle="omega-3" api={api} initial={list} />)
    expect(html).not.toMatch(/verificad|verified|anterior|previous|imported/i)
  })
  it('English, and an empty list says so', () => {
    const empty: ReviewList = { summary: { count: 0, average: 0, distribution: { '1': 0, '2': 0, '3': 0, '4': 0, '5': 0 } }, nodes: [], page_info: { has_next_page: false, end_cursor: null }, total_count: 0 }
    const html = renderToString(<ProductReviews handle="omega-3" api={api} initial={empty} locale="en-US" />)
    expect(html).toContain('There are no reviews of this product yet.')
    expect(html).toContain('Write a review')
    expect(html).not.toContain('data-sf-reviews-summary')
  })
  it('policy: plain, true rules in es and en', () => {
    const es = renderToString(<ReviewsPolicy locale="es-MX" />)
    expect(es).toContain('Cómo funcionan nuestras reseñas')
    expect(es).toContain('clientes que compraron nuestros productos')
    expect(es).toContain('las positivas y las negativas')
    expect(es).toContain('spam, contenido ofensivo, datos personales')
    expect(renderToString(<ReviewsPolicy locale="en" />)).toContain('How our reviews work')
  })
  it('structured data input comes only from what the list shows', () => {
    const ld = reviewsJsonLdInput(list)!
    expect(ld.summary).toEqual({ value: 3.67, count: 3 })
    expect(ld.items.map((i) => i.author)).toEqual(['Ana P.', 'Cesar De Alba'])
    expect(ld.items[1]!.date).toBe('2025-09-01')
    expect(reviewsJsonLdInput(null)).toBeNull()
    expect(reviewsJsonLdInput({ ...list, summary: { ...list.summary, count: 0 } })).toBeNull()
  })
})
