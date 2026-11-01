import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    // SSR tests run in node (renderToString); interactive tests opt into
    // happy-dom with a `// @vitest-environment happy-dom` docblock.
    environment: 'node',
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
    testTimeout: 15000,
    // Unit tests never reach the network: a 3DS iframe (`https://acs.test/...`) must not make happy-dom resolve and load a
    // real host (DNS errors in CI, timing noise). The dialog and its `src` are still asserted.
    environmentOptions: { happyDOM: { settings: { navigation: { disableChildFrameNavigation: true } } } },
  },
})
