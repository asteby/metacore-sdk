---
"@asteby/metacore-runtime-react": minor
---

Diálogos de acción: resultado de timbrado y errores del servidor.

- #1024 (FAC-3 / PIT-051): nuevo `CfdiStampPanel` / `CfdiStampResultDialog` / `extractStampResult`. Cuando la acción responde con `fiscal_uuid`, `pdf_url` y/o `xml_url`, el diálogo muestra el UUID como texto y enlaces «Descargar PDF» / «Descargar XML» en lugar del JSON. Sin esas claves no se inventa un resultado fiscal.
- #1023 (PIT-046): los diálogos de acción (genérico, wizard y confirmación) pintan un `FormErrorBanner` dentro del diálogo con el 422 (`errors` por campo) o el mensaje y causa de un 500, y permanecen abiertos.
