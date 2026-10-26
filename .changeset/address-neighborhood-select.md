---
"@asteby/storefront-react": minor
---

`AddressFields`: nueva prop opcional `neighborhoodList="select"`. Cuando el código postal tiene varias colonias, el campo pasa a ser una lista real (`<select>`) en vez de sugerencias en un `datalist`; con una sola colonia se rellena igual. Por defecto sigue el `datalist` (sin cambios para quien no lo active).
