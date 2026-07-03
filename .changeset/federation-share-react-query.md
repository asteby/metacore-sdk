---
"@asteby/metacore-starter-config": minor
---

Module Federation: `@tanstack/react-query` ahora es singleton compartido en `METACORE_FEDERATION_SINGLETONS`. react-query lleva un React context (el QueryClient): el host renderiza `<QueryClientProvider>` y el `@asteby/metacore-app-providers` compartido llama `useQueryClient`/`useQuery` dentro de él. Sin compartir react-query como singleton, el provider del host y el consumidor en app-providers podían resolver copias distintas de react-query — contextos distintos — y la SPA crasheaba de forma intermitente con "No QueryClient set, use QueryClientProvider to set one" lanzado desde el chunk loadShare de app-providers (según qué contenedor gana la negociación del share). Todo host/addon que use `metacoreFederationShared()` hereda el fix; cada addon con `shared` manual debe agregar `"@tanstack/react-query": { singleton: true }` y tenerlo como devDependency para que MF resuelva el bare specifier en build-time.
</content>
