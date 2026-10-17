---
"@asteby/metacore-runtime-react": minor
---

Páginas federadas y vistas declarativas.

- `AddonPageLoader` monta una entrada de `frontend.pages[]`: baja su `expose` por Module Federation, verifica `frontend.integrity` (SRI) antes de importar, aplica un timeout (10 s) y aísla la página en un contenedor con `contain: layout paint`. `AddonLoader` gana `integrity` y `onRenderError`, y envuelve sus `children` en `FederatedErrorBoundary`. `loadFederatedModule` queda exportado para hosts.
- Hooks para el remote, servidos por `<AddonPageHost>`: `useHostContext`, `useHostApi`, `useAddonNavigate` (relativo a la base, sin `window.location`), `useAddonLocation`, `useAddonSearchParams`, `useBreadcrumbs` y `usePageChrome` (título, acciones del header y modo foco). El host lee el chrome con `createPageChromeStore`/`usePageChromeState`.
- `createHostApi(client)`: el `HostApi` que el host entrega al remote. Devuelve solo cuerpos y errores `HostApiError` sin `config` ni cabeceras: el token nunca llega al remote.
- `FederatedErrorBoundary`: error contenido con "Reintentar", `onError` para incidentes y `resetKeys`.
- Vistas declarativas por tipo, cada una en su chunk perezoso: `DeclarativeView` (chart con los widgets del tablero, timeline, calendar, split con `DynamicTable` + paneles, y map como contrato + lista accesible hasta que un paquete de mapas registre el renderer real) y `DetailPanels` (map, timeline por relación o capacidad, chart, relation, stats; `custom` lo registra el host). Registro: `registerViewRenderer`, `registerPanelRenderer`, `preloadViewRenderer`. `DynamicView` enruta a ellas cuando la metadata trae el bloque `view` (`resolveViewKind`); sin él sigue la tabla. `TableMetadata` gana `view` y `detail`.
- Subpaths nuevos: `./testing` (`renderWithHost`, `createMockHostApi`) y `./views/map` (helpers puros del contrato de mapas para `@asteby/metacore-maps`). El test de grafo estático exige que ningún renderer ni el helper de pruebas entren al índice.
