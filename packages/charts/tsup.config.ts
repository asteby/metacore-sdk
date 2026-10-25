import { defineConfig } from 'tsup'

export default defineConfig({
  entry: {
    index: 'src/index.ts',
    sparkline: 'src/sparkline.tsx',
    recharts: 'src/recharts.ts',
  },
  format: ['esm'],
  // tsup's dts worker sets `baseUrl`, deprecated in TypeScript 6.
  dts: { compilerOptions: { ignoreDeprecations: '6.0' } },
  sourcemap: true,
  clean: true,
  target: 'es2022',
  platform: 'browser',
  treeshake: true,
  splitting: true,
  // recharts, react and @asteby/* stay external (dependency / peers).
  external: ['recharts', /^recharts\//],
})
