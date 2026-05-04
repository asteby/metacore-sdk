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
import type { UserConfig, PluginOption, DepOptimizationOptions } from 'vite'
import react from '@vitejs/plugin-react-swc'
import tailwindcss from '@tailwindcss/vite'

/**
 * Lista de packages `@asteby/metacore-*` (y sus subpaths) que Vite debe
 * pre-bundlear obligatoriamente.
 *
 * Por qué: el monorepo los linkea via `file:`/workspace; pnpm los expone como
 * symlinks y Vite por defecto NO pre-bundlea linked deps. Eso hace que sus
 * `dist/*.js` lleguen al browser con imports bare (`@asteby/metacore-ui/...`,
 * `@asteby/metacore-runtime-react`, etc.) y dispara
 * `Failed to resolve module specifier` en el browser.
 *
 * Forzando el pre-bundling, esbuild reescribe los bare specifiers a rutas
 * resolvibles y todas las apps consumidoras quedan blindadas con una sola
 * línea de config.
 */
export const metacoreOptimizeDepsInclude = [
  '@asteby/metacore-app-providers',
  '@asteby/metacore-auth',
  '@asteby/metacore-notifications',
  '@asteby/metacore-pwa',
  '@asteby/metacore-runtime-react',
  '@asteby/metacore-sdk',
  '@asteby/metacore-starter-core',
  '@asteby/metacore-theme',
  '@asteby/metacore-tools',
  '@asteby/metacore-ui',
  '@asteby/metacore-ui/primitives',
  '@asteby/metacore-ui/lib',
  '@asteby/metacore-ui/data-table',
  '@asteby/metacore-ui/dialogs',
  '@asteby/metacore-ui/layout',
  '@asteby/metacore-ui/hooks',
  '@asteby/metacore-ui/icons',
  '@asteby/metacore-ui/command-menu',
  '@asteby/metacore-websocket',
] as const

export const metacoreOptimizeDeps: DepOptimizationOptions = {
  include: [...metacoreOptimizeDepsInclude],
}

/**
 * Lista canónica de paquetes que TODA app federada (host + addons) debe declarar
 * como `singleton: true` en `@originjs/vite-plugin-federation`. Sin esto, cada
 * remote bundlea su propia copia y se rompen los contextos compartidos
 * (Auth, Theme, Query, Router) además del clásico "Invalid hook call".
 *
 * Reasoning paquete por paquete: `docs/audits/2026-05-04-mf-shared-deps.md`.
 */
export const METACORE_FEDERATION_SINGLETONS = [
  'react',
  'react-dom',
  '@asteby/metacore-runtime-react',
  '@asteby/metacore-theme',
  '@asteby/metacore-auth',
  '@asteby/metacore-ui',
  '@asteby/metacore-sdk',
] as const

/**
 * Forma estructural compatible con la entry de `shared` de
 * `@originjs/vite-plugin-federation`. Se replica acá para evitar un peer dep
 * obligatorio sobre el plugin: la helper sólo arma el objeto, el caller decide
 * si lo pasa a `federation()` o a otra implementación de Module Federation.
 */
export interface MetacoreFederationShareConfig {
  singleton?: boolean
  requiredVersion?: string | false
  strictVersion?: boolean
  version?: string
  eager?: boolean
  shareScope?: string
  packagePath?: string
}

export interface MetacoreFederationOptions {
  /**
   * Nombre del contenedor de federation. Para una app host, el nombre de la
   * app (`'metacore_ops'`). Para un addon, el container name canónico
   * `metacore_<addonKey>` (debe matchear `containerName(manifest)` del SDK).
   */
  host: string
  /**
   * Mapa `name → URL` de remotes a registrar. Típico para hosts:
   * `{ metacore_tickets: 'https://.../remoteEntry.js' }`. Addons usualmente lo omiten.
   */
  apps?: Record<string, string>
  /** Nombre del entry remoto. Default `'remoteEntry.js'` (matchea el contrato del SDK). */
  filename?: string
  /** Módulos expuestos al host. Aplica al lado addon: `{ './plugin': './src/plugin.tsx' }`. */
  exposes?: Record<string, string>
  /**
   * Paquetes adicionales a marcar como `singleton: true` con `requiredVersion: false`,
   * por encima de los obligatorios. Para extras opcionales del ecosistema
   * (`@tanstack/react-query`, `i18next`, `zustand`, `sonner`, ...).
   */
  extras?: string[]
  /**
   * Override per-package — útil si se quiere forzar `requiredVersion: '^X'` para un
   * paquete específico, o desactivar `singleton` puntualmente. Se mergea sobre la
   * entry base.
   */
  overrides?: Record<string, MetacoreFederationShareConfig>
}

export interface MetacoreFederationConfig {
  name: string
  filename: string
  remotes?: Record<string, string>
  exposes?: Record<string, string>
  shared: Record<string, MetacoreFederationShareConfig>
}

/**
 * Devuelve la config de Module Federation con los singletons obligatorios del
 * ecosistema metacore ya cableados. El resultado es un objeto plano que se pasa
 * directamente al plugin (`@originjs/vite-plugin-federation`).
 *
 * Uso típico — host:
 * ```ts
 * import federation from '@originjs/vite-plugin-federation'
 * import { metacoreFederationShared } from '@asteby/metacore-starter-config/vite'
 *
 * federation(metacoreFederationShared({
 *   host: 'metacore_ops',
 *   apps: { metacore_tickets: 'https://addons.example.com/tickets/remoteEntry.js' },
 * }))
 * ```
 *
 * Uso típico — addon:
 * ```ts
 * federation(metacoreFederationShared({
 *   host: 'metacore_tickets',
 *   exposes: { './plugin': './src/plugin.tsx' },
 * }))
 * ```
 *
 * Los 7 singletons obligatorios (`METACORE_FEDERATION_SINGLETONS`) se declaran
 * con `singleton: true, requiredVersion: false` — el host gana en versiones.
 * Cuando los packages estabilicen su contrato federado, pasamos a `^X` por package.
 */
export function metacoreFederationShared(
  opts: MetacoreFederationOptions
): MetacoreFederationConfig {
  const {
    host,
    apps,
    filename = 'remoteEntry.js',
    exposes,
    extras = [],
    overrides = {},
  } = opts

  const shared: Record<string, MetacoreFederationShareConfig> = {}
  for (const name of METACORE_FEDERATION_SINGLETONS) {
    shared[name] = { singleton: true, requiredVersion: false }
  }
  for (const name of extras) {
    shared[name] ??= { singleton: true, requiredVersion: false }
  }
  for (const [name, override] of Object.entries(overrides)) {
    shared[name] = { ...(shared[name] ?? {}), ...override }
  }

  return {
    name: host,
    filename,
    ...(apps ? { remotes: { ...apps } } : {}),
    ...(exposes ? { exposes: { ...exposes } } : {}),
    shared,
  }
}

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
    optimizeDeps: {
      ...metacoreOptimizeDeps,
      ...(extend.optimizeDeps ?? {}),
      include: [
        ...metacoreOptimizeDepsInclude,
        ...(extend.optimizeDeps?.include ?? []),
      ],
    },
  }
}
