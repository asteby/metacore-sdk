/**
 * `shouldRevalidate` for the routes AROUND the checkout (root layout, header, cart badge...). The checkout page saves the
 * chosen delivery with a `fetcher.submit` to its own route; by default a router then re-runs EVERY loader on the page
 * (catalog, session, theme...), which is slow and makes the page jump while the buyer is paying. This keeps those loaders
 * quiet for that submission and leaves everything else (their own forms, navigation) as the router decided.
 *
 * Do NOT use it on the checkout route itself: its loader must re-read the cart (the new total) after the submit.
 * Framework-agnostic: it only reads the fields every router passes (`formMethod`, `formAction`, `defaultShouldRevalidate`).
 */
export type RevalidateArgs = {
  formMethod?: string | undefined
  formAction?: string | undefined
  defaultShouldRevalidate: boolean
}

export type CheckoutRevalidateOptions = {
  /** Paths whose form submissions do not need the other loaders (e.g. `['/pagar']`). Matched on the pathname. */
  paths: readonly string[]
}

export function checkoutShouldRevalidate(options: CheckoutRevalidateOptions): (args: RevalidateArgs) => boolean {
  const paths = options.paths.map((p) => p.replace(/\/+$/, '') || '/')
  return (args) => {
    const method = args.formMethod?.toUpperCase()
    if (!method || method === 'GET' || !args.formAction) return args.defaultShouldRevalidate
    let pathname = args.formAction
    try {
      pathname = new URL(args.formAction, 'http://sf.local').pathname
    } catch {
      /* keep the raw value */
    }
    pathname = pathname.replace(/\/+$/, '') || '/'
    return paths.includes(pathname) ? false : args.defaultShouldRevalidate
  }
}
