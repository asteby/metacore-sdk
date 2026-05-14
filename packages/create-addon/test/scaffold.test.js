/**
 * E2E test — invokes the compiled CLI against `/tmp` and asserts the scaffold
 * is well-formed for each template:
 *
 *   - manifest.json parses + key/name/version/frontend block present.
 *   - frontend/package.json parses + has `@asteby/metacore-sdk` in peers.
 *   - frontend/vite.config.ts references `metacoreFederationShared`.
 *   - placeholders ({{ADDON_KEY}} etc.) are fully replaced.
 *   - crud-model template ships backend/main.go + build.sh.
 *
 * The test does NOT run `pnpm install` — that would need network access.
 * Memory: this validates the contract, the CI lane runs install for real.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, existsSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const CLI = path.resolve(__dirname, '..', 'bin', 'index.js')
const DIST = path.resolve(__dirname, '..', 'dist', 'index.js')

function ensureBuilt() {
  if (!existsSync(DIST)) {
    throw new Error(
      `dist/index.js missing — run \`pnpm --filter create-metacore-addon build\` first.`
    )
  }
}

function run(args, cwd) {
  return spawnSync(process.execPath, [CLI, ...args], {
    cwd,
    encoding: 'utf8',
    env: { ...process.env, FORCE_COLOR: '0' },
  })
}

function scaffoldFor(template) {
  ensureBuilt()
  const tmp = mkdtempSync(path.join(tmpdir(), `metacore-addon-${template}-`))
  const name = 'my-addon'
  const res = run(
    [
      name,
      '--template',
      template,
      '--key',
      'my_addon',
      '--author',
      'Asteby Tests',
      '--no-install',
    ],
    tmp
  )
  assert.equal(
    res.status,
    0,
    `scaffold failed for template ${template}:\n${res.stdout}\n${res.stderr}`
  )
  return { dir: path.join(tmp, name), root: tmp }
}

function cleanup(root) {
  try {
    rmSync(root, { recursive: true, force: true })
  } catch {
    /* ignore */
  }
}

for (const template of ['minimal', 'crud-model', 'full-page']) {
  test(`scaffolds template "${template}"`, () => {
    const { dir, root } = scaffoldFor(template)
    try {
      // manifest.json
      const manifestRaw = readFileSync(path.join(dir, 'manifest.json'), 'utf8')
      assert.doesNotMatch(
        manifestRaw,
        /\{\{[A-Z_]+\}\}/,
        'manifest.json still contains unsubstituted placeholders'
      )
      const manifest = JSON.parse(manifestRaw)
      assert.equal(manifest.key, 'my_addon')
      assert.ok(manifest.name, 'manifest.name missing')
      assert.ok(manifest.version, 'manifest.version missing')
      assert.ok(manifest.frontend, 'manifest.frontend missing')
      assert.equal(manifest.frontend.format, 'federation')
      assert.equal(manifest.frontend.container, 'metacore_my_addon')

      // frontend/package.json
      const fePkgRaw = readFileSync(
        path.join(dir, 'frontend', 'package.json'),
        'utf8'
      )
      const fePkg = JSON.parse(fePkgRaw)
      assert.equal(fePkg.name, '@metacore-addons/my_addon')
      assert.ok(
        fePkg.peerDependencies?.['@asteby/metacore-sdk'],
        '@asteby/metacore-sdk missing from peers'
      )
      assert.ok(
        fePkg.peerDependencies?.react,
        'react missing from peers'
      )

      // vite.config.ts
      const vite = readFileSync(
        path.join(dir, 'frontend', 'vite.config.ts'),
        'utf8'
      )
      assert.match(vite, /metacoreFederationShared/)
      assert.match(vite, /metacoreOptimizeDeps/)
      assert.match(vite, /metacore_my_addon/)

      // plugin.tsx
      const plugin = readFileSync(
        path.join(dir, 'frontend', 'src', 'plugin.tsx'),
        'utf8'
      )
      assert.match(plugin, /definePlugin/)
      assert.match(plugin, /key:\s*'my_addon'/)

      // index.css with @source directives
      const css = readFileSync(
        path.join(dir, 'frontend', 'src', 'index.css'),
        'utf8'
      )
      assert.match(css, /@source/)
      assert.match(css, /@asteby\/metacore-ui/)

      // template-specific assertions
      if (template === 'crud-model') {
        assert.ok(manifest.backend, 'crud-model: manifest.backend missing')
        assert.equal(manifest.backend.runtime, 'wasm')
        assert.ok(
          Array.isArray(manifest.model_definitions) &&
            manifest.model_definitions.length > 0,
          'crud-model: model_definitions missing'
        )
        assert.ok(
          existsSync(path.join(dir, 'backend', 'main.go')),
          'crud-model: backend/main.go missing'
        )
        assert.ok(
          existsSync(path.join(dir, 'backend', 'build.sh')),
          'crud-model: backend/build.sh missing'
        )
        const goSrc = readFileSync(path.join(dir, 'backend', 'main.go'), 'utf8')
        assert.match(goSrc, /metacore_host/)
        assert.match(goSrc, /mark_done/)
        assert.doesNotMatch(goSrc, /\{\{[A-Z_]+\}\}/)
      }

      if (template === 'full-page') {
        assert.equal(manifest.frontend.layout, 'immersive')
      }

      if (template === 'minimal') {
        // minimal must NOT ship a backend block (keeps the addon tiny).
        assert.equal(
          manifest.backend,
          undefined,
          'minimal: manifest.backend should be omitted'
        )
      }
    } finally {
      cleanup(root)
    }
  })
}

test('rejects an invalid --key', () => {
  ensureBuilt()
  const tmp = mkdtempSync(path.join(tmpdir(), 'metacore-addon-bad-'))
  try {
    const res = run(
      ['x', '--template', 'minimal', '--key', 'BAD-KEY', '--no-install'],
      tmp
    )
    assert.notEqual(res.status, 0, 'CLI accepted an invalid key')
    assert.match(res.stderr + res.stdout, /Invalid --key/)
  } finally {
    cleanup(tmp)
  }
})

test('rejects an unknown --template', () => {
  ensureBuilt()
  const tmp = mkdtempSync(path.join(tmpdir(), 'metacore-addon-bad-tpl-'))
  try {
    const res = run(
      ['x', '--template', 'does-not-exist', '--no-install'],
      tmp
    )
    assert.notEqual(res.status, 0, 'CLI accepted an unknown template')
    assert.match(res.stderr + res.stdout, /Invalid --template/)
  } finally {
    cleanup(tmp)
  }
})
