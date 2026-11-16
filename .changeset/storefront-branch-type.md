---
'@asteby/storefront': minor
---

`ShopBranch.branch_type` (`channel` | `virtual_warehouse`, Storefront API 1.33): una sucursal que no es mostrador no se ofrece para recoger (`isPickupBranch` / `pickupBranches` lo consultan, además de `kind`). Ausente = sucursal normal; sin cambios para quien no lo reciba.
