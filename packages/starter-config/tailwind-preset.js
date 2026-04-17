/**
 * Metacore Tailwind v4 preset (JS shim).
 *
 * Tailwind v4 moves theme config to CSS (@theme / @theme inline). Most design
 * tokens (colors, fonts, shadows, radius, tracking) live in
 * `@asteby/metacore-theme/tokens.css`. This preset is kept for:
 *   - `safelist` entries (utility classes produced dynamically at runtime).
 *   - Optional plugins (registered via `plugins` array).
 *
 * Consumer apps import it from their tailwind config if they still rely on
 * the JS-config path, and ALWAYS define their own `content` globs.
 *
 * Usage (tailwind.config.js):
 *   import preset from '@asteby/metacore-starter-config/tailwind'
 *   export default {
 *     presets: [preset],
 *     content: ['./index.html', './src/**\/*.{ts,tsx}'],
 *   }
 *
 * For the design tokens (oklch palette, dark mode, fonts), import the CSS:
 *   @import '@asteby/metacore-theme/tokens.css';
 */

/** @type {Partial<import('tailwindcss').Config>} */
const preset = {
  darkMode: ['class', '&:is(.dark *)'],
  safelist: [
    // Dynamic status/variant colors used across data tables and badges.
    {
      pattern:
        /^(bg|text|border|ring)-(primary|secondary|accent|destructive|muted|sidebar|chart-[1-5])(\/[0-9]+)?$/,
    },
  ],
  theme: {
    extend: {},
  },
  plugins: [],
}

export default preset
