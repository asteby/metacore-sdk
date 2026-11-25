# @asteby/metacore-support-embed

## 1.1.0

### Minor Changes

- eeb0a64: El widget de soporte soporta tres modos de presentacion: `floating` (como hasta ahora), `inline` (el iframe se monta dentro de un elemento de la pagina; espera al destino con un `MutationObserver` acotado y falla en silencio) y `push` (riel lateral que empuja el contenido). Los valores salen del perfil publico validado (`display_mode`, `inline_target`, `inline_height`, `panel_width`, `offset`, `launcher_shape`, `launcher_label`) y el cliente los sobrescribe con `data-*` (`data-channel`, `data-mode`, `data-target`, ...) o `MetacoreSupport('init', ...)`. Nuevos comandos `init`, `mount`, `unmount`, `toggle`, `setLanguage` y `reset`. Nuevo embed en codigo: componente `<SupportEmbed>` y `mountSupportEmbed(el, opts)`, que reutilizan `SupportFrame` y `createEmbedTransport` sin iframe.

## 1.0.0

### Minor Changes

- be5e368: Nuevo paquete: widget de soporte para sitios de empresas. `loader.js` (iframe + lanzador sin dependencias, `postMessage` con origen verificado en ambos sentidos) y la aplicacion del frame (`SupportThread` sobre `createEmbedTransport`, tema por `PublicProfile` validado, es/en, modo anonimo o identificado con JWT de la empresa). URLs y rutas las inyecta el Hub por `<meta>`.

### Patch Changes

- Updated dependencies [be5e368]
- Updated dependencies [be5e368]
- Updated dependencies [be5e368]
  - @asteby/metacore-support-ui@1.0.0
