import { resolve } from 'node:path';
import react from '@vitejs/plugin-react-swc';
import { defineConfig } from 'vite';

// Library build for @asteby/metacore-starter-core.
// Entry: src/index.ts — exports se agregarán en la fase 2 de migración.
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
    },
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    sourcemap: true,
    lib: {
      entry: resolve(__dirname, 'src/index.ts'),
      name: 'MetacoreStarterCore',
      formats: ['es', 'cjs'],
      fileName: (format) => (format === 'es' ? 'index.js' : 'index.cjs'),
    },
    rollupOptions: {
      // Peer deps — nunca los bundleamos, los provee la app consumidora.
      external: [
        'react',
        'react-dom',
        'react/jsx-runtime',
        '@asteby/metacore-sdk',
        '@asteby/metacore-ui',
        '@asteby/metacore-auth',
        '@asteby/metacore-theme',
        '@tanstack/react-router',
        'zustand',
        /^zustand\//,
        /^@asteby\/metacore-/,
        /^@tanstack\//,
        /^@radix-ui\//,
        'axios',
        'class-variance-authority',
        'clsx',
        'cmdk',
        'date-fns',
        /^date-fns\//,
        'framer-motion',
        'input-otp',
        'lucide-react',
        'react-day-picker',
        'react-hook-form',
        'react-phone-number-input',
        /^react-phone-number-input\//,
        'sonner',
        'tailwind-merge',
        'zod',
        '@monaco-editor/react',
      ],
      output: {
        preserveModules: false,
        globals: {
          react: 'React',
          'react-dom': 'ReactDOM',
        },
      },
    },
  },
});
