---
"@asteby/metacore-genui": minor
---

`tabs[].icon` acepta, además del conjunto base (`map`, `cards`, `table`, `dashboard`, `list`, `calendar`, `chart`), un nombre de icono que resuelve el host con `resolveIcon` (p. ej. `MapPin` de lucide), con patrón `^[A-Za-z][A-Za-z0-9]{0,63}$` (`$defs/iconName`; sin claves de prototipo). Cambio aditivo y retrocompatible: `parseGenUI` y el validador Go del kernel aceptan los mismos documentos. Esquema y vectores de conformidad sincronizados con metacore-kernel (tipos regenerados; 4 vectores válidos y 7 inválidos nuevos).
