# Catálogo (catalog)

Addon metacore portable (backend WASM + frontend federado + migrations) para catálogo de productos.

| Pieza | Detalle |
|---|---|
| model_definitions | products (sku, name, price, stock, published, category, brand, images jsonb, attributes jsonb) |
| actions.products[] | update_stock (modal catalog.update_stock), toggle_published (modal catalog.toggle_published) |
| tools[] | search_products, get_product |
| events | catalog.product.stock_updated, catalog.product.published, catalog.product.unpublished |
| backend | runtime=wasm, exports=update_stock,toggle_published,search_products,get_product |
