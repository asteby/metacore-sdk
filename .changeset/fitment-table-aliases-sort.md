---
'@asteby/storefront-react': minor
---

`@asteby/storefront-react/fitment`: two additions so a store configures its fitment in one place (no behavior change by default):

- `FitmentConfig.tableMakeAliases` — make abbreviations that appear only in the free-text compatibility TABLE (`{ vw: 'volkswagen', chevy: 'chevrolet' }`). They are added to `makeAliases` only when a table row is matched (`rowIsVehicle`, `fitFromTable`, `rowsNamingVehicle`, `fitStatus`'s table path) and never become fit-tag variants, so they cost no slot of `tags_any` and never make a part fit by themselves.
- `makeOptions(catalog, { sort: 'label', locale })` — alphabetical make list for a selector (`sort: 'catalog'`, the default, keeps the catalog's priority order). New exported type `MakeOptionsConfig`.
