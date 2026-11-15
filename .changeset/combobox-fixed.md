---
"@asteby/storefront-react": patch
---

`VehicleCombobox`: on desktop the list now uses fixed positioning next to the field, so an `overflow` container such as the header dropdown no longer clips it. It opens upward when there is no room below and corrects its offset when an ancestor has a `transform`.
