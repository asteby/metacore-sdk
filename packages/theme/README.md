# @asteby/metacore-theme

Metacore design tokens and Tailwind 4 preset.

Ships the canonical Metacore visual language:

- `oklch` color palette (light + dark)
- Radius, shadow, tracking and spacing scales
- Font families (`Inter`, `Lora`, `IBM Plex Mono`)
- `@theme inline` block mapping tokens to Tailwind v4 utilities

## Stability

Stable as of v1.0. The token names, CSS variable contract (`--primary`,
`--background`, `--sidebar-*`, ...), `themeConfig` shape and the public
exports below follow semver. Internal `oklch` values may shift in minor
releases when the palette is re-tuned; if your UI depends on exact color
values, pin to a minor range.

## Install

```bash
pnpm add @asteby/metacore-theme
# peer
pnpm add -D tailwindcss@^4
```

## Usage with Tailwind 4

Tailwind 4 is CSS-first. Import the full entry from your app's root stylesheet:

```css
/* src/styles/app.css */
@import '@asteby/metacore-theme/index.css';
```

This gives you:

- `@import 'tailwindcss'`
- `@import 'tw-animate-css'`
- All Metacore tokens (`:root` + `.dark`)
- `@theme inline` exposing `bg-primary`, `text-muted-foreground`, etc.
- Base layer utilities (`.container`, `.no-scrollbar`, `.faded-bottom`)
- Accordion / collapsible animations

If you already have your own Tailwind entry and only want the tokens:

```css
@import 'tailwindcss';
@import '@asteby/metacore-theme/tokens.css';
```

### Glass theme pack

A translucent skin (floating panels, blur + saturation, hairline rim, soft
layered shadows) activated with `<html data-ui-theme="glass">`. It styles the
`data-slot` primitives of `@asteby/metacore-ui` (sidebar, dialogs, sheets,
popovers, selects, inputs, tables) and only sets surfaces — the accent stays
the brand painted by `applyBranding`. Import it after your tokens:

```css
@import '@asteby/metacore-theme/tokens.css';
@import '@asteby/metacore-theme/glass.css';
```

It includes a near-opaque fallback for browsers without `backdrop-filter`
and for `prefers-reduced-transparency`.

#### Host chrome and mobile floating panel (optional variables)

A host with fixed chrome around the shell publishes its sizes on `:root`. All
variables are optional and default to `0`/flat: without them the compiled CSS
behaves exactly as before.

| Variable | Default | Effect |
|---|---|---|
| `--app-topbar-h` | `0px` | Fixed top bar: pushes the inset (and `@asteby/metacore-ui` `Sidebar`) down |
| `--app-notice-h` | `0px` | Notice strip under the top bar (0 when hidden) |
| `--app-bottombar-h` | `0px` | Bottom dock on mobile: bottom margin of the inset and the mobile sidebar sheet |
| `--glass-inset-max-height` | `none` | Cap for the inset when the wrapper is not height-bound, e.g. `calc(100svh - var(--app-topbar-h) - var(--app-notice-h) - 1rem)` |
| `--glass-mobile-gutter` | `0px` | Margin around the inset on phones (e.g. `0.5rem`) |
| `--glass-mobile-radius` | `0px` | Corner radius of the inset on phones (e.g. `var(--glass-radius)`) |
| `--glass-mobile-border-width` | `0px` | Rim width on phones (e.g. `1px`) |
| `--glass-mobile-shadow` | `none` | Shadow on phones (e.g. `var(--glass-highlight), var(--glass-shadow)`) |

```css
:root {
  --app-topbar-h: 3rem;
  --app-bottombar-h: 4rem; /* 0 from sm up if the dock is mobile-only */
  --glass-mobile-gutter: 0.5rem;
  --glass-mobile-radius: var(--glass-radius);
  --glass-mobile-border-width: 1px;
  --glass-mobile-shadow: var(--glass-highlight), var(--glass-shadow);
}
```

An inset with no sidebar sibling (chat-like screens) floats on desktop with
`<SidebarInset data-glass-float>`.

## Usage from JS/TS

For programmatic access (Storybook, charts, PDF):

```ts
import { themeConfig, colorTokens, fonts } from '@asteby/metacore-theme'

themeConfig.colors.light.primary // 'oklch(0.55 0.20 131)'
fonts // readonly ['inter', 'manrope', 'system']
```

Subpath exports:

```ts
import { fonts } from '@asteby/metacore-theme/fonts'
import { themeConfig } from '@asteby/metacore-theme/preset'
```

## Dark mode

Apply the `.dark` class to `<html>` or any ancestor. A `@custom-variant dark` is
registered so Tailwind utilities like `dark:bg-card` work out of the box.

The bundled `<ThemeProvider>` (light/dark/system, cookie-persisted) is the
recommended entry; consumer apps can drop their local copies and use
`useTheme()` for the toggle UI.

## No flash on reload

`<ThemeProvider>` stores what `<html>` ends up painting — light/dark, the
`data-ui-*` attributes (theme pack, font, density), `font-*` classes, inline
custom properties (brand color) and the branding surfaces stylesheet. An inline
script restores it before the first frame, so a returning visitor never sees
the defaults first. First visits follow `prefers-color-scheme`. Transitions stay
off until the providers have mounted (`data-boot-transition` opts an element
out, e.g. a splash that fades).

```ts
// vite.config.ts
import { themeBootScript } from '@asteby/metacore-theme/boot'

plugins: [
  {
    name: 'metacore-theme-boot',
    transformIndexHtml: () => [
      { tag: 'script', children: themeBootScript(), injectTo: 'head-prepend' },
    ],
  },
]
```

`@asteby/metacore-theme/boot` has no React import, so it loads in a Node
config. Pass `persistBoot={false}` to the provider to opt out.

## License

Apache-2.0
