import { defineConfig } from 'vitest/config'

// The first lookup parses a multi-MB JSON chunk: slow CI runners need more than the 5 s default.
export default defineConfig({ test: { environment: 'node', include: ['src/**/*.test.ts'], testTimeout: 30000 } })
