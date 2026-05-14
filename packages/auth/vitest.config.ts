import { defineConfig } from 'vitest/config'

// Mirrors runtime-react / starter-core: pure node environment, no jsdom. We
// test the store and the provider's seeding effect without mounting the
// router — `react-dom/server` + a stub for `@tanstack/react-router`'s
// `useNavigate` is enough to exercise everything the wrapper does today.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
  },
})
