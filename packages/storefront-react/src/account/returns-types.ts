/** What the return form and its server action share. Plain types: no React, no server code. */
import type { ReturnReason, ReturnRequest } from '@asteby/storefront'

export type { ReturnReason, ReturnRequest } from '@asteby/storefront'

/** The `intent` field of the return form. */
export type ReturnIntent = 'request-return'

/** A field the buyer can fix. `lines` is the list as a whole (nothing chosen). */
export type ReturnFieldErrorCode = 'lines_required' | 'invalid_quantity' | 'invalid_reason' | 'notes_too_long' | 'invalid'

export type ReturnErrorCode =
  /** One or more fields are wrong: see `fieldErrors`. */
  | 'validation'
  /** The buyer has no session (or it expired): ask them to sign in. */
  | 'unauthorized'
  | 'not_found'
  /** The order cannot be returned (not delivered, window over, or the server said 409). */
  | 'not_returnable'
  | 'rate_limited'
  /** The store's credential lacks permission: not the buyer's fault. */
  | 'store_misconfigured'
  | 'unavailable'

/** What the buyer typed, so a page without JavaScript can show it again after an error. */
export type ReturnFormValues = {
  /** Chosen quantity per SKU (only the lines that were checked). */
  lines: Record<string, number>
  reason: string
  notes: string
}

/**
 * `fieldErrors` keys: `lines` (nothing chosen), `lines.<index>` (the quantity of the line at that position of
 * `returnableLines(order)`), `reason`, `notes`.
 */
export type ReturnRequestActionData =
  | { ok: true; intent: ReturnIntent; orderId: string; request: ReturnRequest }
  | {
      ok: false
      intent?: ReturnIntent
      error: { code: ReturnErrorCode }
      fieldErrors?: Record<string, ReturnFieldErrorCode>
      values?: ReturnFormValues
    }

