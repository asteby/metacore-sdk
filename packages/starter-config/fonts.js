/**
 * Default list of font names used by the metacore starter / FontProvider.
 *
 * Referenced both as a runtime value (to validate cookies, iterate choices in
 * settings UIs) and as a `readonly string[]` source for `FontProvider`'s
 * `fonts` prop in `@asteby/metacore-app-providers`.
 *
 * Apps that want a different catalogue should declare their own array and
 * pass it explicitly — this constant is the shared convention, not a hard
 * requirement.
 *
 * How to add a font (Tailwind v4):
 * 1. Append the slug to this array.
 * 2. Update the consuming app's `index.html` to load the font.
 * 3. Wire the `--font-<slug>` CSS variable in the app's main stylesheet via
 *    `@theme inline { --font-<slug>: '...', var(--font-sans); }`.
 */
export const fonts = ['inter', 'manrope', 'system']
