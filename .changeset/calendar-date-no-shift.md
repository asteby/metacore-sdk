---
"@asteby/metacore-runtime-react": patch
---

Un campo `date` servido como UTC medianoche (`2026-09-27T00:00:00Z`) ya no se muestra como el día anterior al oeste de UTC. Pasaba en el selector de fecha del modal de registro y en la celda de fecha sin zona de la org. Se lee el día `YYYY-MM-DD` como día local, igual que `DynamicDateField` (QA Pitsline PIT-025).
