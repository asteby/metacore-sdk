---
"@asteby/metacore-support-embed": minor
---

El widget de soporte soporta tres modos de presentacion: `floating` (como hasta ahora), `inline` (el iframe se monta dentro de un elemento de la pagina; espera al destino con un `MutationObserver` acotado y falla en silencio) y `push` (riel lateral que empuja el contenido). Los valores salen del perfil publico validado (`display_mode`, `inline_target`, `inline_height`, `panel_width`, `offset`, `launcher_shape`, `launcher_label`) y el cliente los sobrescribe con `data-*` (`data-channel`, `data-mode`, `data-target`, ...) o `MetacoreSupport('init', ...)`. Nuevos comandos `init`, `mount`, `unmount`, `toggle`, `setLanguage` y `reset`. Nuevo embed en codigo: componente `<SupportEmbed>` y `mountSupportEmbed(el, opts)`, que reutilizan `SupportFrame` y `createEmbedTransport` sin iframe.
