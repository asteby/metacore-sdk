---
"@asteby/metacore-app-providers": minor
---

El branding ya no pisa las superficies de un theme pack. `applyBranding` pintaba `--background`, `--card`, `--sidebar`… inline en `<html>`, y el inline gana a cualquier selector: el tema glass (o cualquier pack con paleta propia) quedaba con fondos opacos en cuanto cargaba la marca. Ahora sólo el acento (`--primary`, `--primary-foreground`, `--chart-2`) va inline; las superficies van a una hoja `<style id="metacore-branding-surfaces">` que aplica cuando `<html>` no tiene `data-ui-theme` (o vale `default`), y con un pack activo sólo `--ring` y `--sidebar-primary*` siguen al color de marca. Nuevos exports: `buildBrandingSurfaceCss` y `THEME_PACK_ATTRIBUTE`.
