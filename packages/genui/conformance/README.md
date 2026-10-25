# Vectores de conformidad de genui

Casos JSON compartidos entre el validador TypeScript (este paquete) y el espejo
Go del kernel (`metacore-kernel/genui`, paquete `genui/v2`). Un vector que una
implementación no cumple rompe su CI: así no se desalinean los dos lados.

Contrato: `../schema/genui-v2.schema.json` (fuente única) y el ADR 0001 del SDK
(`docs/adr/0001-genui-ui-declarativa-universal.md`, §2.5-2.7).

## Formato

Un archivo por caso, `{ "description", "input", "options"?, "expect" }`.

| Carpeta | `input` | `expect` |
|---|---|---|
| `valid/` | documento genui/v2 (objeto) | `{ "ok": true }` |
| `invalid/` | documento (objeto o cadena JSON) | `{ "ok": false, "code": "genui.…" }` |
| `upgrade/` | documento genui/v1 | `{ "ok": true, "output": <v2> }` o `{ "ok": false, "code" }` |
| `downgrade/` | `{ "spec": <v2>, "caps"?: { "versions", "blocks"?, "verbs"? } }` | `{ "ok": true, "output": <v1 o v2> }` o `{ "ok": false, "code" }` |

`options.allowExternalLinks` (por defecto `false`) corresponde a la opción del
mismo nombre del validador. Los `code` son los de `GENUI_ERROR_CODES`
(`src/errors.ts`); la comparación es exacta, igual que `output` (igualdad
profunda de JSON). `downgrade` sin `caps` asume `{"versions":["genui/v1"]}`.

Los límites que los vectores ejercitan están en `GENUI_V2_LIMITS`
(`src/validate-v2.ts`) y deben ser idénticos en Go.

## Cómo los toma el kernel (PR aparte)

Hasta que exista `scripts/sync-genui-vectors.mjs` (ADR §2.7), la copia es
manual y de una sola vía, SDK → kernel:

```sh
SDK=/ruta/a/metacore-sdk/packages/genui
KERNEL=/ruta/a/metacore-kernel
mkdir -p $KERNEL/genui/schema $KERNEL/genui/testdata/conformance
cp $SDK/schema/genui-v2.schema.json $KERNEL/genui/schema/
rsync -a --delete $SDK/conformance/{valid,invalid,upgrade,downgrade} $KERNEL/genui/testdata/conformance/
```

El kernel anota el commit del SDK de donde copió (archivo de bloqueo con el
hash del contenido) y su `go test` recorre las cuatro carpetas. Si el kernel
pasa a ser la fuente del esquema (ADR §2.7), el sentido de la copia se invierte
y el SDK trae los vectores fijados a la versión del kernel; el formato no cambia.

## Regenerar

Los JSON se editan a mano (son la especificación). Un vector nuevo debe
añadirse en el mismo PR que la regla que ejercita, y correr en ambos lenguajes.
