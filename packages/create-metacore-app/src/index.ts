/**
 * create-metacore-app — scaffolder for Vite+React apps wired to
 * `@asteby/metacore-starter-core` and `@asteby/metacore-starter-config`.
 *
 * Usage: `npm create @asteby/metacore-app [name]`
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
// dist/ sibling to templates/, fall back to repo layout during local `pnpm dev`.
const TEMPLATE_ROOT = path.resolve(__dirname, '..', 'templates')

const VALID_NAME = /^(?:@[a-z0-9-~][a-z0-9-._~]*\/)?[a-z0-9-~][a-z0-9-._~]*$/

interface CliOptions {
  template: string
  install: boolean
  packageManager: 'pnpm' | 'npm' | 'yarn'
}

async function main(): Promise<void> {
  const program = new Command()
  program
    .name('create-metacore-app')
    .description('Scaffold a Vite+React app wired to the metacore starter.')
    .argument('[name]', 'directory/name of the app to create')
    .option('-t, --template <name>', 'template to use', 'default')
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
    install: opts.install,
    packageManager: opts.pm,
  }

  const targetDir = path.resolve(process.cwd(), appName)
  const templateDir = path.join(TEMPLATE_ROOT, options.template)

  if (!existsSync(templateDir)) {
    console.error(
      red(`Template "${options.template}" not found at ${templateDir}`)
    )
    process.exit(1)
  }

  console.log()
  console.log(bold(blue('▸ Scaffolding metacore app')))
  console.log(`  ${bold('name   :')} ${cyan(appName)}`)
  console.log(`  ${bold('target :')} ${targetDir}`)
  console.log(`  ${bold('from   :')} ${templateDir}`)
  console.log()

  await mkdir(targetDir, { recursive: true })
  await copyTemplate(templateDir, targetDir, { appName })

  console.log(green('✓ Files copied.'))

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
    // Rename `_gitignore` / `_env.example` style tokens to their dotted variants,
    // and keep `.gitkeep` files verbatim.
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

    // Best-effort: preserve execute bit on shell files.
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
