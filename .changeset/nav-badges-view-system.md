---
"@asteby/metacore-ui": minor
"@asteby/metacore-runtime-react": minor
"@asteby/metacore-i18n": minor
---

Notificaciones pro "saber a dónde ir": `NavBadge` (tono por severidad info/attention/urgent/critical, tope 99+, aria-label con el número exacto, pulso solo con motion-safe), `NavLinkItem.badge` acepta `NavBadgeValue` y `badgeId`, `AlertCard` (KPI con CTA), `useNavBadges` (un batch a `/nav/counts`, refresco por realtime, sin polling), `applyNavBadges` (carpetas suman deduplicando por id), `useDocumentAttention` (título "(99+) App" + punto en favicon) y el sistema de vistas: `ModelView`, `ViewSwitcher` (Tarjetas | Datos | Mapa opcional, etiqueta de tarjetas sobreescribible por manifest), `ViewToolbar` (búsqueda, chips rápidos, contador+orden, vistas guardables por usuario), estado de filtros compartido por URL entre modos y `ConfigurableCard` definida por `CardSpec`.
