import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    // Component tests opt into happy-dom with a `// @vitest-environment happy-dom` docblock.
    environment: 'node',
    setupFiles: ['./test/setup.ts'],
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
    testTimeout: 15000,
    environmentOptions: { happyDOM: { url: 'http://localhost/' } },
  },
})
