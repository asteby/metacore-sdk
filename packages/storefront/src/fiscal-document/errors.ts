export type IdentityDocumentErrorCode =
  /** Over `maxBytes`, or more than `maxPages` pages. */
  | 'too_large'
  /** Does not start with `%PDF-`. */
  | 'not_pdf'
  /** Corrupt, unsupported, or it took longer than `timeoutMs`. */
  | 'unreadable'
  /** A PDF without a text layer (a scan): ask for manual entry. */
  | 'no_text'
  /** Encrypted: it needs a password the buyer has not given. */
  | 'password'
  /** `decodeImageQr`: the file is not an image (or a type the browser cannot decode). */
  | 'not_image'

/** Why a document could not be read. `code` is stable; `message` is for logs (English) and never holds document text. */
export class IdentityDocumentError extends Error {
  override readonly name = 'IdentityDocumentError'
  readonly code: IdentityDocumentErrorCode
  /** Finer cause: `bytes`, `pages`, `timeout`, `aborted`... */
  readonly reason: string | undefined

  constructor(code: IdentityDocumentErrorCode, message: string, options?: { reason?: string; cause?: unknown }) {
    super(message, options?.cause === undefined ? undefined : { cause: options.cause })
    this.code = code
    this.reason = options?.reason
  }
}

export function isIdentityDocumentError(err: unknown): err is IdentityDocumentError {
  return err instanceof IdentityDocumentError || (typeof err === 'object' && err !== null && (err as { name?: unknown }).name === 'IdentityDocumentError')
}
