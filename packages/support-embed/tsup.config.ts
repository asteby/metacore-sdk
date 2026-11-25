import { defineConfig } from 'tsup'

// Los dos artefactos que el Hub copia y sirve (`sync-support-embed`): el loader sin dependencias
// y la aplicacion del frame con todo incluido (CSP `script-src 'self'`, sin CDN).
export default defineConfig([
  {
    entry: { loader: 'src/loader-entry.ts' },
    outDir: 'dist/embed',
    format: ['iife'],
    // tsup nombra los IIFE `*.global.js`; el paquete (`exports["./loader"]`) y el Hub sirven `loader.js`.
    outExtension: () => ({ js: '.js' }),
    minify: true,
    target: 'es2020',
    platform: 'browser',
    clean: false,
    sourcemap: false,
    splitting: false,
    dts: false,
  },
  {
    entry: { frame: 'src/frame-main.tsx' },
    outDir: 'dist/embed',
    format: ['esm'],
    minify: true,
    target: 'es2022',
    platform: 'browser',
    clean: false,
    sourcemap: false,
    splitting: false,
    dts: false,
    noExternal: [/.*/],
    define: { 'process.env.NODE_ENV': '"production"' },
  },
])
