---
'@asteby/storefront-react': patch
---

Modales y sheets compartidos: header y footer fijos, solo el cuerpo hace scroll. `ScanTaxDocument` ahora es una columna flex con `max-height` en `dvh` y safe-area (`[data-sf-scan-body]` scrollea con `overscroll-behavior: contain`; los enlaces «Descárgala aquí / Captura tus datos a mano» y las acciones de confirmar quedan fijos al pie). `useModalDialog` bloquea el scroll del fondo (con contador, el cajón del carrito deja de tener su propio bloqueo). Los colores del sheet salen de variables (`--sf-fiscal-sheet-bg|fg|border`, `--sf-fiscal-scrim`) y de `--sf-dialog-*` en la vista previa de factura, sin negro fijo. Nueva ranura `sheetBody`.

`IdentityDocumentReader`: tras leer la constancia muestra un aviso único («Datos leídos de tu constancia. Revisa y corrige si hace falta») y una tarjeta compacta (RFC, nombre, CP, régimen) con «Usar estos datos» y «Corregir»; el formulario completo solo se abre si falta o falla algo, o al pulsar «Corregir». El selector de régimen aparece solo si la constancia trae varios. `FiscalIdentityFields` acepta `quiet` para omitir las marcas «De tu constancia» por campo y las ayudas largas.
