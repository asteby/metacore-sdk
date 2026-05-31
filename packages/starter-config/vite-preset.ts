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
import { fileURLToPath } from 'node:url'
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
 * como `singleton: true` en `@module-federation/vite`. Sin esto, cada remote
 * bundlea su propia copia y se rompen los contextos compartidos (Auth, Theme,
 * Query, Router) además del crash de React `useState`-null (hooks contra una
 * segunda copia de React).
 *
 * Este contrato DEBE matchear exactamente el `shared` del addon (asteby-hq/addons
 * PR #84) y el del host ops. Orden y miembros idénticos.
 *
 * Reasoning paquete por paquete: `docs/audits/2026-05-04-mf-shared-deps.md`.
 *
 * GOTCHA build-time: `@module-federation/vite` prebuildea y debe RESOLVER cada
 * bare specifier compartido en build-time. Cualquier paquete en esta lista debe
 * estar instalado como (dev)dependency del package que buildea (host o addon).
 * El addon #84 tuvo que agregar `i18next`/`react-i18next` como devDeps por esto.
 */
export const METACORE_FEDERATION_SINGLETONS = [
  'react',
  'react-dom',
  'react/jsx-runtime',
  'react-i18next',
  'i18next',
  '@asteby/metacore-ui',
  '@asteby/metacore-runtime-react',
  '@asteby/metacore-sdk',
  '@asteby/metacore-app-providers',
  '@asteby/metacore-theme',
  '@asteby/metacore-auth',
] as const

/**
 * Forma estructural compatible con la entry de `shared` de
 * `@module-federation/vite`. La helper sólo arma el objeto; el caller lo pasa a
 * `federation()`.
 */
export interface MetacoreFederationShareConfig {
  singleton?: boolean
  requiredVersion?: string | false
  strictVersion?: boolean
  version?: string
  eager?: boolean
  shareScope?: string
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
   * Paquetes adicionales a marcar como `singleton: true`, por encima de los
   * obligatorios. Para extras opcionales del ecosistema
   * (`@tanstack/react-query`, `zustand`, `sonner`, ...).
   *
   * Forma simple — solo nombres, todos heredan `{ singleton: true }`:
   *   `extras: ['@tanstack/react-query', 'zustand']`
   */
  extras?: string[]
  /**
   * Paquetes extra con config explícita por paquete. Mergeado encima de los
   * defaults canónicos. Equivalente a `extras` + `overrides` en una sola llave:
   *   `extra: { lodash: { singleton: true } }`
   * Pensado para el caso típico — "necesito añadir un paquete con su config" —
   * sin pedirle al caller que escriba dos campos separados. Si un paquete aparece
   * tanto en `extras` como en `extra`, gana `extra`.
   */
  extra?: Record<string, MetacoreFederationShareConfig>
  /**
   * Override per-package — útil si se quiere forzar `requiredVersion: '^X'` para un
   * paquete específico, o desactivar `singleton` puntualmente. Se mergea sobre la
   * entry base. Equivalente semántico a `extra` pero la convención es: usar
   * `overrides` para AJUSTAR defaults, `extra` para AÑADIR paquetes nuevos.
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
 * Opciones del federation plugin de `@module-federation/vite`. Esta es la forma
 * que devuelve {@link metacoreFederationShared} y que se pasa directo a
 * `federation(...)`. Tipado mínimo local para evitar un peer dep duro sobre el
 * plugin (la firma real acepta más campos opcionales que acá no usamos).
 */
export interface ModuleFederationViteOptions {
  name: string
  filename: string
  remotes?: Record<string, string>
  exposes?: Record<string, string>
  shared: Record<string, MetacoreFederationShareConfig>
}

/**
 * Devuelve la config de `@module-federation/vite` con los singletons
 * obligatorios del ecosistema metacore ya cableados. El resultado es un objeto
 * plano que se pasa directo al plugin oficial `federation()`.
 *
 * Migración: reemplaza al broken `@originjs/vite-plugin-federation`. El plugin
 * oficial resuelve bien los chunks (remoteEntry.js en la RAÍZ de `dist/`, sin
 * placeholder `__v__css__`, sin doble `assets/`) y respeta el contrato de
 * singletons (el remote usa el React del HOST en vez de bundlear el suyo → fixea
 * el crash de `useState`-null).
 *
 * GOTCHA build-time: `@module-federation/vite` prebuildea y debe RESOLVER cada
 * bare specifier de `shared` en build-time. Por eso TODO paquete del map
 * (incluyendo `i18next`/`react-i18next`) debe ser (dev)dependency instalada del
 * package que buildea.
 *
 * Uso típico — host (remotes vacíos: se registran en runtime vía
 * `registerRemotes` del AddonLoader de runtime-react):
 * ```ts
 * import { federation } from '@module-federation/vite'
 * import { metacoreFederationShared } from '@asteby/metacore-starter-config/vite'
 *
 * federation(metacoreFederationShared({ host: 'metacore_ops' }))
 * ```
 *
 * Uso típico — addon (remote):
 * ```ts
 * federation(metacoreFederationShared({
 *   host: 'metacore_tickets',
 *   exposes: { './register': './src/register.tsx' },
 * }))
 * ```
 *
 * Añadir extras con config explícita:
 * ```ts
 * metacoreFederationShared({
 *   host: 'metacore_ops',
 *   extra: { lodash: { singleton: true } },
 * })
 * ```
 *
 * Los singletons obligatorios (`METACORE_FEDERATION_SINGLETONS`) se declaran con
 * `{ singleton: true }` — UNA copia compartida entre host y addon. Sin esto cada
 * remote bundlea su propio React y crashea en `useState` (hooks contra una
 * segunda copia de React) además de romper los contextos (Auth, Theme, Query,
 * Router). Matchea exactamente el `shared` del addon #84 y del host ops.
 */
export function metacoreFederationShared(
  opts: MetacoreFederationOptions
): ModuleFederationViteOptions {
  const {
    host,
    apps,
    filename = 'remoteEntry.js',
    exposes,
    extras = [],
    extra = {},
    overrides = {},
  } = opts

  const shared: Record<string, MetacoreFederationShareConfig> = {}
  // Defaults canónicos: cada paquete del ecosistema se declara `{ singleton:true }`
  // para garantizar UNA sola copia entre host y addon — fixea el crash de
  // `useState`-null (React duplicado) y mantiene contextos compartidos (Auth,
  // Theme, Query, Router) entre módulos federados.
  for (const name of METACORE_FEDERATION_SINGLETONS) {
    shared[name] = { singleton: true }
  }
  // `extras` (string[]) — paquetes extra que solo necesitan el default singleton.
  for (const name of extras) {
    shared[name] ??= { singleton: true }
  }
  // `extra` (Record) — paquetes nuevos con config explícita. Forma canónica
  // cuando un caller quiere algo distinto al default.
  for (const [name, cfg] of Object.entries(extra)) {
    shared[name] = { singleton: true, ...cfg }
  }
  // `overrides` — ajusta UN paquete existente sin alterar el resto. Se aplica
  // al final para que tenga la última palabra sobre defaults y `extra`.
  for (const [name, override] of Object.entries(overrides)) {
    shared[name] = { ...(shared[name] ?? {}), ...override }
  }

  return {
    name: host,
    filename,
    // Host: remotes vacío por default (se registran dinámicamente en runtime).
    // Si el caller pasa `apps`, se incluyen estáticamente.
    ...(apps ? { remotes: { ...apps } } : {}),
    ...(exposes ? { exposes: { ...exposes } } : {}),
    shared,
  }
}

/**
 * `resolve.alias` entries that EVERY federated addon must inherit.
 *
 * Today this is a single alias: `virtual:pwa-register/react` → a no-op stub
 * shipped inside this package (`./pwa-register-stub.js`).
 *
 * Why: `@asteby/metacore-app-providers` (consumed transitively by most addons,
 * e.g. via `useOrgConfig`) imports `virtual:pwa-register/react` — the module
 * `vite-plugin-pwa` auto-generates. That virtual module ONLY exists when an app
 * actually runs `vite-plugin-pwa`. A FEDERATED addon bundle does not, so the
 * bare `virtual:` specifier resolves to nothing at runtime (`ERR_FAILED` / CORS
 * on the `virtual:` specifier), which tears down the whole addon module and
 * silently drops the federated `register()` — the host then falls back to its
 * generic declarative modal. Marking it `external` is the same trap: it stays
 * unresolved in the browser.
 *
 * The addon is NEVER the PWA owner (the HOST shell registers the service
 * worker), so aliasing it to a no-op stub is correct AND keeps every addon
 * from copy-pasting its own stub + alias. The stub path is resolved relative to
 * THIS module via `import.meta.url`, so it works for the published package
 * (i.e. it does not depend on any path in the consumer's repo).
 *
 * Usage (addon `vite.config.ts`):
 * ```ts
 * import { defineConfig } from 'vite'
 * import { metacoreFederationAliases } from '@asteby/metacore-starter-config/vite'
 *
 * export default defineConfig({
 *   resolve: {
 *     alias: {
 *       ...metacoreFederationAliases,
 *       // ...the addon's own aliases (e.g. '@')
 *     },
 *   },
 *   // ...react(), federation(metacoreFederationShared(...)), etc.
 * })
 * ```
 */
export const metacoreFederationAliases: Record<string, string> = {
  'virtual:pwa-register/react': fileURLToPath(
    new URL('./pwa-register-stub.js', import.meta.url)
  ),
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
