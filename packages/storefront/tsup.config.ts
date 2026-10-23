import { defineConfig } from 'tsup'

export default defineConfig({
  entry: {
    index: 'src/index.ts',
    mock: 'src/mock/index.ts',
    geo: 'src/geo.ts',
    mockup: 'src/mockup.ts',
    'fiscal-document': 'src/fiscal-document/index.ts',
  },
  format: ['esm', 'cjs'],
  // tsup's dts worker sets `baseUrl`, deprecated in TypeScript 6.
  dts: { compilerOptions: { ignoreDeprecations: '6.0' } },
  sourcemap: true,
  clean: true,
  target: 'es2022',
  platform: 'neutral',
  treeshake: true,
})
