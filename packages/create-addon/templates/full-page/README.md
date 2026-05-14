# {{ADDON_NAME}}

{{ADDON_DESCRIPTION}}

Scaffolded with `create-metacore-addon` (template: `full-page`).

## Immersive layout

`manifest.json` sets `frontend.layout = "immersive"`, which tells the host to
hand over the entire viewport to this addon — no sidebar, no topbar. Use this
template for point-of-sale terminals, kitchen-display screens, kiosk-style UIs
or any surface where the surrounding ERP chrome is noise.

Your plugin is responsible for any navigation back to the shell — typically a
small "Back to shell" affordance you wire to `api.host.navigate('/')`.

## Build

```sh
cd frontend
pnpm install
pnpm run build
```

## Package & publish

```sh
metacore build .
metacore publish {{ADDON_KEY}}-<version>.tar.gz
```
