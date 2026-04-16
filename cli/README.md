# metacore CLI (spec)

Pendiente de implementación (F5). Este README define el contrato para que el diseño de kernel + SDK ya lo soporte.

## Comandos

```bash
metacore init tickets           # scaffold: manifest.json + frontend/ + migrations/
metacore validate               # valida manifest.json + capabilities + migrations
metacore dev --host http://localhost:8080
                                # hot-reload del addon contra un host corriendo
metacore build                  # produce tickets-1.0.0.tar.gz listo para publicar
metacore publish --registry https://market.example.com
                                # sube bundle, firma, genera licencia
metacore codegen                # regenera sdk/src/types.ts desde kernel/manifest
```

## `metacore dev`

Corre un vite dev server exponiendo `remoteEntry.js` local; inyecta en el host un manifest "dev" con `frontend.entry: http://localhost:5173/...`. Cambios en el addon recargan sin reinstalar.

## `metacore validate`

- Parsea `manifest.json` contra el schema Zod generado.
- Verifica que `capabilities` cubran el código (análisis estático de fetch/db calls en `plugin.tsx`).
- Lint de migrations: DROP sin `--force`, índices sin `CONCURRENTLY` en prod, etc.
- Chequea que `kernel` range sea satisfacible por algún kernel activo en el registry.

## Distribución

El CLI es un binario Go (`go install github.com/anthropic/metacore/cli/metacore`) para cero-deps. Embeds el scaffold del template dentro del binario.
