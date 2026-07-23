---
'@asteby/metacore-runtime-react': minor
---

DynamicTable/useDynamicRowActions: nuevo prop `mutationEndpoint` — base de endpoint para escrituras (delete individual y masivo) cuando difiere del endpoint de listado. Hosts que listan desde una ruta role-scoped (`/dynamic/:model/me`) borraban contra `<lista>/<id>` inexistente (404); ahora pueden listar desde `/me` y mutar contra la base real. Fallback: `endpoint` (sin cambio para hosts existentes).
