---
"@asteby/metacore-runtime-react": minor
---

`useBundledTranslation(bundles)`: primitivo de i18n para componentes que traen su diccionario (addons federados, widgets): el idioma es el del i18next del host (preferencia del usuario / idioma de la organización), nunca `navigator.language`; el host gana si tiene la clave (sobrescritura del tenant) y el diccionario empaquetado es el respaldo; interpolación `{var}` y `{{var}}`.

Los widgets registrados de campo (`registerFieldWidget`) y de relación (`registerRelationWidget`) se pintan dentro de `HostWidgetBoundary`: un error del widget (p. ej. `NotFoundError: insertBefore/removeChild` con el traductor del navegador activo) queda contenido en un aviso local con «Reintentar» en lugar de tirar la página a la pantalla 500.
