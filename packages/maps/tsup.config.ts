import { defineConfig } from 'tsup'

export default defineConfig({
  entry: {
    index: 'src/index.ts',
    register: 'src/register.ts',
    view: 'src/view.ts',
    panel: 'src/panel.ts',
    'timeline-panel': 'src/timeline-panel.ts',
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
  // Everything else (react, maplibre-gl, pmtiles, runtime-react, storefront/geo)
  // is a dependency/peer and stays external automatically.
  external: ['maplibre-gl', /^maplibre-gl\//, 'pmtiles', 'react-i18next', /^@asteby\//],
})
