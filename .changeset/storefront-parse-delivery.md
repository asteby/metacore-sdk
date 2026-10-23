---
"@asteby/storefront": minor
---

Add `parseDelivery`, `deliveryInput` and `deliveryNotices` (pure checkout helpers). `parseDelivery` splits the delivery radio value on the first colon only, so ids such as `rate:skydropx:<id>` are no longer truncated; `deliveryNotices` separates `missing_weight` from other unavailable providers. Storefronts should import these instead of keeping their own copy.
