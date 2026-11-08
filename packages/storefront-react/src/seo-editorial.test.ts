import { describe, expect, it } from 'vitest'
import { articleJsonLd, productReviewsJsonLd, validateJsonLd, webPageJsonLd, websiteJsonLd, breadcrumbJsonLd, faqJsonLd, organizationJsonLd } from './seo.js'

describe('websiteJsonLd', () => {
  it('links to the organization and declares the search action only when given', () => {
    const ld = websiteJsonLd({ origin: 'https://s.com', url: 'https://s.com/mx', name: 'S', locale: 'es-MX', searchUrl: 'https://s.com/mx/buscar?q={search_term_string}' })
    expect(ld).toMatchObject({ '@type': 'WebSite', '@id': 'https://s.com#website', publisher: { '@id': 'https://s.com#organization' } })
    expect((ld.potentialAction as { 'query-input': string })['query-input']).toBe('required name=search_term_string')
    expect(websiteJsonLd({ origin: 'https://s.com', url: 'https://s.com', name: 'S' })).not.toHaveProperty('potentialAction')
  })
})

describe('articleJsonLd / webPageJsonLd', () => {
  it('Article: person author when real, else the publisher; absolute image; headline ≤ 110', () => {
    const a = articleJsonLd({ url: 'https://s.com/blog/x', title: 'T'.repeat(150), image: '/a.jpg', publishedAt: '2026-10-01', author: { name: 'Ana', jobTitle: 'Nutrióloga' }, publisher: { name: 'S', url: 'https://s.com', logo: 'https://s.com/l.png' }, locale: 'es-MX' }) as Record<string, any>
    expect((a.headline as string).length).toBe(110)
    expect(a.image).toBe('https://s.com/a.jpg')
    expect(a.author).toEqual({ '@type': 'Person', name: 'Ana', jobTitle: 'Nutrióloga' })
    expect(a.dateModified).toBe('2026-10-01')
    const b = articleJsonLd({ url: 'https://s.com/blog/y', title: 'Y', publisher: { name: 'S', url: 'https://s.com' } }) as Record<string, any>
    expect(b.author).toEqual({ '@type': 'Organization', name: 'S' })
  })
  it('WebPage: lastReviewed/reviewedBy only when provided', () => {
    const p = webPageJsonLd({ url: 'https://s.com/p', name: 'Acerca', type: 'AboutPage', origin: 'https://s.com', lastReviewed: '2026-11-01', reviewedBy: { name: 'S' } })
    expect(p).toMatchObject({ '@type': 'AboutPage', lastReviewed: '2026-11-01', reviewedBy: { name: 'S' }, about: { '@id': 'https://s.com#organization' } })
    expect(webPageJsonLd({ url: 'https://s.com/p', name: 'x' })).not.toHaveProperty('lastReviewed')
  })
})

describe('productReviewsJsonLd (real reviews only)', () => {
  it('returns null without valid reviews', () => {
    expect(productReviewsJsonLd([])).toBeNull()
    expect(productReviewsJsonLd([{ author: '', rating: 5 }, { author: 'A', rating: 9 }, { author: 'B', rating: NaN }])).toBeNull()
  })
  it('aggregates from the valid reviews received', () => {
    const r = productReviewsJsonLd([{ author: 'A', rating: 5, text: '<b>Bien</b>' }, { author: 'B', rating: 4 }, { author: '', rating: 1 }])!
    expect(r.aggregateRating).toMatchObject({ ratingValue: 4.5, reviewCount: 2, bestRating: 5 })
    expect(r.review).toHaveLength(2)
    expect(r.review[0]).toMatchObject({ reviewBody: 'Bien' })
  })
  it('uses the store summary only when it covers the reviews shown', () => {
    expect(productReviewsJsonLd([{ author: 'A', rating: 5 }], { value: 4.9, count: 64 })!.aggregateRating).toMatchObject({ ratingValue: 4.9, reviewCount: 64 })
    expect(productReviewsJsonLd([{ author: 'A', rating: 5 }, { author: 'B', rating: 5 }], { value: 4.9, count: 1 })!.aggregateRating).toMatchObject({ ratingValue: 5, reviewCount: 2 })
  })
})

describe('validateJsonLd', () => {
  it('passes the SDK builders', () => {
    expect(validateJsonLd([breadcrumbJsonLd([{ name: 'a', url: 'https://s.com' }]), faqJsonLd([{ question: 'q', answer: 'a' }])])).toEqual([])
    expect(validateJsonLd(organizationJsonLd({ name: 'S', description: null, domain: 'https://s.com', logo: null, contact: { email: null, phone: null } } as never, 'https://s.com'))).toEqual([])
  })
  it('flags missing required properties, bad currency, non-numeric price and relative URLs (nested)', () => {
    const issues = validateJsonLd({ '@type': 'Product', name: 'P', image: '/a.jpg', offers: { '@type': 'Offer', price: '9,99', priceCurrency: 'mxn' } })
    expect(issues).toEqual(expect.arrayContaining(['$.offers: Offer sin availability', '$.offers: priceCurrency inválida', '$.offers: price no numérico', '$: URL no absoluta'.replace('$:', '$.image:')]))
    expect(validateJsonLd({ '@type': 'Product', name: 'P' })).toContain('$: Product sin offers')
  })
})
