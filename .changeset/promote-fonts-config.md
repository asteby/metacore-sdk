---
'@asteby/metacore-starter-config': minor
---

Add `@asteby/metacore-starter-config/fonts` subpath that exports the canonical `fonts` array (`['inter', 'manrope', 'system']`) plus a `Font` type alias.

Apps consuming the new `FontProvider` API in `@asteby/metacore-app-providers` (which now requires an explicit `fonts` prop) can import the convention from this single source instead of redeclaring the list in every app:

```ts
import { fonts } from '@asteby/metacore-starter-config/fonts'
import { FontProvider } from '@asteby/metacore-app-providers'

<FontProvider fonts={fonts}>{children}</FontProvider>
```
