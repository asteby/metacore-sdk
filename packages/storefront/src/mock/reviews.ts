// Product reviews for the mock (addon `product_reviews`). Mirrors the server rules a storefront has to rehearse:
// only buyers write, nothing is public until approved, text is plain (no links, e-mail or phone), names are `First L.`,
// and the public payload carries nothing private. `seed` reviews may be in any state.
import type { ProductReview, ReviewSummary } from '../types.js'

export type MockReviewSeed = {
  /** Handle of the product. */
  product_handle: string
  rating: number
  title?: string
  body: string
  display_name: string
  /** ISO date shown (default: now). */
  created_at?: string
  /** Default `approved`. */
  status?: 'pending' | 'approved' | 'rejected'
  /** Id of the mock customer who wrote it (to try `mine` / edit / delete). */
  customer_id?: string
  brand_reply?: string
  market?: string
}

export type MockReviewOptions = {
  seed?: MockReviewSeed[]
  /**
   * Who counts as a buyer of a product. Default: a customer whose orders have a line titled like the product
   * (`cus_1` bought «Playera básica»). `() => true` lets everybody review (to rehearse the form).
   */
  purchased?: (customerId: string, handle: string) => boolean
}

export type MockReviewRecord = MockReviewSeed & { id: string; created_at: string; status: 'pending' | 'approved' | 'rejected'; withdrawn?: boolean }

const URL_RE = /(https?:\/\/|ftp:\/\/|www\.|\/\/[a-z0-9])/i
const DOMAIN_RE = /\b[a-z0-9][a-z0-9-]{1,}\.(com|mx|net|org|io|co|us|info|biz|ly|me|shop|store|xyz|app|dev|online|site|link|click|top|ru|cn)\b/i
const EMAIL_RE = /[A-Za-z0-9._%+-]+\s?(@|\(at\)|\[at\])\s?[A-Za-z0-9.-]+/
const PHONE_RE = /\+?\d[\d\s().-]{6,}\d/g

/** Plain text: tags and angle brackets removed, control characters dropped, spaces collapsed. */
export function cleanReviewText(s: string): string {
  return s
    .replace(/\r\n?/g, '\n')
    .replace(/<[^>]*>/g, '')
    .replace(/[<>]/g, '')
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u0009\u000b-\u001f\u007f-\u009f\u2028\u2029]/g, ' ')
    .replace(/[ \t]+/g, ' ')
    .split('\n')
    .map((l) => l.trim())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

/** `null` when the text is acceptable, else the reason. */
export function reviewTextProblem(text: string, min: number, max: number): 'length' | 'links_not_allowed' | 'personal_data' | null {
  const n = [...text].length
  if (n < min || n > max) return 'length'
  if (EMAIL_RE.test(text)) return 'personal_data'
  if (URL_RE.test(text) || DOMAIN_RE.test(text)) return 'links_not_allowed'
  for (const m of text.match(PHONE_RE) ?? []) if (m.replace(/\D/g, '').length >= 9) return 'personal_data'
  return null
}

/** Any name as `First L.`; a name with digits or symbols is dropped (`''`). */
export function publicReviewName(raw: string): string {
  const t = cleanReviewText(raw)
  if (!t || /[@0-9_/\\:;,+=#$%&*!?]/.test(t)) return ''
  const words = t
    .split(/\s+/)
    .map((w) => w.replace(/^[.\-']+|[.\-']+$/g, ''))
    .filter((w) => w && /^[\p{L}'-]+$/u.test(w))
  if (!words.length) return ''
  const cap = (w: string) => w.charAt(0).toLocaleUpperCase() + w.slice(1).toLocaleLowerCase()
  const first = cap(words[0]!).slice(0, 24)
  return words.length === 1 ? first : `${first} ${words[words.length - 1]!.charAt(0).toLocaleUpperCase()}.`
}

export function summarizeReviews(rows: { rating: number }[]): ReviewSummary {
  const distribution = { '1': 0, '2': 0, '3': 0, '4': 0, '5': 0 } as ReviewSummary['distribution']
  let total = 0
  for (const r of rows) {
    distribution[String(r.rating) as keyof ReviewSummary['distribution']]++
    total += r.rating
  }
  return { count: rows.length, average: rows.length ? Math.round((total / rows.length) * 100) / 100 : 0, distribution }
}

export function toPublicReview(r: MockReviewRecord): ProductReview {
  return {
    id: r.id,
    rating: r.rating,
    title: r.title ?? '',
    body: r.body,
    display_name: r.display_name,
    created_at: r.created_at,
    ...(r.brand_reply ? { brand_reply: { body: r.brand_reply, created_at: r.created_at } } : {}),
  }
}
