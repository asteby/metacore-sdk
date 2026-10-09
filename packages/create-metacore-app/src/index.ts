/**
 * create-metacore-app — scaffolder for metacore apps.
 *
 * Two modes:
 *   1. `--template <name>` (default `default`): copies a template that ships
 *      inside this package (`templates/<name>/`). Lightweight, offline-friendly.
 *   2. `--example <name>`: fetches an example from the monorepo on GitHub
 *      (`asteby/metacore-sdk/examples/<name>`) via `tiged` and freezes any
 *      `workspace:*` deps to the latest published npm version. This is the
 *      flow that powers the fullstack starter — same pattern as
 *      `create-next-app --example`.
 *
 * Usage:
 *   npm create @asteby/metacore-app my-app
 *   npm create @asteby/metacore-app my-app -- --example fullstack-starter
 */
import { Command } from 'commander'
import prompts from 'prompts'
import { blue, bold, cyan, green, red, yellow } from 'kolorist'
import glob from 'tiny-glob'
import { spawn } from 'node:child_process'
import { copyFile, mkdir, readFile, stat, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const TEMPLATE_ROOT = path.resolve(__dirname, '..', 'templates')
const MONOREPO = 'asteby/metacore-sdk'

const VALID_NAME = /^(?:@[a-z0-9-~][a-z0-9-._~]*\/)?[a-z0-9-~][a-z0-9-._~]*$/

interface CliOptions {
  template: string
  example?: string
  install: boolean
  packageManager: 'pnpm' | 'npm' | 'yarn'
}

async function main(): Promise<void> {
  const program = new Command()
  program
    .name('create-metacore-app')
    .description('Scaffold a metacore app — local template or GitHub example.')
    .argument('[name]', 'directory/name of the app to create')
    .option('-t, --template <name>', 'local template to use', 'default')
    .option(
      '-e, --example <name>',
      `clone an example from ${MONOREPO}/examples/<name> (e.g. fullstack-starter)`
    )
    .option('--no-install', 'skip dependency install')
    .option(
      '--pm <manager>',
      'package manager to run (pnpm|npm|yarn)',
      'pnpm'
    )
    .parse(process.argv)

  const cliArgs = program.args
  const opts = program.opts<{
    template: string
    example?: string
    install: boolean
    pm: 'pnpm' | 'npm' | 'yarn'
  }>()

  const defaultName = cliArgs[0]?.trim() ?? 'my-metacore-app'

  const answers = await prompts(
    [
      {
        type: cliArgs[0] ? null : 'text',
        name: 'appName',
        message: 'App name (also the directory):',
        initial: defaultName,
        validate: (v: string) =>
          VALID_NAME.test(v.trim()) ? true : 'Invalid npm package name',
      },
      {
        type: 'confirm',
        name: 'proceed',
        message: (_prev, values) => {
          const name = (values.appName ?? defaultName) as string
          const target = path.resolve(process.cwd(), name)
          return existsSync(target)
            ? `Directory ${yellow(name)} already exists. Overwrite merge?`
            : `Scaffold into ${cyan(name)}?`
        },
        initial: true,
      },
    ],
    {
      onCancel: () => {
        console.log(red('Aborted.'))
        process.exit(1)
      },
    }
  )

  if (!answers.proceed) {
    console.log(red('Aborted.'))
    process.exit(0)
  }

  const appName: string = (answers.appName ?? defaultName).trim()
  if (!VALID_NAME.test(appName)) {
    console.error(red(`Invalid app name: ${appName}`))
    process.exit(1)
  }

  const options: CliOptions = {
    template: opts.template,
    example: opts.example,
    install: opts.install,
    packageManager: opts.pm,
  }

  const targetDir = path.resolve(process.cwd(), appName)
  await mkdir(targetDir, { recursive: true })

  console.log()
  console.log(bold(blue('▸ Scaffolding metacore app')))
  console.log(`  ${bold('name   :')} ${cyan(appName)}`)
  console.log(`  ${bold('target :')} ${targetDir}`)

  if (options.example) {
    const remote = `${MONOREPO}/examples/${options.example}`
    console.log(`  ${bold('source :')} ${remote} (degit)`)
    console.log()
    await fetchExample(remote, targetDir)
    console.log(green('✓ Example cloned.'))

    const replaced = await freezeWorkspaceDeps(targetDir)
    if (replaced > 0) {
      console.log(
        green(`✓ Pinned ${replaced} workspace deps to latest npm versions.`)
      )
    }

    const vendored = await vendorMonorepoRefs(targetDir, options.example)
    if (vendored > 0) {
      console.log(
        green(`✓ Vendored ${vendored} files referenced from the monorepo root.`)
      )
    }

    await applyAppName(targetDir, appName)
  } else {
    const templateDir = path.join(TEMPLATE_ROOT, options.template)
    if (!existsSync(templateDir)) {
      console.error(
        red(`Template "${options.template}" not found at ${templateDir}`)
      )
      process.exit(1)
    }
    console.log(`  ${bold('source :')} ${templateDir}`)
    console.log()
    await copyTemplate(templateDir, targetDir, { appName })
    console.log(green('✓ Files copied.'))
  }

  if (options.install) {
    console.log(blue(`▸ Installing deps with ${options.packageManager}…`))
    await runInstall(targetDir, options.packageManager)
  } else {
    console.log(yellow('▸ Skipped install (--no-install).'))
  }

  console.log()
  console.log(bold(green('✓ Done!')))
  console.log()
  console.log(`  cd ${appName}`)
  if (!options.install) {
    console.log(`  ${options.packageManager} install`)
  }
  console.log(`  ${options.packageManager} dev`)
  console.log()
}

interface TigedEmitter {
  clone: (target: string) => Promise<void>
}
type TigedFactory = (
  src: string,
  opts?: { cache?: boolean; force?: boolean; verbose?: boolean }
) => TigedEmitter

async function fetchExample(remote: string, dest: string): Promise<void> {
  const tigedMod = (await import(/* @vite-ignore */ 'tiged')) as
    | { default: TigedFactory }
    | TigedFactory
  const factory: TigedFactory =
    typeof tigedMod === 'function' ? tigedMod : tigedMod.default
  const emitter = factory(remote, { force: true })
  await emitter.clone(dest)
}

interface PkgJson {
  name?: string
  dependencies?: Record<string, string>
  devDependencies?: Record<string, string>
  peerDependencies?: Record<string, string>
}

async function freezeWorkspaceDeps(root: string): Promise<number> {
  const pkgs = await glob('**/package.json', {
    cwd: root,
    dot: true,
    filesOnly: true,
    absolute: true,
  })
  const cache = new Map<string, string>()
  let replaced = 0
  for (const file of pkgs) {
    if (file.includes(`${path.sep}node_modules${path.sep}`)) continue
    const raw = await readFile(file, 'utf8')
    const json: PkgJson = JSON.parse(raw)
    let touched = false
    for (const section of [
      'dependencies',
      'devDependencies',
      'peerDependencies',
    ] as const) {
      const deps = json[section]
      if (!deps) continue
      for (const [name, version] of Object.entries(deps)) {
        if (typeof version !== 'string' || !version.startsWith('workspace:')) {
          continue
        }
        let latest = cache.get(name)
        if (!latest) {
          const fetched = await fetchLatestVersion(name)
          if (fetched) {
            latest = fetched
            cache.set(name, fetched)
          }
        }
        if (latest) {
          deps[name] = `^${latest}`
          touched = true
          replaced++
        } else {
          // Couldn't resolve — drop the workspace marker so install fails loudly
          // instead of silently exploding with "workspace: protocol unsupported".
          deps[name] = '*'
          touched = true
          replaced++
        }
      }
    }
    if (touched) {
      await writeFile(file, JSON.stringify(json, null, 2) + '\n', 'utf8')
    }
  }
  return replaced
}

/**
 * Examples live inside the monorepo, so they reach for files above their own
 * directory: `"extends": "../../../tsconfig.base.json"` in a tsconfig, or
 * `node ../../../scripts/gen-route-tree.mjs` in a package.json script. Cloned
 * on their own those paths point at nothing and the first build fails.
 *
 * Each reference is resolved against where the file sat in the monorepo; when
 * it lands outside `examples/<name>/` the target is downloaded next to the
 * file that uses it (keeping its monorepo-relative path) and the reference is
 * rewritten to point at that copy. A download that fails leaves the reference
 * untouched and warns, so the scaffold still completes.
 */
async function vendorMonorepoRefs(
  root: string,
  example: string
): Promise<number> {
  const exampleBase = `examples/${example}`
  const files = await glob('**/{package.json,tsconfig*.json}', {
    cwd: root,
    dot: true,
    filesOnly: true,
    absolute: true,
  })
  const downloads = new Map<string, string | null>()
  let vendored = 0

  const vendor = async (
    dir: string,
    ref: string
  ): Promise<string | null> => {
    if (!ref.startsWith('../')) return null
    const dirInRepo = path.posix.join(
      exampleBase,
      path.relative(root, dir).split(path.sep).join('/')
    )
    const repoPath = path.posix.normalize(path.posix.join(dirInRepo, ref))
    if (repoPath.startsWith(`${exampleBase}/`) || repoPath.startsWith('..')) {
      return null
    }
    let body = downloads.get(repoPath)
    if (body === undefined) {
      body = await fetchRepoFile(repoPath)
      downloads.set(repoPath, body)
    }
    if (body === null) {
      console.log(
        yellow(`! Could not fetch ${repoPath}; left "${ref}" unchanged.`)
      )
      return null
    }
    const dest = path.join(dir, ...repoPath.split('/'))
    if (!existsSync(dest)) {
      await mkdir(path.dirname(dest), { recursive: true })
      await writeFile(dest, body, 'utf8')
      vendored++
    }
    return `./${repoPath}`
  }

  for (const file of files) {
    if (file.includes(`${path.sep}node_modules${path.sep}`)) continue
    const dir = path.dirname(file)
    let text = await readFile(file, 'utf8')
    const refs = new Set<string>()
    if (path.basename(file) === 'package.json') {
      for (const m of text.matchAll(/(?:\.\.\/)+[\w@./-]+/g)) refs.add(m[0])
    } else {
      for (const m of text.matchAll(/"extends"\s*:\s*"([^"]+)"/g)) {
        if (m[1]) refs.add(m[1])
      }
    }
    let touched = false
    for (const ref of refs) {
      const local = await vendor(dir, ref)
      if (local) {
        text = text.split(ref).join(local)
        touched = true
      }
    }
    if (touched) await writeFile(file, text, 'utf8')
  }
  return vendored
}

async function fetchRepoFile(repoPath: string): Promise<string | null> {
  try {
    const res = await fetch(
      `https://raw.githubusercontent.com/${MONOREPO}/main/${repoPath}`
    )
    return res.ok ? await res.text() : null
  } catch {
    return null
  }
}

async function fetchLatestVersion(pkg: string): Promise<string | null> {
  try {
    const res = await fetch(`https://registry.npmjs.org/${pkg}/latest`, {
      headers: { accept: 'application/json' },
    })
    if (!res.ok) return null
    const body = (await res.json()) as { version?: string }
    return body.version ?? null
  } catch {
    return null
  }
}

async function applyAppName(root: string, appName: string): Promise<void> {
  const rootPkg = path.join(root, 'package.json')
  if (!existsSync(rootPkg)) return
  const raw = await readFile(rootPkg, 'utf8')
  const json: PkgJson = JSON.parse(raw)
  if (!json.name || !json.name.startsWith('@')) {
    json.name = appName
    await writeFile(rootPkg, JSON.stringify(json, null, 2) + '\n', 'utf8')
  }
}

async function copyTemplate(
  from: string,
  to: string,
  vars: { appName: string }
): Promise<void> {
  const entries = await glob('**/*', {
    cwd: from,
    dot: true,
    filesOnly: true,
    absolute: false,
  })

  for (const rel of entries) {
    const src = path.join(from, rel)
    const destRel = rel
      .replace(/(^|\/)_gitignore$/, '$1.gitignore')
      .replace(/(^|\/)_env\.example$/, '$1.env.example')
    const dest = path.join(to, destRel)
    await mkdir(path.dirname(dest), { recursive: true })

    if (shouldTemplate(rel)) {
      const raw = await readFile(src, 'utf8')
      const out = raw.replace(/\{\{APP_NAME\}\}/g, vars.appName)
      await writeFile(dest, out, 'utf8')
    } else {
      await copyFile(src, dest)
    }

    try {
      const st = await stat(src)
      if ((st.mode & 0o111) !== 0) {
        const { chmod } = await import('node:fs/promises')
        await chmod(dest, st.mode)
      }
    } catch {
      /* ignore */
    }
  }
}

function shouldTemplate(rel: string): boolean {
  const base = path.basename(rel)
  return (
    base === 'package.json' ||
    base === 'README.md' ||
    base === 'index.html' ||
    base === '.env.example' ||
    base === '_env.example'
  )
}

function runInstall(
  cwd: string,
  pm: 'pnpm' | 'npm' | 'yarn'
): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(pm, ['install'], {
      cwd,
      stdio: 'inherit',
      shell: process.platform === 'win32',
    })
    child.on('close', (code) => {
      if (code === 0) resolve()
      else reject(new Error(`${pm} install exited with code ${code}`))
    })
    child.on('error', reject)
  })
}

main().catch((err) => {
  console.error(red(String(err?.stack ?? err)))
  process.exit(1)
})
