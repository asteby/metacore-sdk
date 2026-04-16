# DHL Tracking

Rastrea envíos de DHL Express en tiempo real.

## Tools
- `track_shipment` — GET `https://api-eu.dhl.com/track/shipments`

## Settings
- `dhl_api_key` (secret)
- `dhl_region` — `eu` | `us`

## Capabilities
- `http:fetch api-eu.dhl.com`
- `http:fetch api-us.dhl.com`

## Install
```bash
/tmp/metacore_cli validate .
/tmp/metacore_cli build .
```

Runtime: `webhook` · Kernel: `>=2.0.0 <3.0.0` · Tenant isolation: `shared`
