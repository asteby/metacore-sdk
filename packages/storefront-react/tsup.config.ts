import { defineConfig } from 'tsup'

export default defineConfig({
  entry: {
    index: 'src/index.ts',
    mockups: 'src/mockups/index.ts',
    cart: 'src/cart-drawer/index.ts',
    checkout: 'src/checkout/index.ts',
    'checkout-server': 'src/checkout/server.ts',
    fitment: 'src/fitment/index.ts',
    payments: 'src/payments/index.ts',
    'payments-server': 'src/payments/server.ts',
    account: 'src/account/index.ts',
    'account-server': 'src/account/server.ts',
    fiscal: 'src/fiscal/index.ts',
    subjects: 'src/subjects/index.ts',
    'subjects-server': 'src/subjects/server.ts',
    'fiscal-server': 'src/fiscal/server.ts',
    promotions: 'src/promos/index.ts',
    postal: 'src/postal/index.ts',
    ui: 'src/ui/index.ts',
  },
  format: ['esm', 'cjs'],
  // tsup's dts worker sets `baseUrl`, deprecated in TypeScript 6.
  dts: { compilerOptions: { ignoreDeprecations: '6.0' } },
  sourcemap: true,
  clean: true,
  target: 'es2022',
  external: ['react', 'react/jsx-runtime', '@asteby/storefront', '@asteby/storefront/geo', '@asteby/storefront/mockup'],
  treeshake: true,
})
