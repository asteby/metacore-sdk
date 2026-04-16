# Quickstart — Your first addon in 10 minutes

This guide walks you through scaffolding, building and publishing a minimal
metacore addon. By the end you will have a signed `.tar.gz` bundle running on
[hub.asteby.com](https://hub.asteby.com).

> Target audience: developers who want to extend Asteby Ops, Link, or any
> host built on the metacore kernel.

## Prerequisites

- Go 1.22+ on your `PATH` (`go version`)
- Node.js 20+ (only if you ship a frontend bundle)
- [TinyGo](https://tinygo.org/getting-started/install/) 0.31+ (only if you
  target the WASM backend runtime)
- A developer account on `hub.asteby.com`

## 1. Install the CLI

```bash
go install github.com/asteby/metacore-sdk/cli@latest
metacore help
```

You should see the subcommands `init`, `validate`, `build`, `inspect`,
`keygen`, `sign`, `compile-wasm`.

## 2. Scaffold a new addon

```bash
metacore init mi-addon
cd mi-addon
```

`init` generates this tree:

```
mi-addon/
├── manifest.json              # declarative contract — see manifest-spec.md
├── migrations/
│   └── 0001_init.sql          # initial DDL, scoped to addon_mi_addon schema
├── frontend/
│   └── src/
│       └── plugin.tsx         # federated UI entry (optional)
└── README.md
```

Open `manifest.json`. The scaffold declares one table (`<key>_items`), one
capability (`db:read users`) and a federation frontend entry. Every field is
documented in [manifest-spec.md](./manifest-spec.md).

## 3. Add a tool

LLM-facing tools let conversational hosts (Asteby Link) invoke addon logic
from a user message. Add a `tools` array next to `actions`:

```json
"tools": [{
  "id": "ping",
  "name": "Ping",
  "description": "Responde 'pong'. Úsalo para verificar conectividad.",
  "category": "query",
  "endpoint": "/webhooks/ping",
  "method": "POST",
  "input_schema": [
    { "name": "message", "type": "string", "required": false,
      "description": "Mensaje opcional a reflejar" }
  ]
}]
```

See [shared-addon-pattern](#related) for the action-vs-tool distinction.

## 4. Validate

```bash
metacore validate
# ok: mi-addon@0.1.0 passes validation against kernel 2.0.0
```

Validation checks key regex, semver, column types, default-literal whitelist,
capability scopes and the kernel-range constraint.

## 5. Generate a signing keypair

```bash
metacore keygen --out dev
# wrote dev.pem (private, 0600) and dev.pub (public)
```

`dev.pem` is Ed25519. Keep it out of git. Register `dev.pub` on
`hub.asteby.com/developers` so the marketplace can verify your uploads.

## 6. Build & sign

```bash
metacore build --strict --sign dev.pem
# built mi-addon-0.1.0.tar.gz (1 migrations, 0 frontend files, 0 backend files, target=webhook)
# wrote mi-addon-0.1.0.tar.gz.sig
```

`--strict` fails on any gate warning (unscoped capabilities, missing readme,
untagged frontend dist). Always use it for production builds.

Inspect the bundle:

```bash
metacore inspect mi-addon-0.1.0.tar.gz
```

## 7. Upload to the marketplace

```bash
curl -X POST https://hub.asteby.com/v1/addons \
  -H "X-Developer-Key: $METACORE_DEV_KEY" \
  -F bundle=@mi-addon-0.1.0.tar.gz \
  -F signature=@mi-addon-0.1.0.tar.gz.sig
```

The marketplace verifies the Ed25519 signature against your registered public
key, re-runs validation, and queues the bundle for review. Status flow:

```
pending  →  approved  →  published
     \→  changes_requested (see email)
```

Once published, the addon appears under `hub.asteby.com/addons/mi-addon` and
any organization can install it.

## <a name="related"></a>Related docs

- [manifest-spec](./manifest-spec.md) — every field of `manifest.json`
- [wasm-abi](./wasm-abi.md) — writing a WASM backend
- [capabilities](./capabilities.md) — declaring sandboxed permissions
- [publishing](./publishing.md) — signing, versioning and the review flow
- [shared-addon-pattern](https://github.com/asteby/metacore-sdk/blob/main/docs/shared-addon-pattern.md) — serving ops and link from one manifest
