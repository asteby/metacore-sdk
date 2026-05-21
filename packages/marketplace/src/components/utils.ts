/**
 * Tiny utilities shared by the marketplace components. We deliberately
 * avoid pulling `@asteby/metacore-ui` as a peerDep so consumers that
 * don't want the shadcn surface can still use the package — the
 * components target plain Tailwind utility classes plus the brand CSS
 * variables (`--primary`, `--background`, `--border`, …) shipped by
 * `@asteby/metacore-app-providers`.
 *
 * Consumers MUST declare the package as a Tailwind v4 `@source` in
 * their main CSS file or the classes used here will be tree-shaken away
 * by their build. See README → "Tailwind v4 wiring".
 */

/** Conditional class joiner. Pure — no Tailwind merge magic. */
export function cn(
  ...args: Array<string | number | false | null | undefined>
): string {
  return args.filter(Boolean).join(' ')
}
