# Quickstart — your first addon in 10 minutes

This guide walks you through scaffolding, building and publishing a minimal Metacore addon. By the end you will have a signed `.tar.gz` bundle deployed to [hub.asteby.com](https://hub.asteby.com).

> Audience: developers extending Asteby Ops, Link, or any host built on the Metacore kernel.

## Table of contents

- [Prerequisites](#prerequisites)
- [1. Install the CLI](#1-install-the-cli)
- [2. Scaffold a new addon](#2-scaffold-a-new-addon)
- [3. Add a tool](#3-add-a-tool)
- [4. Validate](#4-validate)
- [5. Generate a signing keypair](#5-generate-a-signing-keypair)
- [6. Build and sign](#6-build-and-sign)
- [7. Upload to the marketplace](#7-upload-to-the-marketplace)
- [Next steps](#next-steps)

## Prerequisites

- Go 1.22+ on your `PATH` (`go version`)
- Node.js 20+ (only if your addon ships a frontend bundle)
- [TinyGo](https://tinygo.org/getting-started/install/) 0.31+ (only if your addon targets the WASM backend runtime)
- A developer account on [hub.asteby.com](https://hub.asteby.com)

## 1. Install the CLI

```bash
go install github.com/asteby/metacore-sdk/cli@latest
metacore help
```

You should see the subcommands `init`, `validate`, `build`, `inspect`, `keygen`, `sign`, and `compile-wasm`.

## 2. Scaffold a new addon

```bash
metacore init my-addon
cd my-addon
```

`init` generates this layout:

```
my-addon/
├── manifest.json              # declarative contract — see manifest-spec.md
├── migrations/
│   └── 0001_init.sql          # initial DDL, scoped to addon_my_addon schema
├── frontend/
│   └── src/
│       └── plugin.tsx         # federated UI entry (optional)
└── README.md
```

Open `manifest.json`. The scaffold declares one table (`<key>_items`), one capability (`db:read users`) and a federation frontend entry. Every field is documented in [`manifest-spec.md`](./manifest-spec.md).

## 3. Add a tool

LLM-facing tools let conversational hosts (Asteby Link) invoke addon logic from a user message. Add a `tools` array next to `actions`:

```json
"tools": [{
  "id": "ping",
  "name": "Ping",
  "description": "Replies with 'pong'. Use it to verify connectivity.",
  "category": "query",
  "endpoint": "/webhooks/ping",
  "method": "POST",
  "input_schema": [
    { "name": "message", "type": "string", "required": false,
      "description": "Optional message to echo back" }
  ]
}]
```

See [shared-addon-pattern](#related) for the action-vs-tool distinction.

## 4. Validate

```bash
metacore validate
# ok: my-addon@0.1.0 passes validation against kernel 2.0.0
```

Validation checks key regex, semver, column types, default-literal whitelist, capability scopes, and the kernel-range constraint.

## 5. Generate a signing keypair

```bash
metacore keygen --out dev
# wrote dev.pem (private, 0600) and dev.pub (public)
```

`dev.pem` is Ed25519. Keep it out of git. Register `dev.pub` on `hub.asteby.com/developers` so the marketplace can verify your uploads.

## 6. Build and sign

```bash
metacore build --strict --sign dev.pem
# built my-addon-0.1.0.tar.gz (1 migration, 0 frontend files, 0 backend files, target=webhook)
# wrote my-addon-0.1.0.tar.gz.sig
```

`--strict` fails on any gate warning (unscoped capabilities, missing readme, untagged frontend dist). Always use it for production builds.

Inspect the bundle:

```bash
metacore inspect my-addon-0.1.0.tar.gz
```

## 7. Upload to the marketplace

```bash
curl -X POST https://hub.asteby.com/v1/addons \
  -H "X-Developer-Key: $METACORE_DEV_KEY" \
  -F bundle=@my-addon-0.1.0.tar.gz \
  -F signature=@my-addon-0.1.0.tar.gz.sig
```

The marketplace verifies the Ed25519 signature against your registered public key, re-runs validation, and queues the bundle for review:

```
pending  →  approved  →  published
     \→  changes_requested (see email)
```

Once published, the addon appears under `hub.asteby.com/addons/my-addon` and any organization can install it.

## Next steps

<a name="related"></a>

- [`manifest-spec.md`](./manifest-spec.md) — every field of `manifest.json`.
- [`wasm-abi.md`](./wasm-abi.md) — writing a TinyGo WASM backend.
- [`capabilities.md`](./capabilities.md) — declaring sandboxed permissions.
- [`addon-publishing.md`](./addon-publishing.md) — signing, versioning, and the review flow.
- [`CONSUMER_GUIDE.md`](./CONSUMER_GUIDE.md) — building a host app that consumes the SDK packages.
