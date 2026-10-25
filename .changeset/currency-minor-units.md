---
'@asteby/metacore-lib': minor
'@asteby/metacore-runtime-react': patch
'@asteby/metacore-starter-core': patch
---

Los decimales de moneda salen de la moneda (módulo money), no de un `2` fijo: `dynamic-columns` deja de usar `decimals ?? 2` (usa `currencySpec(code).minorUnits` salvo que la columna fije `styleConfig.decimals`) y los formateadores `formatCurrency` (lib y starter-core), `formatMoney` (business), `formatFieldValue` (money) y el valor de widget `currency` pasan a ser envoltorios de `formatMoney`. Nuevos `moneyFromNumber` y `numberToDecimal` en `@asteby/metacore-lib`.
