import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    // Pure-logic tests run in node; component tests opt into happy-dom with a
    // `// @vitest-environment happy-dom` docblock.
    environment: 'node',
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
    testTimeout: 15000,
  },
})
