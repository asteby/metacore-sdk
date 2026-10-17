/**
 * Federated pages at build time: lazy page shares, manifest ↔ exposes, router
 * singleton and the per-expose budget measured on a REAL Vite +
 * @module-federation/vite build of a tiny remote.
 * Run: node --test packages/starter-config/test/page-budget.test.js
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync, existsSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  METACORE_FEDERATION_SINGLETONS,
  METACORE_PAGE_MAX_BUDGET_KB,
  METACORE_PAGE_SHARES,
  assertPagesExposed,
  measureExposeBudgets,
  metacoreFederationShared,
  metacorePageBudgetPlugin,
  metacorePageShareConfig,
  metacorePagesFromManifest,
} from '../vite-preset.js'

const here = path.dirname(fileURLToPath(import.meta.url))
const pkgRoot = path.resolve(here, '..')

const manifest = (pages) => ({
  apiVersion: 'asteby.com/v3',
  frontend: { format: 'federation', expose: './register', pages },
})

test('page shares are the kernel closed set, lazy, import:false in remotes', () => {
  assert.deepEqual([...METACORE_PAGE_SHARES].sort(), [
    '@asteby/metacore-charts',
    '@asteby/metacore-maps',
    'maplibre-gl',
    'recharts',
  ])
  assert.deepEqual(metacorePageShareConfig('remote', ['maplibre-gl']), {
    'maplibre-gl': { singleton: true, eager: false, import: false },
  })
  assert.deepEqual(metacorePageShareConfig('host', ['recharts']).recharts, { singleton: true, eager: false })
  assert.throws(() => metacorePageShareConfig('remote', ['leaflet']), /leaflet/)
})

test('router is a singleton; remotes never bundle it', () => {
  assert.ok(METACORE_FEDERATION_SINGLETONS.includes('@tanstack/react-router'))
  const host = metacoreFederationShared({ host: 'metacore_ops' })
  assert.deepEqual(host.shared['@tanstack/react-router'], { singleton: true })
  const remote = metacoreFederationShared({ host: 'metacore_x', exposes: { './register': './src/r.tsx' } })
  assert.deepEqual(remote.shared['@tanstack/react-router'], { singleton: true, import: false })
})

test('manifest pages: exposes required, shares declared lazily, budgets capped', () => {
  const m = manifest([
    { key: 'tower', path: 'tower', expose: './pages/tower', title: 't', shares: ['@asteby/metacore-maps', 'maplibre-gl'], budget_kb: 120 },
    { key: 'report', path: 'report', expose: './pages/report', title: 'r', budget_kb: 900 },
  ])
  assert.deepEqual(metacorePagesFromManifest(m).map((p) => p.budgetKB), [120, METACORE_PAGE_MAX_BUDGET_KB])
  const exposes = { './register': './src/register.tsx', './pages/tower': './src/pages/tower.tsx', './pages/report': './src/pages/report.tsx' }
  const cfg = metacoreFederationShared({ host: 'metacore_shipping', exposes, manifest: m })
  assert.deepEqual(cfg.shared['@asteby/metacore-maps'], { singleton: true, eager: false, import: false })
  assert.deepEqual(cfg.shared['maplibre-gl'], { singleton: true, eager: false, import: false })
  assert.equal(cfg.shared.recharts, undefined)
  assert.throws(
    () => metacoreFederationShared({ host: 'metacore_shipping', exposes: { './register': './r.tsx' }, manifest: m }),
    /\.\/pages\/tower.*exposes do not/
  )
  assert.throws(
    () => assertPagesExposed(manifest([{ key: 'x', path: 'x', expose: './pages/x', title: 'x', shares: ['leaflet'] }]), { './pages/x': 'x' }),
    /leaflet/
  )
  const host = metacoreFederationShared({ host: 'metacore_ops', pageShares: [...METACORE_PAGE_SHARES] })
  assert.deepEqual(host.shared['maplibre-gl'], { singleton: true, eager: false })
})

test('measureExposeBudgets: static closure counted, async reported, shared/virtual excluded', () => {
  const big = 'const x = "' + 'a'.repeat(4000) + '";'
  const bundle = {
    'page.js': {
      type: 'chunk', fileName: 'page.js', facadeModuleId: '/r/src/pages/p.tsx', imports: ['lib.js', 'react.js'], dynamicImports: ['lazy.js'],
      code: big, modules: { '/r/src/pages/p.tsx': { renderedLength: big.length } },
    },
    'lib.js': { type: 'chunk', fileName: 'lib.js', imports: [], dynamicImports: [], code: big, modules: { '/r/src/lib.ts': { renderedLength: 10 } } },
    'react.js': {
      type: 'chunk', fileName: 'react.js', imports: [], dynamicImports: [], code: big,
      modules: { '/r/node_modules/.pnpm/react@19/node_modules/react/index.js': { renderedLength: 10 } },
    },
    'lazy.js': { type: 'chunk', fileName: 'lazy.js', imports: [], dynamicImports: [], code: big, modules: { '/r/src/lazy.ts': { renderedLength: 10 } } },
  }
  const [m] = measureExposeBudgets({ bundle, exposes: { './pages/p': './src/pages/p.tsx' }, root: '/r', sharedPackages: ['react'] })
  assert.deepEqual(m.files, ['page.js', 'lib.js', 'react.js'])
  assert.ok(m.gzipBytes > 0)
  assert.ok(m.asyncGzipBytes > 0)
  const [noReact] = measureExposeBudgets({ bundle, exposes: { './pages/p': './src/pages/p.tsx' }, root: '/r', sharedPackages: [] })
  assert.ok(noReact.gzipBytes > m.gzipBytes, 'the shared react chunk is excluded from the page budget')
  const [missing] = measureExposeBudgets({ bundle, exposes: { './pages/q': './src/pages/q.tsx' }, root: '/r' })
  assert.equal(missing.entry, null)
})

// ---------------------------------------------------------------------------
// Real build (vite 8 + @module-federation/vite, both devDependencies here).
// ---------------------------------------------------------------------------

async function buildRemote({ pageBytes, budgetKB }) {
  const { build } = await import('vite')
  const { federation } = await import('@module-federation/vite')
  const dir = mkdtempSync(path.join(here, '.tmp-remote-'))
  mkdirSync(path.join(dir, 'src', 'pages'), { recursive: true })
  writeFileSync(path.join(dir, 'index.html'), '<!doctype html><script type="module" src="/src/register.js"></script>')
  writeFileSync(path.join(dir, 'src', 'register.js'), 'export default { key: "demo", register() {} }\n')
  writeFileSync(path.join(dir, 'src', 'lib.js'), 'export const helper = (s) => "hello " + s\n')
  // Pseudo-random text so gzip cannot squeeze it to nothing.
  let seed = 7
  const noise = Array.from({ length: pageBytes }, () => {
    seed = (seed * 1103515245 + 12345) % 2147483648
    return String.fromCharCode(97 + (seed % 26))
  }).join('')
  writeFileSync(
    path.join(dir, 'src', 'pages', 'tower.js'),
    `import { helper } from '../lib.js'\nimport maplibre from 'maplibre-gl'\n` +
      `export default function Tower() { return helper(${JSON.stringify(noise)}) + String(maplibre) }\n` +
      `export const later = () => import('../lazy.js')\n`
  )
  writeFileSync(path.join(dir, 'src', 'lazy.js'), `export const z = ${JSON.stringify('z'.repeat(1000))}\n`)
  const m = manifest([
    { key: 'tower', path: 'tower', expose: './pages/tower', title: 't', shares: ['maplibre-gl'], budget_kb: budgetKB },
  ])
  writeFileSync(path.join(dir, 'manifest.json'), JSON.stringify(m))
  const exposes = { './register': './src/register.js', './pages/tower': './src/pages/tower.js' }
  try {
    await build({
      root: dir,
      logLevel: 'silent',
      configFile: false,
      build: { target: 'esnext', modulePreload: false, outDir: 'dist', minify: false },
      plugins: [
        federation({
          name: 'metacore_demo',
          filename: 'remoteEntry.js',
          exposes,
          dts: false,
          // maplibre-gl is NOT installed: import:false means no fallback is
          // bundled, the page reads the host's copy.
          shared: metacorePageShareConfig('remote', ['maplibre-gl']),
        }),
        metacorePageBudgetPlugin({ manifest: 'manifest.json', exposes }),
      ],
    })
    return { dir, error: null }
  } catch (error) {
    return { dir, error }
  }
}

const canBuild = existsSync(path.join(pkgRoot, 'node_modules', '@module-federation', 'vite'))

test('real MF build: page within budget writes metacore-pages.json', { skip: !canBuild }, async () => {
  const { dir, error } = await buildRemote({ pageBytes: 2000, budgetKB: 20 })
  try {
    assert.equal(error, null, String(error))
    const report = JSON.parse(readFileSync(path.join(dir, 'dist', 'metacore-pages.json'), 'utf8'))
    assert.equal(report.version, 1)
    const [page] = report.pages
    assert.equal(page.expose, './pages/tower')
    assert.equal(page.budget_kb, 20)
    assert.ok(page.entry && page.entry.includes('tower'), page.entry)
    assert.ok(page.gzip_bytes > 1000 && page.gzip_bytes < 20 * 1024, String(page.gzip_bytes))
    assert.ok(page.async_gzip_bytes > 0, 'lazy chunk reported apart')
    assert.ok(report.exposes.some((e) => e.expose === './register'))
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('real MF build: page over budget fails the build', { skip: !canBuild }, async () => {
  const { dir, error } = await buildRemote({ pageBytes: 12000, budgetKB: 2 })
  try {
    assert.ok(error, 'build should fail')
    assert.match(String(error?.message ?? error), /page budget exceeded[\s\S]*\.\/pages\/tower \(tower\)/)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})
