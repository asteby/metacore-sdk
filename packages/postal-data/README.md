# @asteby/postal-data

Offline postal-code catalogs, loaded on demand, shared by every storefront (God's Nutrition, Local, ProtekAuto...).

- `@asteby/postal-data/mx`: `lookupMxPostalCode(cp)` -> state, municipality, neighbourhoods (~32 k codes).
- `@asteby/postal-data/us`: `lookupUsPostalCode(zip)` -> state and city (~41 k ZIPs; ZIP+4 accepted).
- `@asteby/postal-data`: both, plus `resolvePostalCode({ country, zip, official })`, the rule every shop used to copy:
  US -> offline catalog only (OPS' catalog is Mexican); MX -> OPS' region pack first (`official`, 3 s cap), offline
  fallback if it throws, times out or does not know the code; any other market -> `null`. Never invents a result.

Why a separate package and not part of `@asteby/storefront-react`: the catalogs are ~4 MB of JSON. Here they are separate
lazy chunks (`import()` on first lookup), so nothing is paid by a shop that never asks, and the client bundle never sees
them (server only). The shapes are compatible with `PostalCodeInfo` of `@asteby/storefront-react/checkout`.

```ts
// app/routes/postal-code.ts (React Router resource route)
import { resolvePostalCode } from '@asteby/postal-data'

const { info, officialFailed } = await resolvePostalCode({
  country, // 'MX' | 'US'
  zip,
  official: (zip) => storefront.postalCode(zip),
})
```

Data: GeoNames Postal Code data, CC BY 4.0 (https://creativecommons.org/licenses/by/4.0/); the attribution travels inside
each JSON. Regenerate with `scripts/build-mx.mjs` / `scripts/build-us.mjs` (usage in the header of each script).
