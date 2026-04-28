---
'@asteby/metacore-app-providers': minor
---

`MetacoreAppShell` now listens for the `metacore:install` postMessage that the embedded Hub iframe emits when a user clicks "Instalar" on an addon page.

Default behaviour: POSTs `{ addonKey, version, bundleURL }` to the host API at `/marketplace/install` and replies to the iframe with `metacore:installed` on success (or `metacore:install-failed` with the error). Apps can override with the new `onAddonInstall` prop:

```tsx
<MetacoreAppShell
  api={api}
  queryClient={qc}
  onAddonInstall={async (req, source) => {
    await myCustomInstaller(req)
    source?.postMessage({ type: 'metacore:installed', addonKey: req.addonKey }, '*')
  }}
>
```

Pass `onAddonInstall={null}` to disable the listener entirely.

Pairs with `asteby-hq/hub#66` which switches the embedded install widget from "copy this command" to a one-click button.
