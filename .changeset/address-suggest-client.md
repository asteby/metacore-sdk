---
"@asteby/storefront": minor
---

feat(storefront): `client.addressSuggest({ q, country, zip, limit, lat, lng, locale })` sobre `GET /storefront/address/suggest` (Storefront API 1.16, aditivo) y los tipos `AddressSuggestion` / `AddressSuggestions` / `AddressSuggestParams`. Rechaza `q` de menos de 3 caracteres sin hacer la petición. El mock sirve la ruta (`createMockStorefront({ addressSuggestions })`; sin ellas responde `available: false`, como un mercado sin proveedor).
