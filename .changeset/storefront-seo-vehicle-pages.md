---
'@asteby/storefront': minor
'@asteby/storefront-react': minor
---

SEO and merchant primitives every storefront can use (extracted from the ProtekAuto store):

- `@asteby/storefront` — `gtmIds`, `gtmScript`, `gtmNoscriptSrc`: Google Tag Manager containers from configuration (`GTM-XXXXXXX`, validated), with the official loader (a bare `gtm.js` script never starts the container).
- `@asteby/storefront` — `ga4DataLayerPushes(event)`: the same GA4 ecommerce events as Tag Manager `dataLayer` pushes (clears `ecommerce` first), so a store that loads GTM sends events there instead of `gtag` and a visit is never counted twice.
- `@asteby/storefront-react` — `listingSeo(url, canonicalBase, { cursorParam })`: paging alone is crawlable with its own canonical; any other query parameter is `filtered` (noindex). Do not block the cursor in robots.txt.
- `@asteby/storefront-react/fitment` — per-vehicle pages (`/vehicles/:make/:model/:year`): `findMake`, `findModel`, `listedMakes`, `modelYears`, `enginesForYear`, `parseYear`, `yearTags`, `chunkTags`, `yearRange`, `yearRuns`, `vehicleSitemapPaths`, `fitGroupsFromTags`, `fitLinksFromTags` (product → vehicle pages, minimal serializable shape) and `loadYearProducts`. They honour `FitmentConfig` (tag prefix, make aliases) and never decide fitment themselves. `engineCovers` and `modelCovers` are now exported.
