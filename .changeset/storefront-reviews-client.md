---
"@asteby/storefront": minor
---

Reseñas de producto en el cliente de la Storefront API: `sf.reviews.list/eligibility/create/mine/update/delete/grant/import`, opción `reviewGrant` (cabecera `X-Review-Grant`) y tipos `ProductReview`, `ReviewList`, `ReviewSummary`, `ReviewEligibility`, `MyReview`, `ReviewInput`, `ReviewGrant`. El mock acepta `reviews: { seed, purchased }` y sirve las rutas del addon `product_reviews` (solo compradores escriben, nada público hasta aprobar, texto sin enlaces/correo/teléfono, nombre `Nombre I.`). Aditivo: nada existente cambia.
