---
"@asteby/metacore-runtime-react": minor
---

feat(license): estados de licencia claros y consistentes en `<LicenseGate>`, banner e insignia. Una sola derivación (`deriveLicenseView`) para vigente, por vencer, en gracia, vencida en solo lectura con exportación (`on_expiry: 'read_only'`), desactivada (`revoked`), hub caído (solo dueño), sin licencia y clonada (`notices: ['clone_suspected']`, solo dueño). Textos exactos en es/en (`LICENSE_MESSAGES`, `registerLicenseMessages`) con el contacto del vendedor cuando la licencia lo trae (`seller`), sin repetir instrucciones. El modal tiene encabezado y pie fijos y solo el cuerpo se desplaza. Compatible hacia atrás: sin los campos nuevos (`on_expiry`, `seller`, `notices`) el comportamiento y los textos de los estados existentes no cambian; `onExport`, `isOwner` y `acceptsActivationLink` son opcionales.
