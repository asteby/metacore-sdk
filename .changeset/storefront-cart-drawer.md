---
'@asteby/storefront-react': minor
---

Nuevo subpath opcional `@asteby/storefront-react/cart` (y hoja `cart.css`): `CartDrawer`, el cajón lateral "Tu carrito (N)" para tiendas con OPS. Sin textos, rutas, moneda ni marca fijos (labels, paths, renderers, iconos y `classNames` por props); muestra `cart.cost` de OPS y muta por la acción de ruta de la tienda con formularios nativos (sin JavaScript) o un `Form` de fetcher inyectable. Incluye `openCartDrawer`/`closeCartDrawer`/`useCartDrawer`, `useOpenCartDrawerWhenDone` (abre al terminar un agregado) y `handleCartLinkClick` (el enlace de la cabecera abre el cajón, con `href` de respaldo). `<dialog>` modal con foco atrapado, Esc, clic fuera, scroll del fondo bloqueado y `prefers-reduced-motion`.
