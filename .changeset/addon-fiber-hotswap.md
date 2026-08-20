---
"@asteby/metacore-sdk": minor
"@asteby/metacore-runtime-react": minor
---

Addon fiber hot-swap without a page reload: Registry.scope/unbind, Plugin.register
may return a Disposable, AddonLoader re-registers federation remotes when `?v=`
changes, and purgeAddonFrontendCache drops only that addon's SW cache (L1).
Hosts call acknowledgeRunningVersion after a successful swap instead of
location.reload / unregistering the service worker.
