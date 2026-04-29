---
'@asteby/metacore-app-providers': patch
---

Dispatch `metacore:metadata-changed` window event after a successful addon install.

Hosts that wire their sidebar / dashboard against `/metadata/all` and `/marketplace/installs` listen for this event to refetch without a page reload, so the freshly-installed addon shows up in the nav within the same session. The event detail carries `{reason: 'addon-installed', addonKey}` for finer-grained handling.
