---
'@asteby/storefront': minor
---

Tienda consciente de la entidad vendedora (RFC 0001 §3.7, aditivo y tolerante). `ShopBranch.entity` (`{ code, name }`, sin datos fiscales) y el tipo de lugar `channel`; ayudantes `branchEntity`, `entitiesOf`, `isMultiEntity`, `isPickupBranch` / `pickupBranches` (una sucursal de canal o un almacén no se ofrece como recolección), `entityOfBranchId`, `splitByEntity` y `splitNotice` (un carrito con artículos de varias entidades se separa en pedidos, con la explicación para el comprador). Sin entidades publicadas, nada cambia.
