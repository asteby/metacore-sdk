// metacore.config.ts — Host-level configuration for the metacore panel.
// Edit this file to customize your dashboard appearance and connections.

export const metacoreConfig = {
  /** Display name shown in sidebar and browser title */
  appName: 'Metacore Panel',

  /** Path to logo image (relative to /public) or null for text-only */
  logo: '/logo.svg',

  /** Primary brand color — used for active states, accents */
  primaryColor: '#e11d7e',

  /** URL of the Metacore Hub (marketplace, auth federation) */
  hubUrl: 'https://hub.metacore.dev',

  /** URL of the Metacore Kernel API */
  kernelUrl: 'http://localhost:4000',

  /** Static navigation items for the host app */
  coreNavigation: [
    { label: 'Dashboard', href: '/dashboard', icon: 'LayoutDashboard' },
    { label: 'Settings', href: '/settings', icon: 'Settings' },
  ],
} as const;

export type MetacoreConfig = typeof metacoreConfig;
