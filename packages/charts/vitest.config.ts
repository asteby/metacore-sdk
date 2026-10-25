import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    // Interactive tests run in happy-dom (docblock); the size budget runs in node.
    environment: 'node',
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
    testTimeout: 30000,
  },
})
