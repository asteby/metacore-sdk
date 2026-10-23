---
'@asteby/storefront-react': patch
---

account: `<AccountAuth form={Form} />` acepta el `Form` real de react-router sin casts (`form` es `'form' | ComponentType<AccountFormProps>`; `AccountFormProps` se exporta desde `@asteby/storefront-react/account`).
