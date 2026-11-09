import type { ProductReview, ReviewList, ReviewSummary } from '@asteby/storefront'

export const REVIEW_LIMITS = { title: { min: 3, max: 80 }, body: { min: 10, max: 2000 } } as const

/** Percentage (0-100, integer) of each rating, largest remainder not needed: bars are visual, counts are the data. */
export function distributionPercent(summary: ReviewSummary): Record<'1' | '2' | '3' | '4' | '5', number> {
  const out = { '1': 0, '2': 0, '3': 0, '4': 0, '5': 0 } as Record<'1' | '2' | '3' | '4' | '5', number>
  if (summary.count <= 0) return out
  for (const k of ['1', '2', '3', '4', '5'] as const) out[k] = Math.round((summary.distribution[k] / summary.count) * 100)
  return out
}

/**
 * Input of `productReviewsJsonLd` from what the page SHOWS: the summary and the reviews of the list the page rendered
 * (approved ones only: that is all the server sends). Never pass reviews the page does not display.
 */
export function reviewsJsonLdInput(list: Pick<ReviewList, 'summary' | 'nodes'> | null | undefined, max = 10) {
  if (!list || list.summary.count < 1) return null
  const shown = list.nodes.slice(0, max)
  return {
    summary: { value: list.summary.average, count: list.summary.count },
    items: shown.map((r: ProductReview) => ({ author: r.display_name, rating: r.rating, text: r.body, date: r.created_at.slice(0, 10) })),
  }
}

export type ReviewFieldError = { field: 'rating' | 'title' | 'body'; key: 'rating' | 'title.length' | 'body.length' }

/** Client-side check mirroring the server limits (the server stays the authority). */
export function validateReviewInput(input: { rating: number; title: string; body: string }): ReviewFieldError[] {
  const errors: ReviewFieldError[] = []
  const len = (s: string) => [...s.trim()].length
  if (!Number.isInteger(input.rating) || input.rating < 1 || input.rating > 5) errors.push({ field: 'rating', key: 'rating' })
  if (len(input.title) < REVIEW_LIMITS.title.min || len(input.title) > REVIEW_LIMITS.title.max) errors.push({ field: 'title', key: 'title.length' })
  if (len(input.body) < REVIEW_LIMITS.body.min || len(input.body) > REVIEW_LIMITS.body.max) errors.push({ field: 'body', key: 'body.length' })
  return errors
}
