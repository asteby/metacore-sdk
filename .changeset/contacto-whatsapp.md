---
'@asteby/storefront-react': minor
---

Nuevo subpath `@asteby/storefront-react/contact` (+ `contact.css`): `WhatsAppBubble` (burbuja flotante, un `<a>` que funciona sin JavaScript, con `message`, `label`, `position`, `offset`, `pathname` + `hideOn`), `PhoneLink` (`tel:`) y los helpers puros `whatsappUrl`, `telHref`, `phoneDigits`, `isUsablePhone` e `isHiddenPath`. Sin número usable no pinta nada. Textos es/en, tema por variables `--sf-whatsapp-*`, áreas seguras, `prefers-reduced-motion` y sin cálculos con el ancho del viewport.
