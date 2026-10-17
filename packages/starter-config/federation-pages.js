/**
 * Federated pages (`manifest.frontend.pages[]`) at build time:
 *
 *   - lazy page shares (maps / charts): the closed set the kernel accepts in
 *     `pages[].shares` (`v3.PageShares`), declared `singleton`, never eager,
 *     and `import: false` in remotes so a remote never bundles its own copy;
 *   - a per-expose JavaScript budget measured on the real chunk graph
 *     (gzip, shares and the MF runtime excluded) against `pages[].budget_kb`
 *     (≤ 150), failing the build before publish;
 *   - `metacore-pages.json` in the output: what each page weighs, read by
 *     `metacore build` (it refuses to pack a page over budget) and by the hub.
 *
 * Plain JS (no build step) shared by vite-preset.ts and vite-preset.js.
 */
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { gzipSync } from 'node:zlib'

/** Lazy modules a page may share with the host (kernel `v3.PageShares`). */
export const METACORE_PAGE_SHARES = Object.freeze([
  '@asteby/metacore-maps',
  'maplibre-gl',
  '@asteby/metacore-charts',
  'recharts',
])

/** Kernel `v3.MaxPageBudgetKB`: default and ceiling of `pages[].budget_kb`. */
export const METACORE_PAGE_MAX_BUDGET_KB = 150

/** Report written next to remoteEntry.js. */
export const METACORE_PAGES_REPORT = 'metacore-pages.json'

/** Throws when a share is outside the closed set. */
export function assertMetacorePageShares(shares, where = 'pages[].shares') {
  for (const s of shares ?? []) {
    if (!METACORE_PAGE_SHARES.includes(s)) {
      throw new Error(
        `metacore federation: ${where} lists "${s}". Only ${METACORE_PAGE_SHARES.join(', ')} ` +
          `can be shared lazily with the host; bundle anything else in the page (within its budget).`
      )
    }
  }
}

/**
 * Share config for the lazy page shares. Host: singleton, not eager (the
 * chunk downloads only when a page imports it). Remote: the same plus
 * `import: false` — the host always provides it (installation already checked
 * `ui.maps` / `ui.charts`), so no fallback copy is emitted.
 */
export function metacorePageShareConfig(role, names = METACORE_PAGE_SHARES) {
  assertMetacorePageShares(names, 'pageShares')
  const out = {}
  for (const name of names) {
    out[name] = role === 'remote'
      ? { singleton: true, eager: false, import: false }
      : { singleton: true, eager: false }
  }
  return out
}

/** Read a manifest object or a path to manifest.json (relative to `root`). */
export function readMetacoreManifest(manifest, root = process.cwd()) {
  if (!manifest) return null
  if (typeof manifest === 'object') return manifest
  return JSON.parse(readFileSync(path.resolve(root, manifest), 'utf8'))
}

/** `frontend.pages[]` normalized: expose, shares, effective budget (KB). */
export function metacorePagesFromManifest(manifest) {
  const pages = manifest?.frontend?.pages ?? []
  return pages.map((p) => {
    const b = Number(p.budget_kb ?? 0)
    return {
      key: p.key,
      path: p.path,
      expose: p.expose,
      shares: p.shares ?? [],
      budgetKB: b > 0 ? Math.min(b, METACORE_PAGE_MAX_BUDGET_KB) : METACORE_PAGE_MAX_BUDGET_KB,
    }
  })
}

/**
 * Every page expose must be built: returns the pages and throws with the
 * missing ones (a manifest page without a matching `exposes` entry would only
 * fail on the operator's screen).
 */
export function assertPagesExposed(manifest, exposes) {
  const pages = metacorePagesFromManifest(manifest)
  const missing = pages.filter((p) => !exposes || !(p.expose in exposes))
  if (missing.length > 0) {
    throw new Error(
      `metacore federation: frontend.pages[] declares ${missing.map((p) => `"${p.expose}" (${p.key})`).join(', ')} ` +
        `but the federation exposes do not. Add them to exposes: { '<expose>': './src/pages/<file>.tsx' }.`
    )
  }
  for (const p of pages) assertMetacorePageShares(p.shares, `frontend.pages "${p.key}".shares`)
  return pages
}

// ---------------------------------------------------------------------------
// Per-expose budget on the output bundle
// ---------------------------------------------------------------------------

const VIRTUAL = /^\0|^virtual:|\0virtual:/

function isRuntimeOrShared(id, sharedPackages) {
  if (VIRTUAL.test(id)) return true
  const norm = id.replace(/\\/g, '/')
  if (/\/node_modules\/(?:\.pnpm\/[^/]+\/node_modules\/)?@module-federation\//.test(norm)) return true
  for (const pkg of sharedPackages) {
    if (norm.includes(`/node_modules/${pkg}/`)) return true
  }
  return false
}

function gz(code) {
  return gzipSync(typeof code === 'string' ? Buffer.from(code) : code, { level: 9 }).length
}

// Own gzip bytes of a chunk: the gzip of its code scaled by the share of
// rendered bytes that are NOT shared packages / the MF runtime.
function ownGzip(chunk, sharedPackages) {
  const total = gz(chunk.code)
  const mods = chunk.modules ?? {}
  let all = 0
  let own = 0
  for (const [id, m] of Object.entries(mods)) {
    const len = m?.renderedLength ?? 0
    all += len
    if (!isRuntimeOrShared(id, sharedPackages)) own += len
  }
  if (all === 0) {
    const ids = Object.keys(mods)
    return ids.length > 0 && ids.every((id) => isRuntimeOrShared(id, sharedPackages)) ? 0 : total
  }
  return Math.round(total * (own / all))
}

/**
 * Measure each expose on a Rollup/Rolldown output bundle.
 * `exposes`: `{ './pages/x': './src/pages/x.tsx' }`; `root`: the Vite root.
 * Returns `[{ expose, entry, gzipBytes, asyncGzipBytes, files }]` where
 * `gzipBytes` is the static closure (what the page needs to paint) and
 * `asyncGzipBytes` the code it may lazy-load later.
 */
export function measureExposeBudgets({ bundle, exposes, root, sharedPackages = [] }) {
  const chunks = Object.values(bundle).filter((o) => o.type === 'chunk')
  const byFile = new Map(chunks.map((c) => [c.fileName, c]))
  const assets = new Map(
    Object.values(bundle).filter((o) => o.type === 'asset').map((a) => [a.fileName, a])
  )
  const results = []
  for (const [expose, source] of Object.entries(exposes ?? {})) {
    const abs = path.resolve(root, source).replace(/\\/g, '/')
    const entry = chunks.find((c) => (c.facadeModuleId ?? '').replace(/\\/g, '/').split('?')[0] === abs)
      ?? chunks.find((c) => Object.keys(c.modules ?? {}).some((id) => id.replace(/\\/g, '/').split('?')[0] === abs))
    if (!entry) {
      results.push({ expose, entry: null, gzipBytes: 0, asyncGzipBytes: 0, files: [] })
      continue
    }
    const seen = new Set()
    const files = []
    let gzipBytes = 0
    const css = new Set()
    const walk = (c) => {
      if (!c || seen.has(c.fileName)) return
      seen.add(c.fileName)
      files.push(c.fileName)
      gzipBytes += ownGzip(c, sharedPackages)
      for (const f of c.viteMetadata?.importedCss ?? []) css.add(f)
      for (const imp of c.imports ?? []) walk(byFile.get(imp))
    }
    walk(entry)
    for (const f of css) {
      const a = assets.get(f)
      if (a) {
        gzipBytes += gz(a.source)
        files.push(f)
      }
    }
    // Lazy code reachable from the page (not counted against the budget).
    const asyncSeen = new Set()
    let asyncGzipBytes = 0
    const walkAsync = (c) => {
      for (const d of c.dynamicImports ?? []) {
        const dc = byFile.get(d)
        if (!dc || seen.has(d) || asyncSeen.has(d)) continue
        asyncSeen.add(d)
        asyncGzipBytes += ownGzip(dc, sharedPackages)
        walkAsync(dc)
      }
    }
    for (const f of [...seen]) walkAsync(byFile.get(f))
    results.push({ expose, entry: entry.fileName, gzipBytes, asyncGzipBytes, files })
  }
  return results
}

/**
 * Vite plugin: measure every expose and enforce the page budgets declared in
 * the manifest. Writes `metacore-pages.json` (`{ version, pages: [...],
 * exposes: [...] }`) into the output.
 *
 *   metacorePageBudgetPlugin({ manifest: '../manifest.json', exposes })
 *
 * Exposes that are not pages (`./register`, panels) are reported but only
 * pages have a budget. `sharedPackages` defaults to the federation singletons
 * plus the page shares.
 */
export function metacorePageBudgetPlugin(opts = {}) {
  let root = process.cwd()
  return {
    name: 'metacore-page-budget',
    apply: 'build',
    configResolved(config) {
      root = config.root
    },
    generateBundle(_out, bundle) {
      const manifest = readMetacoreManifest(opts.manifest, root)
      const pages = manifest ? assertPagesExposed(manifest, opts.exposes) : []
      const shared = opts.sharedPackages ?? [...(opts.singletons ?? []), ...METACORE_PAGE_SHARES]
      const measured = measureExposeBudgets({ bundle, exposes: opts.exposes, root, sharedPackages: shared })
      const byExpose = new Map(measured.map((m) => [m.expose, m]))
      const report = {
        version: 1,
        pages: pages.map((p) => {
          const m = byExpose.get(p.expose)
          return {
            key: p.key,
            expose: p.expose,
            budget_kb: p.budgetKB,
            gzip_bytes: m?.gzipBytes ?? 0,
            async_gzip_bytes: m?.asyncGzipBytes ?? 0,
            entry: m?.entry ?? null,
            files: m?.files ?? [],
          }
        }),
        exposes: measured.map((m) => ({
          expose: m.expose,
          gzip_bytes: m.gzipBytes,
          async_gzip_bytes: m.asyncGzipBytes,
          entry: m.entry,
        })),
      }
      const over = report.pages.filter((p) => !p.entry || p.gzip_bytes > p.budget_kb * 1024)
      this.emitFile({
        type: 'asset',
        fileName: opts.reportFile ?? METACORE_PAGES_REPORT,
        source: JSON.stringify(report, null, 2) + '\n',
      })
      if (over.length > 0) {
        const lines = over.map((p) =>
          p.entry
            ? `  ${p.expose} (${p.key}): ${(p.gzip_bytes / 1024).toFixed(1)} KB gzip > budget ${p.budget_kb} KB`
            : `  ${p.expose} (${p.key}): no chunk found for this expose`
        )
        this.error(
          `metacore page budget exceeded:\n${lines.join('\n')}\n` +
            `Split the page with import(), move maps/charts to the host shares ` +
            `(${METACORE_PAGE_SHARES.join(', ')}), or prefer a declarative view.`
        )
      }
    },
  }
}
