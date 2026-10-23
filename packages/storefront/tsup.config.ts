import { readFileSync } from 'node:fs'
import { defineConfig } from 'tsup'

const { version } = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as { version: string }
// tsup's dts worker sets `baseUrl`, deprecated in TypeScript 6.
const dts = { compilerOptions: { ignoreDeprecations: '6.0' } }
const define = { __SDK_VERSION__: JSON.stringify(version) }

export default defineConfig([
  {
    entry: {
      index: 'src/index.ts',
      mock: 'src/mock/index.ts',
      geo: 'src/geo.ts',
      mockup: 'src/mockup.ts',
      'fiscal-document': 'src/fiscal-document/index.ts',
    },
    format: ['esm', 'cjs'],
    dts,
    sourcemap: true,
    clean: false,
    target: 'es2022',
    platform: 'neutral',
    treeshake: true,
  },
  // Node-only: token files and the connection protocol.
  {
    entry: { node: 'src/node.ts' },
    format: ['esm', 'cjs'],
    dts,
    define,
    sourcemap: true,
    clean: false,
    target: 'node20',
    platform: 'node',
  },
  // The `storefront` binary (`npx @asteby/storefront connect`).
  {
    entry: { cli: 'src/cli.ts' },
    format: ['esm'],
    define,
    sourcemap: false,
    clean: false,
    target: 'node20',
    platform: 'node',
    banner: { js: '#!/usr/bin/env node' },
  },
])
