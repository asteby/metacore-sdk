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
    primary: 'oklch(0.51 0.14 175)',
    primaryForeground: 'oklch(1.0000 0 0)',
    secondary: 'oklch(0.9540 0.0063 175)',
    secondaryForeground: 'oklch(0.1344 0 0)',
    muted: 'oklch(0.9702 0 0)',
    mutedForeground: 'oklch(0.4386 0 0)',
    accent: 'oklch(0.94 0.03 175)',
    accentForeground: 'oklch(0.49 0.11 175)',
    destructive: 'oklch(0.52 0.19 23)',
    destructiveForeground: 'oklch(1.0000 0 0)',
    border: 'oklch(0.9300 0.0094 175)',
    input: 'oklch(0.64 0 0)',
    ring: 'oklch(0 0 0)',
    success: 'oklch(0.48 0.13 155)',
    successForeground: 'oklch(1 0 0)',
    warning: 'oklch(0.5 0.13 60)',
    warningForeground: 'oklch(1 0 0)',
    info: 'oklch(0.49 0.13 235)',
    infoForeground: 'oklch(1 0 0)',
  },
  dark: {
    background: 'oklch(0.22 0.01 131)',
    foreground: 'oklch(0.9551 0 0)',
    card: 'oklch(0.24 0.01 131)',
    cardForeground: 'oklch(0.9551 0 0)',
    popover: 'oklch(0.24 0.01 131)',
    popoverForeground: 'oklch(0.9551 0 0)',
    primary: 'oklch(0.65 0.14 175)',
    primaryForeground: 'oklch(0.18 0 0)',
    secondary: 'oklch(0.29 0.02 175)',
    secondaryForeground: 'oklch(0.9551 0 0)',
    muted: 'oklch(0.29 0.02 175)',
    mutedForeground: 'oklch(0.7058 0 0)',
    accent: 'oklch(0.28 0.05 175)',
    accentForeground: 'oklch(0.80 0.10 175)',
    destructive: 'oklch(0.7106 0.1661 22.2162)',
    destructiveForeground: 'oklch(0.18 0 0)',
    border: 'oklch(0.33 0.02 175)',
    input: 'oklch(0.55 0.02 175)',
    ring: 'oklch(0.8 0.12 175)',
    success: 'oklch(0.78 0.14 155)',
    successForeground: 'oklch(0.18 0 0)',
    warning: 'oklch(0.82 0.14 80)',
    warningForeground: 'oklch(0.18 0 0)',
    info: 'oklch(0.78 0.11 235)',
    infoForeground: 'oklch(0.18 0 0)',
  },
} as const

export const chartTokens = {
  light: {
    chart1: 'oklch(0.62 0.14 156)',
    chart2: 'oklch(0.51 0.14 175)',
    chart3: 'oklch(0.64 0.16 50)',
    chart4: 'oklch(0.55 0.12 250)',
    chart5: 'oklch(0.56 0 0)',
    chart6: 'oklch(0.58 0.17 25)',
    chart7: 'oklch(0.6 0.12 85)',
    chart8: 'oklch(0.55 0.1 210)',
  },
  dark: {
    chart1: 'oklch(0.8 0.18 152)',
    chart2: 'oklch(0.72 0.14 175)',
    chart3: 'oklch(0.81 0.1 20)',
    chart4: 'oklch(0.75 0.11 250)',
    chart5: 'oklch(0.71 0 0)',
    chart6: 'oklch(0.74 0.15 25)',
    chart7: 'oklch(0.82 0.12 85)',
    chart8: 'oklch(0.78 0.1 210)',
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

/**
 * Motion tokens. Durations follow a small scale (feedback → layout moves);
 * easings are "standard" (enter/move), "emphasized" (larger travel) and
 * "exit". CSS: `--motion-duration-*` / `--motion-ease-*` in tokens.css.
 * Consumers must honour prefers-reduced-motion (tokens.css zeroes the
 * durations under `reduce`).
 */
export const motionTokens = {
  duration: {
    instant: '100ms',
    fast: '150ms',
    moderate: '220ms',
    slow: '320ms',
  },
  easing: {
    standard: 'cubic-bezier(0.2, 0, 0, 1)',
    emphasized: 'cubic-bezier(0.3, 0, 0, 1)',
    exit: 'cubic-bezier(0.4, 0, 1, 1)',
  },
} as const

export const themeConfig = {
  colors: colorTokens,
  charts: chartTokens,
  radius: radiusTokens,
  shadows: shadowTokens,
  fonts: fontTokens,
  tracking: trackingTokens,
  motion: motionTokens,
} as const

export type ThemeConfig = typeof themeConfig
