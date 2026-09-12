---
'@asteby/metacore-runtime-react': patch
---

Coerce blank line-item discount to 0 so create payloads never POST discount:"" (avoids server "discount is required").
