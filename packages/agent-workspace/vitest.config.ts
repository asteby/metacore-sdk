import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    // Moved agent code touches window/localStorage, so tests run in happy-dom.
    environment: 'happy-dom',
    // localStorage needs a real origin in happy-dom.
    environmentOptions: { happyDOM: { url: 'http://localhost/' } },
    setupFiles: ['./test/setup.ts'],
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
    testTimeout: 15000,
  },
})
