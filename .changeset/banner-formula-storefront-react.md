---
'@asteby/storefront-react': minor
---

`@asteby/storefront-react/hero`: fórmula de banners editable desde OPS. Nuevo `Banner` (imagen de escritorio y móvil, punto focal como `object-position`, mensaje con velo) y fragmentos de esquema reutilizables por cualquier sección (`bannerFields`, `bannerFocusField`, `bannerLayoutFields`, `bannerImageStyle`): `focus`, `text_position` (izquierda/centro/derecha), `text_vertical` (arriba/medio/abajo), `text_size` (pequeño/mediano/grande) y `scrim` (sin/suave/medio/fuerte). El carrusel (`BannerCarousel`, `bannerCarouselSection`) usa el mismo `Banner` y suma esos campos. Aditivo y retrocompatible: sin los campos nuevos el aspecto es el de siempre. `hero.css` trae las reglas (variables `--sf-hero-scrim-color` y `--sf-hero-scrim`).
