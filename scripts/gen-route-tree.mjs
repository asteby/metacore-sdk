#!/usr/bin/env node
/**
 * Generates `src/routeTree.gen.ts` for a TanStack Router app without booting
 * the full Vite config (which needs every workspace dependency built first).
 *
 * The generated file is committed to the repo — matching the ecosystem
 * convention (metacore-starter / link / ops all commit routeTree.gen.ts) — so
 * `tsc -b` (which runs before `vite build`) can resolve the
 * `./routeTree.gen` import in a clean checkout / CI.
 *
 * Usage: node scripts/gen-route-tree.mjs <appDir> [<appDir> ...]
 * Each <appDir> must contain ./src/routes and a vite config using
 * TanStackRouterVite({ target: 'react', autoCodeSplitting: true }).
 */
import path from 'node:path'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

const dirs = process.argv.slice(2)
if (dirs.length === 0) {
  console.error('usage: gen-route-tree.mjs <appDir> [<appDir> ...]')
  process.exit(2)
}

for (const dir of dirs) {
  const root = path.resolve(process.cwd(), dir)
  // Resolve @tanstack/router-generator from the app's own node_modules so the
  // pnpm-hoisted copy is found regardless of the script's location.
  const require = createRequire(path.join(root, 'package.json'))
  const pkgPath = require.resolve('@tanstack/router-generator')
  const { Generator, getConfig } = await import(pathToFileURL(pkgPath).href)

  // Mirror the vite plugin options used by these apps.
  const config = getConfig(
    {
      target: 'react',
      autoCodeSplitting: true,
      routesDirectory: './src/routes',
      generatedRouteTree: './src/routeTree.gen.ts',
    },
    root,
  )
  const generator = new Generator({ config, root })
  await generator.run()
  console.log(`generated ${path.join(dir, config.generatedRouteTree)}`)
}
