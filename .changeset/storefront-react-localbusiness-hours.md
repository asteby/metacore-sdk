---
"@asteby/storefront-react": patch
---

`localBusinessJsonLd` ya no emite `openingHours` inválido con horarios de texto libre: solo se emite si cada token es sintaxis schema.org estricta (o si hay `opening_hours` estructurado), y `geo` solo con coordenadas válidas. Nuevo helper `openingHoursJsonLd`.
