---
"@asteby/metacore-runtime-react": minor
---

Render "pro" de URLs, imágenes y archivos: una URL nunca se muestra cruda. Nuevas primitivas compartidas en `rich-url.tsx` (`MediaValue`, `UrlChip`, `FileChip`, `ImageThumbnail`, `RichText`, `linkifyText`, `classifyUrl`, …) que consumen por igual la CELDA de la tabla/kanban (`dynamic-columns.tsx`) y el DETAIL DIALOG (`dynamic-record.tsx`) — cero copy-paste.

- URL de página (ej. `github_url` con la issue completa) → chip compacto con icono `ExternalLink` + label corto (hostname, ej. "github.com", o el nombre de archivo si aplica); URL completa en el tooltip; abre en pestaña nueva. Ya no se ve la URL de 120 caracteres.
- URL de imagen (jpg/png/gif/webp/avif/svg y rutas `…/storage/media/…` sin extensión) → THUMBNAIL inline redondeado y clickeable que abre la imagen completa; `onError` degrada a link chip (nunca un icono de imagen rota). En la celda el thumbnail es chico (~h-8) para no romper la altura de fila; en el dialog es más grande.
- URL de archivo (pdf/zip/docx/mp4/…) → chip con icono `FileText` + nombre del archivo.
- URLs embebidas en texto largo (body, textarea, long-text) → se linkifican con el mismo estilo (bare o markdown `[label](url)`), recortando puntuación final y respetando paréntesis balanceados; imágenes y archivos embebidos también se renderizan inline.

Sin llamadas de red para renderizar (nada de servicio de favicons — CSP/privacidad): el icono es un glyph lucide local.
