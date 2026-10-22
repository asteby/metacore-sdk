import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    // Pure-logic tests run in node; component tests opt into happy-dom with a
    // `// @vitest-environment happy-dom` docblock.
    environment: 'node',
    setupFiles: ['./test/setup.ts'],
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
    testTimeout: 15000,
    // localStorage needs a real origin in happy-dom.
    environmentOptions: { happyDOM: { url: 'http://localhost/' } },
  },
})
