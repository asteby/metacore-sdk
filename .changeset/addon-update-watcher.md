---
'@asteby/metacore-sdk': minor
---

MetacoreProvider revalida el catálogo de addons solo (al volver el foco a la
pestaña y cada 5 min) y expone `updatedAddons` en el contexto: los addons cuya
versión servida cambió desde que esta ventana los cargó. Los hosts lo usan para
avisar "addon actualizado — recargar" en ventanas abiertas (un contenedor de
federation solo se carga una vez por página).
