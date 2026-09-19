import { defineConfig } from 'vitest/config'

// Node environment — mirror the pattern used by @asteby/metacore-marketplace.
export default defineConfig({
  test: {
    environment: 'node',
    include: [
      'src/**/*.test.ts',
      'src/**/*.test.tsx',
      '__tests__/**/*.test.ts',
      '__tests__/**/*.test.tsx',
    ],
  },
})
