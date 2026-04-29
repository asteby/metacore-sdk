---
'@asteby/metacore-app-providers': patch
---

Trim redundant addon-key from install toasts.

`Instalando ${addonKey}…` repeated information the user already saw on the iframe button. The host now shows generic `Instalando…` / `Addon instalado` / `Falló la instalación` (with the error message in the toast description on failure).
