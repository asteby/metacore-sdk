---
"@asteby/metacore-runtime-react": minor
---

Add `OrgRuntimeProvider` (+ export `CurrencyContext`/`TimeZoneContext`/`useCurrency`/`useTimeZone`) so host apps can feed the org's display config (timezone, currency, image-url resolver) to EVERY nested renderer from one place. Standalone surfaces like the full-page detail view — which mount `DynamicRelations`/`DynamicTable` outside the record dialog — previously had no provider, so money fell back to USD and datetimes to the browser zone. Wrap the authenticated app root once for app-wide org consistency.
