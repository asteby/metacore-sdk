---
'@asteby/metacore-pwa': patch
---

Drop the `metacorePWA` Vite-plugin re-export from the package root.

Re-exporting `./vite-plugin` from the main entry pulled `vite-plugin-pwa` (Node-only — uses `module.createRequire`) into every consumer's browser bundle. Apps that imported `@asteby/metacore-pwa` for `<PWAProvider>` or `<PWAUpdatePrompt>` crashed at runtime with `(0 , import_browser_external_module.createRequire) is not a function`.

The plugin already lives at `@asteby/metacore-pwa/vite-plugin`. Apps that wire it in `vite.config.ts` should import the sub-export directly:

```ts
import { metacorePWA } from '@asteby/metacore-pwa/vite-plugin'
```
