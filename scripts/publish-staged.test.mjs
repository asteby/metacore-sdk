// Ejecutar: node --test scripts/publish-staged.test.mjs
import test from 'node:test'
import assert from 'node:assert/strict'
import { writeFileSync, readFileSync, mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { main, npmErrorMessage, distTag, sortByDeps, parseJson } from './publish-staged.mjs'

const ok = (stdout = '') => ({ status: 0, stdout, stderr: '' })
const fail = (stdout = '', stderr = '') => ({ status: 1, stdout, stderr })

/** npm/pnpm simulado: `handlers` mapea "npm view", "npm stage list", ... a funciones. */
function fakeRun(handlers, calls = []) {
  return (cmd, args, opts) => {
    calls.push([cmd, ...args])
    const key = cmd === 'npm' && args[0] === 'stage' ? `npm stage ${args[1]}` : `${cmd} ${args[0]}`
    const h = handlers[key]
    if (!h) throw new Error(`comando no simulado: ${key}`)
    return h(args, opts)
  }
}

const pkg = (name, version, extra = {}) => ({ name, version, path: '/x/' + name, ...extra })

// pnpm pack simulado: crea el .tgz en --pack-destination
function pnpmPack(args) {
  const dest = args[args.indexOf('--pack-destination') + 1]
  writeFileSync(join(dest, 'pkg-1.0.0.tgz'), 'x')
  return ok('pkg-1.0.0.tgz')
}

const E404 = fail('{"error":{"code":"E404","summary":"Not Found"}}')

test('parseJson ignora avisos previos', () => {
  assert.deepEqual(parseJson('npm warn algo\n{"a":1}\n'), { a: 1 })
  assert.equal(parseJson('sin json'), undefined)
})

test('npmErrorMessage usa el JSON de npm y nunca devuelve "undefined"', () => {
  const m = npmErrorMessage(fail('{"error":{"code":"E_STAGE_REQUIRED","summary":"This token can only publish to a staging area.","detail":"use npm stage publish"}}'))
  assert.match(m, /E_STAGE_REQUIRED/)
  assert.match(m, /staging area/)
  assert.doesNotMatch(npmErrorMessage(fail('', 'npm error code E403\nnpm error 403 Forbidden')), /undefined/)
  assert.match(npmErrorMessage(fail('', 'npm warn x\nnpm error code E403\nnpm error 403 Forbidden')), /E403.*403 Forbidden/)
  assert.match(npmErrorMessage({ status: 1, stdout: '', stderr: '' }), /codigo 1/)
})

test('distTag', () => {
  assert.equal(distTag('1.2.3'), undefined)
  assert.equal(distTag('0.3.0-next.1'), 'next')
})

test('sortByDeps pone dependencias internas primero', () => {
  const out = sortByDeps([
    pkg('@a/ui', '1.0.0', { dependencies: { '@a/theme': 'workspace:*' } }),
    pkg('@a/theme', '1.0.0'),
  ])
  assert.deepEqual(out.map((p) => p.name), ['@a/theme', '@a/ui'])
})

test('prepara paquetes sin publicar, omite publicados y etapas pendientes, y continua tras un fallo', () => {
  const calls = []
  const dir = mkdtempSync(join(tmpdir(), 'ps-test-'))
  const summaryFile = join(dir, 'summary.md')
  const logs = []
  const run = fakeRun({
    'npm view': (a) => (a[1] === '@a/pub@1.0.0' ? ok('"1.0.0"') : E404),
    'npm stage list': (a) => {
      if (a[2] === '@a/pend') return ok('[{"stageId":"s-old","version":"1.0.0","status":"validating"}]')
      if (a[2] === '@a/dead') return ok('[{"stageId":"s-dead","version":"1.0.0","status":"rejected"}]')
      return ok('[]')
    },
    'pnpm pack': pnpmPack,
    'npm stage publish': (a, o) =>
      o.cwd.endsWith('/x')
        ? fail('{"error":{"code":"E403","summary":"Forbidden","detail":"no tienes permiso"}}')
        : ok('{"stageId":"s-' + calls.length + '"}'),
  }, calls)
  const packages = [pkg('@a/pub', '1.0.0'), pkg('@a/pend', '1.0.0'), pkg('@a/dead', '1.0.0'), pkg('@a/new', '2.0.0'), pkg('@a/x', '1.0.0')]
  const r = main({ run, packages, summaryFile, log: (l) => logs.push(l), dryRun: false })

  assert.deepEqual(r.published, ['@a/pub@1.0.0'])
  assert.deepEqual(r.pending.map((p) => p.stageId), ['s-old'])
  assert.equal(r.staged.length, 2) // dead (se vuelve a preparar) + new
  assert.equal(r.failed.length, 1)
  assert.match(r.failed[0].msg, /E403.*Forbidden.*no tienes permiso/)
  assert.equal(r.exitCode, 1)
  const summary = readFileSync(summaryFile, 'utf8')
  assert.match(summary, /@a\/new@2\.0\.0/)
  assert.match(summary, /Fallaron/)
  assert.match(summary, /E403/)
  assert.ok(logs.every((l) => !/^New tag:/m.test(l)), 'no debe emitir New tag:')
  const pub = calls.find((c) => c[1] === 'stage' && c[2] === 'publish')
  assert.ok(pub.includes('--access') && pub.includes('public') && pub[3].endsWith('.tgz'))
})

test('prerelease agrega --tag', () => {
  const calls = []
  const run = fakeRun({
    'npm view': () => E404,
    'npm stage list': () => ok('[]'),
    'pnpm pack': pnpmPack,
    'npm stage publish': () => ok('{"stageId":"s1"}'),
  }, calls)
  const r = main({ run, packages: [pkg('@a/p', '1.0.0-next.1')], summaryFile: null, log() {}, dryRun: false })
  assert.equal(r.exitCode, 0)
  const pub = calls.find((c) => c[2] === 'publish')
  assert.deepEqual(pub.slice(-2), ['--tag', 'next'])
})

test('idempotente: segunda corrida no vuelve a preparar', () => {
  const calls = []
  const run = fakeRun({
    'npm view': () => E404,
    'npm stage list': () => ok('[{"id":"s1","version":"1.0.0","status":"validating"}]'),
  }, calls)
  const r = main({ run, packages: [pkg('@a/p', '1.0.0')], summaryFile: null, log() {}, dryRun: false })
  assert.equal(r.exitCode, 0)
  assert.equal(r.pending.length, 1)
  assert.ok(!calls.some((c) => c[2] === 'publish'))
})

test('error de red en npm view cuenta como fallo, no como "no publicado"', () => {
  const run = fakeRun({ 'npm view': () => fail('', 'npm error code ETIMEDOUT') })
  const r = main({ run, packages: [pkg('@a/p', '1.0.0')], summaryFile: null, log() {}, dryRun: false })
  assert.equal(r.exitCode, 1)
  assert.match(r.failed[0].msg, /ETIMEDOUT/)
})

test('dry-run no empaqueta ni prepara', () => {
  const calls = []
  const run = fakeRun({ 'npm view': () => E404, 'npm stage list': () => ok('[]') }, calls)
  const r = main({ run, packages: [pkg('@a/p', '1.0.0')], summaryFile: null, log() {}, dryRun: true })
  assert.equal(r.exitCode, 0)
  assert.equal(calls.length, 2)
})
