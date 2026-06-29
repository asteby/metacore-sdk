// Pure, dependency-free badge predicate for the mobile header overflow trigger.
// Kept in its own module (no `@/` aliases, no JSX) so it can be unit-tested in
// the package's node test environment without resolving the component's deps.

/**
 * Whether the aggregate overflow badge should render. A numeric `0` hides it
 * (so hosts can pass a raw count without guarding falsy-zero), as do `false`,
 * `null`, `undefined` and `''`.
 */
export function headerActionsHasBadge(
  badge: number | string | boolean | null | undefined
): boolean {
  if (typeof badge === 'number') return badge !== 0
  if (typeof badge === 'boolean') return badge
  return Boolean(badge)
}
