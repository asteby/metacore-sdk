import { defineConfig } from 'vitest/config'

// Node environment — mirror the pattern used by @asteby/metacore-auth and
// starter-core. We exercise the client/hooks/components with
// `react-dom/server` so the suite stays free of jsdom and runs in the same
// turbo cache slot as the rest of the SDK.
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
