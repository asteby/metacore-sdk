import { defineConfig } from 'tsup'

// ESM only on purpose: the catalogs are lazy `import('./data/*.json')` chunks, which a CJS bundle would inline into the entry.
export default defineConfig({
  entry: { index: 'src/index.ts', mx: 'src/mx.ts', us: 'src/us.ts' },
  format: ['esm'],
  dts: { compilerOptions: { ignoreDeprecations: '6.0' } },
  clean: false,
  target: 'es2022',
  platform: 'neutral',
  splitting: true,
  treeshake: true,
})
