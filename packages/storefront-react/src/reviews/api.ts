import type { MyReview, ProductReview, ReviewEligibility, ReviewInput, ReviewList, ReviewListParams, StorefrontClient } from '@asteby/storefront'

/**
 * What `ProductReviews` needs from the server. In a browser the store provides it through ITS OWN routes (the
 * `sk_` token and the shopper session never travel to the page): `reviewsApiFromClient` adapts a server-side client
 * (SSR route actions, tests, the mock), and a store writes a small `fetch` adapter for the browser.
 */
export type ReviewsApi = {
  list: (handle: string, params?: ReviewListParams) => Promise<ReviewList | null>
  eligibility: (handle: string) => Promise<ReviewEligibility>
  create: (handle: string, input: ReviewInput) => Promise<{ id: string; status: 'pending' }>
}

export function reviewsApiFromClient(client: Pick<StorefrontClient, 'reviews'>, options?: { reviewGrant?: string | null }): ReviewsApi {
  const grant = options?.reviewGrant ? { reviewGrant: options.reviewGrant } : undefined
  return {
    list: (handle, params) => client.reviews.list(handle, params),
    eligibility: (handle) => client.reviews.eligibility(handle, grant),
    create: (handle, input) => client.reviews.create(handle, input, grant),
  }
}

export type { MyReview, ProductReview }
