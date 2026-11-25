---
"@asteby/metacore-sdk": minor
---

Nuevo subpath `@asteby/metacore-sdk/support`: tipos del contrato de soporte generados desde los fixtures del kernel (`node scripts/gen-support-types.mjs --src <testdata>`), `applySupportEvent` (reductor puro de eventos del callback), `isAttachmentExpired` y `createSupportApi(transport, { basePath, events })` desacoplado del transporte.
