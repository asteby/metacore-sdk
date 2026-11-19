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

### Brand backdrop

The backdrop is three radial blobs over a base color. A brand changes the hues
by overriding the variables only — never `background-image` — so pack updates
keep applying (import after `glass.css`):

```css
[data-ui-theme='glass'] {
  --glass-gradient-1: radial-gradient(48rem 34rem at 10% -8%, oklch(0.42 0.1 255 / 0.55), transparent 70%);
  --glass-gradient-2: radial-gradient(40rem 30rem at 105% 20%, oklch(0.5 0.09 250 / 0.4), transparent 68%);
  --glass-gradient-3: radial-gradient(38rem 28rem at 60% 115%, oklch(0.6 0.07 235 / 0.35), transparent 70%);
}
.dark[data-ui-theme='glass'] { /* same three variables for dark */ }
```

`--glass-backdrop` sets the base color under the blobs. Set a gradient to
`none` to drop it.

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

## Contrast contract

Every semantic pair the UI paints is held to WCAG 2.x AA, in light, dark and
the glass pack (measured on the composited surface, over the brightest and
darkest point of the backdrop):

| Pair | Minimum |
| --- | --- |
| `*-foreground` on its surface, `--muted-foreground` on `--card`/`--muted` | 4.5:1 |
| `--primary`, `--destructive`, `--success`/`--warning`/`--info` as text on `--card` and on their own badge tint | 4.5:1 |
| `--input` (control boundary), `--ring` at 50% (focus halo), `--chart-1..8`, `--color-widget-*` on `--card` | 3:1 |

`src/tokens-contrast.test.ts` measures them and fails CI below the minimum,
so a token edit (or a brand pack in a fork) cannot silently regress. The same
math is exported for runtime-derived colors:

```ts
import { contrastRatio, ensureContrast, composite } from '@asteby/metacore-theme/contrast'

contrastRatio('oklch(0.8 0.07 255)', '#14202d') // ≈ 8.6
ensureContrast('#102E6B', '#14202d', 4.5)        // same hue, lifted until it reads
```

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

A vertical can ship its own default pack for a first visit with `defaultAttrs`
(only `data-*` keys with string values are applied, and only while nothing has
been stored — a real user/org pick is never overridden):

```ts
themeBootScript({ defaultAttrs: { 'data-ui-theme': 'glass' } })
```

`@asteby/metacore-theme/boot` has no React import, so it loads in a Node
config. Pass `persistBoot={false}` to the provider to opt out.

## License

Apache-2.0

## Touch tokens (`@asteby/metacore-theme/touch`)

Geometría para pantallas táctiles (kioskos, pantalla de cliente), sin colores ni fuentes:

```ts
import { resolveTouchTokens, touchCss, touchCssVars } from '@asteby/metacore-theme/touch'

const touch = resolveTouchTokens({ minTarget: 72 }) // { minTarget: 72, fontScale: 1.25 }
style.textContent += touchCss(touch, '.kiosk')      // .kiosk{--touch-min-target:72px;--touch-font-scale:1.25}
```

Defaults: `minTarget` 60 px (rango 44–160) y `fontScale` 1.25 (rango 0.75–2). Los primitivos de `@asteby/metacore-ui/touch` leen esas variables con los mismos defaults como fallback.

Encaje con ThemePack: el contrato completo (`ThemePack.tokens`) aún no está en `main`; esto define solo la extensión `tokens.touch?: Partial<TouchTokens>`. Cuando el contrato aterrice, el pack pasa `tokens.touch` por `resolveTouchTokens` y aplica `touchCss` junto al resto de variables.

## Contraste dinámico (`@asteby/metacore-theme/contrast`)

Un solo lugar decide «qué texto va sobre este color». Funciones puras, sin dependencias (WCAG 2.x). Los colores que llegan en
tiempo de ejecución (`brand_primary_color`, `color_field`, tonos) no se pueden resolver con CSS estático: usa estas funciones.

| API | Qué hace |
|---|---|
| `parseColor(s)` | `#rgb[a]`, `#rrggbb[aa]`, `rgb()/rgba()`, `hsl()/hsla()`, `oklch()`, `white/black/transparent`; si no entiende, `null`. |
| `relativeLuminance(c)`, `contrastRatio(fg, bg)` | Luminancia y razón WCAG (1..21). |
| `onColor(bg, {light='#ffffff', dark='#000000', min=4.5})` | Texto con mayor contraste (empate: `light`); si ninguno llega a `min`, ajusta en OKLCH. Con los valores por defecto siempre ≥ 4.58. Un `bg` translúcido se aplana sobre blanco. |
| `ensureContrast(fg, bg, min=4.5, {format})` | Ajusta la luminosidad OKLCH de `fg` en pasos de 0.01 hasta `min`. Devuelve `oklch()` (o `#rrggbb` con `format:'hex'`). |
| `pickBacking(fg, candidates, min?)` | Fondo con mayor contraste contra `fg` (empate: el primero; no parseables se omiten). Con `min`, la lista es un orden de preferencia: gana el primero que llega a `min` (p. ej. color de marca antes que un neutro). |
| `imageTone(url \| ImageBitmap \| img)` (`/image-tone`) | Color medio (gamma, sin premultiplicar) de los píxeles con alfa > 40, rejilla ≤ 256 px, `tone` `light` (≥0.6) / `dark` (≤0.2) / `mid`, `aspect` y `coverage`. Caché por URL; sin CORS, sin canvas o sin píxeles opacos devuelve `'unknown'` (nunca lanza): pinta un fondo neutro con borde. |
| `useOnColor(bg)`, `useImageTone(url)` (`/contrast-react`) | Hooks de React. |

```ts
import { onColor, pickBacking } from '@asteby/metacore-theme/contrast'
import { imageTone } from '@asteby/metacore-theme/image-tone'
onColor('#ec4899') // '#000000' (el blanco daba 3.5:1)
const tone = await imageTone(logoUrl)
const backing = tone === 'unknown' ? '#767676' : pickBacking(tone.color, [brand, '#1f2937', '#ffffff'], 3)
```

CSS: `--tone-{success,warning,danger,info,muted,brand}` + `--on-tone-*` (claro y oscuro, alias de los tokens de estado);
`src/tokens-contrast.test.ts` falla si un par baja de 4.5:1 (texto) o 3:1 (borde/ícono). `contrast-color()` no se usa: elige
solo blanco/negro sin garantía de 4.5:1 en medios tonos, así que el token calculado es la única fuente.

### Vectores de conformidad

`packages/theme/contrast-vectors.json` (también `@asteby/metacore-theme/contrast-vectors.json`): secciones `onColor`,
`ensureContrast`, `pickBacking`, tolerancia de razón 0.01, cadenas exactas. Es copia literal de
`metacore-kernel/colorx/testdata/contrast-vectors.json` (espejo en Go, PR asteby/metacore-kernel#640); `src/color-primitive.test.ts`
los recorre. Si cambia el algoritmo, cambia el archivo en ambos repos a la vez.
