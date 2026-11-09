---
"@asteby/metacore-runtime-react": minor
---

AddonConfigSurface: una credencial de conector con `auto` (generada por el host) ya no se pide; la superficie muestra "Conectada automáticamente" / "Clave manual vigente" / "Requiere acción" y un botón Rotar que muestra la clave nueva una sola vez (`POST /integrations/:provider/auto/:key/rotate`). Sin `auto` nada cambia.
