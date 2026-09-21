---
'@asteby/metacore-lib': minor
'@asteby/metacore-starter-core': minor
---

Add `detectTimezone()` (browser IANA zone, empty when undetectable) and drop the Mexico-biased fallback list from `getAllTimezones()`: engines without `Intl.supportedValuesOf` now get the detected zone + UTC. No country is ever a default.
