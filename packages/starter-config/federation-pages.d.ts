import type { Plugin } from 'vite'

export declare const METACORE_PAGE_SHARES: readonly [
  '@asteby/metacore-maps',
  'maplibre-gl',
  '@asteby/metacore-charts',
  'recharts',
]
export type MetacorePageShare = (typeof METACORE_PAGE_SHARES)[number]
export declare const METACORE_PAGE_MAX_BUDGET_KB: 150
export declare const METACORE_PAGES_REPORT: 'metacore-pages.json'

export interface MetacorePageShareConfig {
  singleton: true
  eager: false
  import?: false
}

export interface MetacoreManifestLike {
  frontend?: {
    pages?: Array<{
      key: string
      path: string
      expose: string
      shares?: string[]
      budget_kb?: number
      [k: string]: unknown
    }>
    [k: string]: unknown
  }
  [k: string]: unknown
}

export interface MetacorePageInfo {
  key: string
  path: string
  expose: string
  shares: string[]
  /** Effective budget, gzip KB (budget_kb capped at 150; 0/absent = 150). */
  budgetKB: number
}

export interface ExposeBudget {
  expose: string
  entry: string | null
  /** Static closure, gzip, shares and MF runtime excluded. */
  gzipBytes: number
  /** Lazy code the expose may load later (reported, not budgeted). */
  asyncGzipBytes: number
  files: string[]
}

export declare function assertMetacorePageShares(shares: readonly string[] | undefined, where?: string): void
export declare function metacorePageShareConfig(
  role: 'host' | 'remote',
  names?: readonly string[],
): Record<string, MetacorePageShareConfig>
export declare function readMetacoreManifest(
  manifest: string | MetacoreManifestLike | undefined | null,
  root?: string,
): MetacoreManifestLike | null
export declare function metacorePagesFromManifest(manifest: MetacoreManifestLike | null | undefined): MetacorePageInfo[]
export declare function assertPagesExposed(
  manifest: MetacoreManifestLike,
  exposes: Record<string, string> | undefined,
): MetacorePageInfo[]
export declare function measureExposeBudgets(args: {
  bundle: Record<string, unknown>
  exposes: Record<string, string> | undefined
  root: string
  sharedPackages?: readonly string[]
}): ExposeBudget[]

export interface MetacorePageBudgetPluginOptions {
  /** manifest.json path (relative to the Vite root) or the parsed manifest. */
  manifest?: string | MetacoreManifestLike
  /** The same `exposes` passed to federation(). */
  exposes?: Record<string, string>
  /** Packages excluded from the measure (default: singletons + page shares). */
  sharedPackages?: readonly string[]
  /** Federation singletons to exclude in addition to the page shares. */
  singletons?: readonly string[]
  /** Report file name in the output (default metacore-pages.json). */
  reportFile?: string
}
export declare function metacorePageBudgetPlugin(opts?: MetacorePageBudgetPluginOptions): Plugin
