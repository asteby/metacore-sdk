/**
 * create-metacore-addon — scaffolder for metacore addons.
 *
 * Generates an addon scaffold (manifest.json + frontend/ + optional backend
 * WASM stub) ready to package with `metacore build`.
 *
 * Usage:
 *   npm create metacore-addon@latest my-addon
 *   npx create-metacore-addon my-addon --template minimal
 *   npx create-metacore-addon my-addon --template crud-model --no-install
 */
import { Command } from 'commander'
import prompts from 'prompts'
import { blue, bold, cyan, green, red, yellow, gray } from 'kolorist'
import glob from 'tiny-glob'
import { spawn } from 'node:child_process'
import {
  copyFile,
  mkdir,
  readFile,
  stat,
  writeFile,
} from 'node:fs/promises'
import { existsSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const TEMPLATE_ROOT = path.resolve(__dirname, '..', 'templates')

// Addon key: lowercase letters, digits, underscores. Becomes the schema name
// `addon_<key>` and the federation container `metacore_<key>`, so we keep it
// strict (no dashes, no leading digit).
const VALID_KEY = /^[a-z][a-z0-9_]{1,39}$/
// Display name / directory: more permissive but still npm-package-safe.
const VALID_NAME = /^[a-z0-9-~][a-z0-9-._~]*$/

interface TemplateDescriptor {
  /** Template directory name (under `templates/`). */
  id: string
  /** Human label for the prompt. */
  label: string
  /** Short description for the prompt. */
  hint: string
  /** True when the template ships a TinyGo backend stub. */
  hasBackend: boolean
}

const TEMPLATES: TemplateDescriptor[] = [
  {
    id: 'minimal',
    label: 'Minimal — sidebar + one route',
    hint: 'Manifest + frontend only. Good starting point.',
    hasBackend: false,
  },
  {
    id: 'crud-model',
    label: 'CRUD model — one model + actions + WASM stub',
    hint: 'Includes model_definitions, actions, and a TinyGo backend skeleton.',
    hasBackend: true,
  },
  {
    id: 'full-page',
    label: 'Immersive — full-page takeover (POS / kiosk)',
    hint: 'frontend.layout = "immersive", owns the whole viewport.',
    hasBackend: false,
  },
]

interface CliOptions {
  template?: string
  key?: string
  author?: string
  displayName?: string
  description?: string
  install: boolean
  packageManager: 'pnpm' | 'npm' | 'yarn'
  /**
   * Skip all interactive prompts; rely on flags + defaults. Auto-enabled when
   * stdin isn't a TTY (CI, `<<<` redirects, piped agents) so we never hang.
   */
  yes: boolean
}

interface ScaffoldVars {
  appName: string
  addonKey: string
  addonName: string
  addonDescription: string
  author: string
  license: string
  hasBackend: boolean
}

async function main(): Promise<void> {
  const program = new Command()
  program
    .name('create-metacore-addon')
    .description(
      'Scaffold a metacore addon — manifest.json + federated frontend + optional WASM backend.'
    )
    .argument('[name]', 'directory/name of the addon to create')
    .option('-t, --template <id>', `template (${TEMPLATES.map((t) => t.id).join('|')})`)
    .option('-k, --key <addonKey>', 'addon key (slug, lowercase, no dashes — becomes addon_<key> schema)')
    .option('-a, --author <author>', 'author string for manifest + package.json')
    .option('--name <displayName>', 'human-readable display name (manifest.name)')
    .option('--description <text>', 'short description (manifest.description)')
    .option('-y, --yes', 'skip all prompts; use flags + defaults')
    .option('--no-install', 'skip dependency install')
    .option(
      '--pm <manager>',
      'package manager to run (pnpm|npm|yarn)',
      'pnpm'
    )
    .parse(process.argv)

  const cliArgs = program.args
  const opts = program.opts<{
    template?: string
    key?: string
    author?: string
    name?: string
    description?: string
    yes?: boolean
    install: boolean
    pm: 'pnpm' | 'npm' | 'yarn'
  }>()

  const defaultName = cliArgs[0]?.trim() ?? 'my-metacore-addon'
  const defaultKey = opts.key ?? slugifyToKey(defaultName)

  // Validate inline overrides early so we fail fast.
  if (opts.template && !TEMPLATES.some((t) => t.id === opts.template)) {
    console.error(
      red(
        `Invalid --template "${opts.template}". Expected one of: ${TEMPLATES.map(
          (t) => t.id
        ).join(', ')}`
      )
    )
    process.exit(1)
  }
  if (opts.key && !VALID_KEY.test(opts.key)) {
    console.error(
      red(
        `Invalid --key "${opts.key}". Use lowercase letters, digits and underscores (start with a letter).`
      )
    )
    process.exit(1)
  }

  const options: CliOptions = {
    template: opts.template,
    key: opts.key,
    author: opts.author,
    displayName: opts.name,
    description: opts.description,
    install: opts.install,
    packageManager: opts.pm,
    // Auto-skip prompts when stdin isn't a TTY — avoids hanging in CI / agents
    // even if the caller forgot `--yes`.
    yes: Boolean(opts.yes) || !process.stdin.isTTY,
  }

  // When `--yes` (or non-TTY stdin) is in effect, skip the interactive walk
  // entirely and rely on flags + defaults.
  type Answers = Partial<{
    appName: string
    addonKey: string
    addonName: string
    addonDescription: string
    author: string
    template: string
  }>
  const answers: Answers = options.yes
    ? {}
    : await prompts(
        [
          {
            type: cliArgs[0] ? null : 'text',
            name: 'appName',
            message: 'Addon directory / npm name:',
            initial: defaultName,
            validate: (v: string) =>
              VALID_NAME.test(v.trim()) ? true : 'Invalid npm package name',
          },
          {
            type: options.key ? null : 'text',
            name: 'addonKey',
            message: (_prev, values) => {
              const seed = (values.appName ?? defaultName) as string
              return `Addon key (slug — schema "addon_<key>", default ${cyan(
                slugifyToKey(seed)
              )}):`
            },
            initial: (_prev, values) =>
              slugifyToKey((values.appName ?? defaultName) as string),
            validate: (v: string) =>
              VALID_KEY.test(v.trim())
                ? true
                : 'Use lowercase letters, digits and underscores (start with a letter, max 40 chars).',
          },
          {
            type: options.displayName ? null : 'text',
            name: 'addonName',
            message: 'Display name (manifest.name):',
            initial: (_prev, values) =>
              titleCase((values.appName ?? defaultName) as string),
          },
          {
            type: options.description ? null : 'text',
            name: 'addonDescription',
            message: 'Short description:',
            initial: 'A metacore addon.',
          },
          {
            type: options.author ? null : 'text',
            name: 'author',
            message: 'Author:',
            initial: options.author ?? '',
          },
          {
            type: options.template ? null : 'select',
            name: 'template',
            message: 'Pick a template:',
            choices: TEMPLATES.map((t) => ({
              title: t.label,
              description: t.hint,
              value: t.id,
            })),
            initial: 0,
          },
        ],
        {
          onCancel: () => {
            console.log(red('Aborted.'))
            process.exit(1)
          },
        }
      )

  const appName: string = (answers.appName ?? defaultName).trim()
  if (!VALID_NAME.test(appName)) {
    console.error(red(`Invalid addon name: ${appName}`))
    process.exit(1)
  }

  const addonKey: string = (options.key ?? answers.addonKey ?? defaultKey).trim()
  if (!VALID_KEY.test(addonKey)) {
    console.error(red(`Invalid addon key: ${addonKey}`))
    process.exit(1)
  }

  const templateId: string = options.template ?? answers.template ?? 'minimal'
  const descriptor = TEMPLATES.find((t) => t.id === templateId)
  if (!descriptor) {
    console.error(red(`Unknown template: ${templateId}`))
    process.exit(1)
  }

  const vars: ScaffoldVars = {
    appName,
    addonKey,
    addonName: (
      options.displayName ??
      answers.addonName ??
      titleCase(appName)
    ).trim(),
    addonDescription: (
      options.description ??
      answers.addonDescription ??
      'A metacore addon.'
    ).trim(),
    author: (options.author ?? answers.author ?? '').trim(),
    license: 'Apache-2.0',
    hasBackend: descriptor.hasBackend,
  }

  const targetDir = path.resolve(process.cwd(), appName)
  if (existsSync(targetDir) && !options.yes) {
    const { proceed } = await prompts({
      type: 'confirm',
      name: 'proceed',
      message: `Directory ${yellow(appName)} already exists. Merge in scaffold?`,
      initial: false,
    })
    if (!proceed) {
      console.log(red('Aborted.'))
      process.exit(0)
    }
  }
  await mkdir(targetDir, { recursive: true })

  console.log()
  console.log(bold(blue('▸ Scaffolding metacore addon')))
  console.log(`  ${bold('name     :')} ${cyan(appName)}`)
  console.log(`  ${bold('key      :')} ${cyan(addonKey)}`)
  console.log(`  ${bold('template :')} ${cyan(templateId)}`)
  console.log(`  ${bold('target   :')} ${targetDir}`)
  console.log()

  const templateDir = path.join(TEMPLATE_ROOT, templateId)
  if (!existsSync(templateDir)) {
    console.error(
      red(`Template "${templateId}" not found at ${templateDir}`)
    )
    process.exit(1)
  }

  await copyTemplate(templateDir, targetDir, vars)
  console.log(green('✓ Files copied.'))

  if (options.install) {
    const frontendDir = path.join(targetDir, 'frontend')
    if (existsSync(path.join(frontendDir, 'package.json'))) {
      console.log(
        blue(`▸ Installing frontend deps with ${options.packageManager}…`)
      )
      try {
        await runInstall(frontendDir, options.packageManager)
      } catch (err) {
        console.log(
          yellow(
            `⚠ Install failed: ${(err as Error).message}. You can retry manually.`
          )
        )
      }
    }
  } else {
    console.log(yellow('▸ Skipped install (--no-install).'))
  }

  console.log()
  console.log(bold(green('✓ Done!')))
  console.log()
  console.log(gray('  Next steps:'))
  console.log(`    cd ${appName}/frontend`)
  if (!options.install) {
    console.log(`    ${options.packageManager} install`)
  }
  console.log(`    ${options.packageManager} run build`)
  console.log()
  console.log(gray('  To package the addon for upload:'))
  console.log(`    metacore build .`)
  console.log(`    metacore publish ${addonKey}-<version>.tar.gz`)
  console.log()
  if (descriptor.hasBackend) {
    console.log(gray('  Build the WASM backend:'))
    console.log(`    cd backend && ./build.sh    # requires tinygo`)
    console.log()
  }
}

function slugifyToKey(input: string): string {
  return (
    input
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '')
      .replace(/^([0-9])/, 'a$1') // ensure leading letter
      .slice(0, 40) || 'my_addon'
  )
}

function titleCase(input: string): string {
  return input
    .replace(/[-_]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .split(' ')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ')
}

async function copyTemplate(
  from: string,
  to: string,
  vars: ScaffoldVars
): Promise<void> {
  const entries = await glob('**/*', {
    cwd: from,
    dot: true,
    filesOnly: true,
    absolute: false,
  })

  for (const rel of entries) {
    const src = path.join(from, rel)
    // Underscore-prefixed dotfile/dirfile aliases: lets us ship `_gitignore`
    // in the package (npm strips real `.gitignore` from published tarballs).
    const destRel = rel
      .replace(/(^|\/)_gitignore$/, '$1.gitignore')
      .replace(/(^|\/)_env\.example$/, '$1.env.example')
      .replace(/(^|\/)_npmrc$/, '$1.npmrc')
    const dest = path.join(to, destRel)
    await mkdir(path.dirname(dest), { recursive: true })

    if (shouldTemplate(rel)) {
      const raw = await readFile(src, 'utf8')
      const out = renderTemplate(raw, vars)
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
  if (base.endsWith('.sql')) return true
  return (
    base === 'package.json' ||
    base === 'README.md' ||
    base === 'manifest.json' ||
    base === 'index.html' ||
    base === 'vite.config.ts' ||
    base === 'plugin.tsx' ||
    base === 'main.tsx' ||
    base === 'index.css' ||
    base === 'build.sh' ||
    base === 'main.go' ||
    base === 'go.mod' ||
    base === '.env.example' ||
    base === '_env.example'
  )
}

function renderTemplate(raw: string, vars: ScaffoldVars): string {
  return raw
    .replace(/\{\{ADDON_NAME\}\}/g, vars.addonName)
    .replace(/\{\{ADDON_KEY\}\}/g, vars.addonKey)
    .replace(/\{\{ADDON_DESCRIPTION\}\}/g, vars.addonDescription)
    .replace(/\{\{APP_NAME\}\}/g, vars.appName)
    .replace(/\{\{AUTHOR\}\}/g, vars.author)
    .replace(/\{\{LICENSE\}\}/g, vars.license)
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
