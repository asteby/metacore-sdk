import { defineMetacoreConfig } from '@asteby/metacore-starter-config/vite'

// See https://github.com/asteby/metacore-sdk/tree/main/packages/starter-config
// for available options (router, pwa, extraPlugins, extend).
export default defineMetacoreConfig({
  router: true,
  extend: {
    server: { port: 5173 },
  },
})
