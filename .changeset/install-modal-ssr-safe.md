---
"@asteby/metacore-marketplace": patch
---

InstallConfirmModal ya no falla al renderizarse sin DOM (SSR, renderToStaticMarkup): el portal a body solo se usa cuando existe `document`.
