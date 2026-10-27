---
'@asteby/storefront-react': patch
---

`AddressFields`: la ciudad o municipio que resuelve el código postal también queda bloqueada, igual que el estado. Cuando la consulta (`lookupPostalCode`) devuelve ciudad y no es ambigua (`PostalCodeInfo.cities` con varias), el campo queda de solo lectura (`readOnly` + `aria-readonly`, nunca `disabled`, así que su valor sí viaja en el envío) con la misma nota, tooltip (`cityLocked`, es/en) y enlace «Cambiar código postal» que el estado. Si el código no se resuelve o la consulta falla, el campo sigue editable para no bloquear la compra; al cambiar el código se vuelve a resolver y se actualizan los valores. Nueva prop `lockCityOnFill` (por omisión sigue a `lockProvinceOnFill`). La colonia sigue editable.
