/**
 * Metacore theme preset.
 *
 * The canonical source for Tailwind 4 design tokens lives in CSS
 * (`@asteby/metacore-theme/tokens.css` and `/index.css`). Tailwind 4 does
 * not use JS presets the way v3 did — consumers should import the CSS
 * entry directly via `@import '@asteby/metacore-theme/index.css'` or
 * `@import '@asteby/metacore-theme/tokens.css'`.
 *
 * This module exposes the same tokens as plain JS objects for cases where
 * a JS/TS consumer needs programmatic access (e.g., Storybook theming,
 * charting libraries, PDF generators).
 */

export const colorTokens = {
  light: {
    background: 'oklch(0.9940 0 0)',
    foreground: 'oklch(0 0 0)',
    card: 'oklch(0.9940 0 0)',
    cardForeground: 'oklch(0 0 0)',
    popover: 'oklch(0.9911 0 0)',
    popoverForeground: 'oklch(0 0 0)',
    primary: 'oklch(0.55 0.20 131)',
    primaryForeground: 'oklch(1.0000 0 0)',
    secondary: 'oklch(0.9540 0.0063 131)',
    secondaryForeground: 'oklch(0.1344 0 0)',
    muted: 'oklch(0.9702 0 0)',
    mutedForeground: 'oklch(0.4386 0 0)',
    accent: 'oklch(0.94 0.03 131)',
    accentForeground: 'oklch(0.5445 0.1903 131)',
    destructive: 'oklch(0.6290 0.1902 23.0704)',
    destructiveForeground: 'oklch(1.0000 0 0)',
    border: 'oklch(0.9300 0.0094 131)',
    input: 'oklch(0.9401 0 0)',
    ring: 'oklch(0 0 0)',
  },
  dark: {
    background: 'oklch(0.22 0.01 131)',
    foreground: 'oklch(0.9551 0 0)',
    card: 'oklch(0.24 0.01 131)',
    cardForeground: 'oklch(0.9551 0 0)',
    popover: 'oklch(0.24 0.01 131)',
    popoverForeground: 'oklch(0.9551 0 0)',
    primary: 'oklch(0.65 0.20 131)',
    primaryForeground: 'oklch(1.0000 0 0)',
    secondary: 'oklch(0.29 0.02 131)',
    secondaryForeground: 'oklch(0.9551 0 0)',
    muted: 'oklch(0.29 0.02 131)',
    mutedForeground: 'oklch(0.7058 0 0)',
    accent: 'oklch(0.28 0.05 131)',
    accentForeground: 'oklch(0.80 0.10 131)',
    destructive: 'oklch(0.7106 0.1661 22.2162)',
    destructiveForeground: 'oklch(1.0000 0 0)',
    border: 'oklch(0.33 0.02 131)',
    input: 'oklch(0.33 0.02 131)',
    ring: 'oklch(0.65 0.20 131)',
  },
} as const

export const chartTokens = {
  light: {
    chart1: 'oklch(0.7459 0.1483 156.4499)',
    chart2: 'oklch(0.55 0.20 131)',
    chart3: 'oklch(0.7336 0.1758 50.5517)',
    chart4: 'oklch(0.5828 0.1809 131)',
    chart5: 'oklch(0.5590 0 0)',
  },
  dark: {
    chart1: 'oklch(0.8003 0.1821 151.7110)',
    chart2: 'oklch(0.65 0.20 131)',
    chart3: 'oklch(0.8077 0.1035 19.5706)',
    chart4: 'oklch(0.6691 0.1569 131)',
    chart5: 'oklch(0.7058 0 0)',
  },
} as const

export const radiusTokens = {
  base: '1.4rem',
  sm: 'calc(1.4rem - 4px)',
  md: 'calc(1.4rem - 2px)',
  lg: '1.4rem',
  xl: 'calc(1.4rem + 4px)',
} as const

export const shadowTokens = {
  '2xs': '0px 2px 3px 0px hsl(0 0% 0% / 0.08)',
  xs: '0px 2px 3px 0px hsl(0 0% 0% / 0.08)',
  sm: '0px 2px 3px 0px hsl(0 0% 0% / 0.16), 0px 1px 2px -1px hsl(0 0% 0% / 0.16)',
  base: '0px 2px 3px 0px hsl(0 0% 0% / 0.16), 0px 1px 2px -1px hsl(0 0% 0% / 0.16)',
  md: '0px 2px 3px 0px hsl(0 0% 0% / 0.16), 0px 2px 4px -1px hsl(0 0% 0% / 0.16)',
  lg: '0px 2px 3px 0px hsl(0 0% 0% / 0.16), 0px 4px 6px -1px hsl(0 0% 0% / 0.16)',
  xl: '0px 2px 3px 0px hsl(0 0% 0% / 0.16), 0px 8px 10px -1px hsl(0 0% 0% / 0.16)',
  '2xl': '0px 2px 3px 0px hsl(0 0% 0% / 0.40)',
} as const

export const fontTokens = {
  sans: 'Inter, sans-serif',
  serif: 'Lora, serif',
  mono: 'IBM Plex Mono, monospace',
} as const

export const trackingTokens = {
  normal: '-0.025em',
} as const

export const themeConfig = {
  colors: colorTokens,
  charts: chartTokens,
  radius: radiusTokens,
  shadows: shadowTokens,
  fonts: fontTokens,
  tracking: trackingTokens,
} as const

export type ThemeConfig = typeof themeConfig
