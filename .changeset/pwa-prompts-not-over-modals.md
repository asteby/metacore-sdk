---
"@asteby/metacore-pwa": patch
---

Auditoría Ronda D: los avisos persistentes (Instalar App, Actualización, permiso de notificaciones) ya no se quedan encima de los diálogos abiertos ni tapan sus campos y botones. Se retiran mientras hay un diálogo abierto y vuelven al cerrarlo (si el usuario no los descartó). Nuevos exports: `useModalOpen`, `hasOpenModal`.
