# metacore-sdk

> The official SDK for building addons on top of the **metacore** framework —
> the platform powering [Asteby Ops](https://asteby.com/ops), Asteby Link and
> the [hub.asteby.com](https://hub.asteby.com) marketplace.

[![License: Apache-2.0](https://img.shields.io/badge/license-Apache--2.0-blue.svg)](./LICENSE)
[![Kernel API](https://img.shields.io/badge/kernel-2.0.0-green.svg)](./docs/manifest-spec.md)
[![Go Reference](https://pkg.go.dev/badge/github.com/asteby/metacore-sdk.svg)](https://pkg.go.dev/github.com/asteby/metacore-sdk)

## What is metacore?

metacore is a declarative framework for extending business applications. You
describe your addon with a single `manifest.json` — tables, UI, webhooks, LLM
tools, sandboxed permissions — and the kernel materializes it across every
host that speaks metacore:

- **Asteby Ops** — ERP-style UI-driven host
- **Asteby Link** — conversational / LLM-driven host
- Any third-party host built on the metacore kernel

One manifest, one bundle, every host.

## Quickstart

```bash
go install github.com/asteby/metacore-sdk/cli@latest
metacore init mi-addon
cd mi-addon && metacore build --strict
```

Full walkthrough: [`docs/quickstart.md`](./docs/quickstart.md).

## Repository layout

```
metacore-sdk/
├── cli/          # `metacore` CLI — init, validate, build, sign, compile-wasm
├── pkg/          # Go SDK helpers (manifest types, signing, host-context)
├── packages/     # npm packages (TypeScript types, React bindings)
├── examples/     # reference addons (fiscal-mx, tickets, hello-wasm)
└── docs/         # public documentation (this folder)
```

## Documentation

| Doc | What it covers |
|---|---|
| [quickstart.md](./docs/quickstart.md) | Your first addon in 10 minutes. |
| [manifest-spec.md](./docs/manifest-spec.md) | Every field of `manifest.json`. |
| [wasm-abi.md](./docs/wasm-abi.md) | Writing a sandboxed WASM backend. |
| [capabilities.md](./docs/capabilities.md) | Declaring scoped permissions safely. |
| [publishing.md](./docs/publishing.md) | Signing, uploading and the review flow. |

## Related repositories

- [`asteby/hub-web`](https://github.com/asteby/hub-web) — the marketplace UI.
- [`asteby/ops`](https://github.com/asteby/ops) — the Ops host.
- [hub.asteby.com](https://hub.asteby.com) — the public addon marketplace.

## Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md). Security reports go to
`security@asteby.com` — see [SECURITY.md](./SECURITY.md).

## License

Apache License 2.0. Copyright 2026 Asteby, Inc. See [LICENSE](./LICENSE).
