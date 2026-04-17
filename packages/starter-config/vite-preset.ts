/**
 * Metacore Vite preset — `defineMetacoreConfig()` returns a base Vite config
 * with React SWC, Tailwind 4, tsconfig-paths, optional TanStack Router and
 * optional PWA. Apps call it and merge their own `resolve.alias`,
 * `server`, or extra plugins.
 *
 * Usage (vite.config.ts):
 *   import { defineMetacoreConfig } from '@asteby/metacore-starter-config/vite'
 *   export default defineMetacoreConfig({
 *     pwa: { name: 'Ops', short_name: 'Ops', themeColor: '#84cc16' },
 *     router: true,
 *   })
 */
import type { UserConfig, PluginOption } from 'vite'
import react from '@vitejs/plugin-react-swc'
import tailwindcss from '@tailwindcss/vite'

export interface MetacorePwaOptions {
  name: string
  shortName?: string
  description?: string
  themeColor?: string
  backgroundColor?: string
  startUrl?: string
  /** Pre-built manifest icons array. If omitted, PWA is registered without icons. */
  icons?: unknown[]
  /** Extra manifest fields merged verbatim. */
  manifestExtra?: Record<string, unknown>
  /** sw strategy — defaults to 'injectManifest' (matches starter). */
  strategies?: 'generateSW' | 'injectManifest'
  srcDir?: string
  filename?: string
}

export interface DefineMetacoreConfigOptions {
  /** Enable TanStack Router plugin (autoCodeSplitting). Default: true. */
  router?: boolean
  /** TanStack Router `routeFileIgnorePattern`. */
  routerIgnorePattern?: string
  /** Enable vite-plugin-pwa. Pass options or `false` to disable. Default: false. */
  pwa?: MetacorePwaOptions | false
  /** Extra plugins appended after metacore defaults. */
  extraPlugins?: PluginOption[]
  /** Extra Vite config merged shallowly. */
  extend?: UserConfig
}

export async function defineMetacoreConfig(
  options: DefineMetacoreConfigOptions = {}
): Promise<UserConfig> {
  const {
    router = true,
    routerIgnorePattern = '.((css|styl|less|sass|scss)|d.ts)$|components/.*',
    pwa = false,
    extraPlugins = [],
    extend = {},
  } = options

  const plugins: PluginOption[] = []

  if (router) {
    const { tanstackRouter } = await import('@tanstack/router-plugin/vite')
    plugins.push(
      tanstackRouter({
        target: 'react',
        autoCodeSplitting: true,
        routeFileIgnorePattern: routerIgnorePattern,
      })
    )
  }

  plugins.push(react(), tailwindcss())

  if (pwa) {
    const { VitePWA } = await import('vite-plugin-pwa')
    plugins.push(
      VitePWA({
        strategies: pwa.strategies ?? 'injectManifest',
        srcDir: pwa.srcDir ?? 'src',
        filename: pwa.filename ?? 'sw.js',
        registerType: 'prompt',
        includeAssets: ['images/**/*'],
        manifest: {
          name: pwa.name,
          short_name: pwa.shortName ?? pwa.name,
          description: pwa.description,
          theme_color: pwa.themeColor ?? '#84cc16',
          background_color: pwa.backgroundColor ?? '#1a2e05',
          start_url: pwa.startUrl ?? '/',
          display: 'standalone',
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          ...(pwa.icons ? { icons: pwa.icons as any } : {}),
          ...(pwa.manifestExtra ?? {}),
        },
        injectManifest: {
          globPatterns: ['**/*.{js,css,html,ico,png,svg,woff,woff2}'],
        },
        devOptions: { enabled: true, type: 'module' },
      })
    )
  }

  plugins.push(...extraPlugins)

  return {
    ...extend,
    plugins: [...plugins, ...(extend.plugins ?? [])],
  }
}
