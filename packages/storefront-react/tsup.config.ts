import { defineConfig } from 'tsup'

export default defineConfig({
  entry: { index: 'src/index.ts', mockups: 'src/mockups/index.ts' },
  format: ['esm', 'cjs'],
  // tsup's dts worker sets `baseUrl`, deprecated in TypeScript 6.
  dts: { compilerOptions: { ignoreDeprecations: '6.0' } },
  sourcemap: true,
  clean: true,
  target: 'es2022',
  external: ['react', 'react/jsx-runtime', '@asteby/storefront', '@asteby/storefront/geo', '@asteby/storefront/mockup'],
  treeshake: true,
})
