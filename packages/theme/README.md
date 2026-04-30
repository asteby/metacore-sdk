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

## License

Apache-2.0
