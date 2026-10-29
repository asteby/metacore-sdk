---
'@asteby/storefront-react': patch
---

`./tracking`: `TrackingMapsModule` ya no rechaza el módulo real de mapas. `loadMaps={() => import('@asteby/metacore-maps')}` (el ejemplo del README) compila tal cual, sin conversión de tipo; antes fallaba porque `Route` exige `path`. Solo cambian los tipos, no el comportamiento. Una comprobación de tipos (`maps-loader.typecheck.ts`) compila ese fragmento contra el módulo real.
