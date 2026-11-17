---
'@asteby/metacore-ui': minor
'@asteby/metacore-runtime-react': minor
---

Add the shared `AddonLogo` primitive (ui/primitives): addon/provider logos fill a padded white tile with `object-contain` (inset ring instead of a layout-eating border), so wide, tall, SVG and transparent-PNG logos are never cropped. `AddonConfigSurface` gains an optional `logo` slot for the "Configurar <addon>" header.
