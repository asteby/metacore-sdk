/** What the «My items» form and the server action share. Plain types: no React, no server code. */
import type { SubjectProblemCode } from '@asteby/storefront'

/** What the buyer is doing. It is the `intent` field of the form. */
/** `subject-refine` (without JavaScript) only echoes the values so the form shows the next level of the cascade. */
export type SubjectIntent = 'subject-save' | 'subject-delete' | 'subject-default' | 'subject-refine'

export type SubjectErrorCode =
  /** A field was rejected (`error.field` says which, `fieldErrors` carries the code per field). */
  | 'validation'
  /** The item is already saved. */
  | 'duplicate'
  /** The kind's limit was reached. */
  | 'limit'
  | 'rate_limited'
  /** No session. */
  | 'unauthorized'
  /** The item is not the buyer's (or no longer exists). */
  | 'not_found'
  /** The store declares no such kind. */
  | 'unsupported'
  /** The store's own credential lacks a permission. */
  | 'store_misconfigured'
  /** Anything else (network, server). */
  | 'unavailable'

/** What the action returns. Texts are NOT here: the components write them (i18n). Never carries a private value. */
export type SubjectActionData = {
  ok: boolean
  intent?: SubjectIntent
  /** The item the form was about (`id` of an edit); absent for a new one. Lets the page reopen the right form after an error. */
  id?: string
  /** The item after a save. */
  subject?: import('@asteby/storefront').Subject
  /** Public values the buyer typed, to refill the form after an error or a refinement (never a private one). */
  values?: Record<string, string>
  /** Per form field name (`attributes.make`) → why. */
  fieldErrors?: Record<string, SubjectProblemCode | 'invalid'>
  error?: { code: SubjectErrorCode; field?: string }
}
