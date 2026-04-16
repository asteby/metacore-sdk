# Pedidos (orders)

Addon metacore portable (backend WASM + frontend federado + migrations) para registrar y gestionar pedidos de venta.

## Estructura

```
orders/
├── manifest.json                  # key=orders, runtime=wasm
├── migrations/0001_init.sql       # tabla orders
├── backend/                       # TinyGo-WASI module
│   ├── go.mod, main.go (exports)
│   ├── abi.go, host.go
│   └── handlers.go (logica pura)
├── frontend/                      # federation remote (metacore_orders)
│   ├── vite.config.ts
│   └── src/{plugin.tsx, modals/{FulfillModal,CancelModal}.tsx}
└── build.sh
```

## Manifest

| Pieza | Detalle |
|---|---|
| model_definitions | orders (customer_id, status, total, items jsonb, tracking_number, carrier, etc.) |
| actions.orders[] | fulfill (modal orders.fulfill), cancel (modal orders.cancel) |
| tools[] | create_order, get_order |
| events | orders.order.fulfilled, orders.order.cancelled, orders.order.created |
| backend | runtime=wasm, exports=fulfill,cancel,create_order,get_order |

## Build

```bash
./build.sh   # requiere tinygo + pnpm + metacore CLI
```
