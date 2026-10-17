/**
 * `create-metacore-addon add view` + the `embedded-page` template.
 *
 * add view: runs the compiled CLI against a copy of fixtures/views/base.json
 * and compares the manifest with the golden file of each view type
 * (fixtures/views/<case>.json). The SAME golden files are validated by the
 * kernel in Go (cli/create_addon_fixtures_test.go → v3.Validate), so a
 * generator change that the kernel would reject fails CI.
 * Regenerate goldens: UPDATE_GOLDEN=1 pnpm --filter create-metacore-addon test
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { copyFileSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const CLI = path.resolve(__dirname, '..', 'bin', 'index.js')
const FIX = path.join(__dirname, 'fixtures', 'views')

function run(args, cwd) {
  return spawnSync(process.execPath, [CLI, ...args], {
    cwd,
    encoding: 'utf8',
    env: { ...process.env, FORCE_COLOR: '0' },
  })
}

function withBase(fn) {
  const dir = mkdtempSync(path.join(tmpdir(), 'metacore-add-view-'))
  copyFileSync(path.join(FIX, 'base.json'), path.join(dir, 'manifest.json'))
  try {
    return fn(dir)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

const CASES = {
  map: ['--type', 'map', '--title', 'shipping.nav.map'],
  timeline: ['--type', 'timeline', '--title', 'shipping.nav.activity', '--date-field', 'eta'],
  calendar: ['--type', 'calendar', '--title', 'shipping.nav.calendar'],
  chart: ['--type', 'chart', '--title', 'shipping.nav.by_carrier', '--group-by', 'carrier'],
  'chart-line-sum': ['--type', 'chart', '--chart-kind', 'line', '--aggregate', 'sum', '--field', 'cost', '--date-field', 'eta'],
  split: ['--type', 'split', '--title', 'shipping.nav.shipments', '--columns', 'tracking_number,carrier,status,eta'],
}

for (const [name, args] of Object.entries(CASES)) {
  test(`add view: ${name} matches the golden manifest`, () => {
    withBase((dir) => {
      const res = run(['add', 'view', ...args, '--model', 'Shipment', dir], dir)
      assert.equal(res.status, 0, res.stderr)
      const got = JSON.parse(readFileSync(path.join(dir, 'manifest.json'), 'utf8'))
      const golden = path.join(FIX, `${name}.json`)
      if (process.env.UPDATE_GOLDEN === '1' || !existsSync(golden)) {
        writeFileSync(golden, JSON.stringify(got, null, 2) + '\n')
      }
      assert.deepEqual(got, JSON.parse(readFileSync(golden, 'utf8')))
      const item = got.contributions.navigation[0].items.at(-1)
      assert.equal(item.view_type, args[1])
      assert.deepEqual(Object.keys(item.view), [args[1]], 'exactly the block of its view_type')
    })
  })
}

test('add view: infers map coordinates and popup from the model', () => {
  withBase((dir) => {
    const res = run(['add', 'view', '--type', 'map', '--dry-run', dir], dir)
    assert.equal(res.status, 0, res.stderr)
    const item = JSON.parse(res.stdout)
    assert.deepEqual(item.view.map.point, { lat: 'dest_lat', lng: 'dest_lng' })
    assert.equal(item.view.map.color_by, 'status')
    assert.deepEqual(item.view.map.popup, ['tracking_number', 'status'])
  })
})

test('add view: rejects unknown columns, types and duplicates with the flag to fix', () => {
  withBase((dir) => {
    let res = run(['add', 'view', '--type', 'map', '--lat', 'nope', dir], dir)
    assert.notEqual(res.status, 0)
    assert.match(res.stderr, /--lat "nope" is not a column of model "Shipment"/)
    res = run(['add', 'view', '--type', 'gantt', dir], dir)
    assert.notEqual(res.status, 0)
    assert.match(res.stderr, /--type must be one of map, timeline, calendar, chart, split/)
    assert.equal(run(['add', 'view', '--type', 'split', dir], dir).status, 0)
    res = run(['add', 'view', '--type', 'split', dir], dir)
    assert.notEqual(res.status, 0)
    assert.match(res.stderr, /already has a split view/)
  })
})

test('embedded-page template: page in pages[], expose built, API route, declarative view, test', () => {
  const tmp = mkdtempSync(path.join(tmpdir(), 'metacore-addon-embedded-'))
  try {
    const res = run(['my-addon', '--template', 'embedded-page', '--key', 'my_addon', '--author', 'Asteby Tests', '--no-install'], tmp)
    assert.equal(res.status, 0, res.stderr)
    const dir = path.join(tmp, 'my-addon')
    const read = (p) => readFileSync(path.join(dir, p), 'utf8')
    for (const f of ['manifest.json', 'README.md', 'frontend/vite.config.ts', 'frontend/src/pages/board.tsx', 'frontend/src/pages/board.test.tsx', 'frontend/src/register.tsx', 'frontend/src/dev.tsx', 'backend/main.go']) {
      assert.doesNotMatch(read(f), /\{\{[A-Z_]+\}\}/, `${f} keeps placeholders`)
    }
    const m = JSON.parse(read('manifest.json'))
    const [page] = m.frontend.pages
    assert.deepEqual(
      { key: page.key, path: page.path, expose: page.expose, layout: page.layout, budget_kb: page.budget_kb },
      { key: 'board', path: 'board', expose: './pages/board', layout: 'shell', budget_kb: 60 },
    )
    assert.equal(m.frontend.expose, './register')
    assert.ok(m.contributions.navigation[0].items.some((i) => i.url === 'addon://my_addon/board'))
    assert.ok(m.contributions.navigation[0].items.some((i) => i.view_type === 'split'), 'declarative view next to the page')
    assert.deepEqual(m.contributions.api[0], {
      key: 'summary', method: 'GET', path: '/my_addon/summary', auth: 'staff', cache: { private: true }, do: 'wasm:summary',
    })
    const vite = read('frontend/vite.config.ts')
    assert.match(vite, /'\.\/pages\/board': '\.\/src\/pages\/board\.tsx'/)
    assert.match(vite, /metacoreFederationShared\(\{ host: 'metacore_my_addon', exposes, manifest \}\)/)
    assert.match(vite, /metacorePageBudgetPlugin/)
    const pageSrc = read('frontend/src/pages/board.tsx')
    assert.match(pageSrc, /definePage/)
    assert.match(pageSrc, /useHostApi\(\)/)
    assert.doesNotMatch(pageSrc, /localStorage|auth_token|window\.location/)
    assert.match(read('backend/main.go'), /\/\/go:export summary/)
    assert.match(read('README.md'), /Why a page/)
    // Golden copy validated by the kernel on the Go side (cli/create_addon_fixtures_test.go).
    const golden = path.join(FIX, '..', 'embedded-page.manifest.json')
    if (process.env.UPDATE_GOLDEN === '1' || !existsSync(golden)) {
      writeFileSync(golden, JSON.stringify(m, null, 2) + '\n')
    }
    assert.deepEqual(m, JSON.parse(readFileSync(golden, 'utf8')))
  } finally {
    rmSync(tmp, { recursive: true, force: true })
  }
})
