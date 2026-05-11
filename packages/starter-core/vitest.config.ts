import { resolve } from 'node:path'
import { defineConfig } from 'vitest/config'

// Test configuration for starter-core. We keep tests next to the source
// (src/**/__tests__/*) so coverage lights up the same file paths the
// declaration build emits, and we mirror runtime-react's `environment: node`
// — the few component tests we have either run on `react-dom/server` (which
// works in node) or stay below the DOM line by exercising pure logic.
export default defineConfig({
    test: {
        environment: 'node',
        include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
    },
    resolve: {
        alias: {
            '@': resolve(__dirname, 'src'),
        },
    },
})
