<p align="center">
  <img src="docs/assets/metacore.svg" width="120" alt="Metacore" />
</p>

<h1 align="center">Metacore SDK</h1>

<p align="center">
  <strong>The framework for building addons on the Metacore runtime.</strong><br />
  One declarative manifest. Sandboxed WASM backends. React contributions. Every Metacore host.
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/@asteby/metacore-sdk"><img src="https://img.shields.io/npm/v/@asteby/metacore-sdk?label=%40asteby%2Fmetacore-sdk&color=14b8a6" alt="npm version" /></a>
  <a href="./LICENSE"><img src="https://img.shields.io/badge/license-Apache--2.0-blue.svg" alt="License: Apache-2.0" /></a>
  <a href="https://github.com/asteby/metacore-sdk/actions/workflows/ci.yml"><img src="https://github.com/asteby/metacore-sdk/actions/workflows/ci.yml/badge.svg" alt="CI" /></a>
  <a href="https://github.com/changesets/changesets"><img src="https://img.shields.io/badge/maintained%20with-changesets-176de3.svg" alt="maintained with changesets" /></a>
  <a href="https://pkg.go.dev/github.com/asteby/metacore-sdk"><img src="https://pkg.go.dev/badge/github.com/asteby/metacore-sdk.svg" alt="Go Reference" /></a>
</p>

---

## Table of contents

- [What is Metacore](#what-is-metacore)
- [Quickstart](#quickstart)
- [Packages](#packages)
- [Architecture](#architecture)
- [Documentation](#documentation)
- [Repository layout](#repository-layout)
- [Contributing](#contributing)
- [Release process](#release-process)
- [Related repositories](#related-repositories)
- [License](#license)

## What is Metacore

**Metacore** is a declarative framework for extending business applications. You describe your addon with a single `manifest.json` — tables, UI contributions, webhooks, LLM tools, sandboxed permissions — and the kernel materializes it across every host that speaks Metacore.

The kernel runs sandboxed WASM backends, enforces capability scopes, manages tenant isolation, and exposes a typed bridge to React frontends. Hosts (Asteby Ops, Asteby Link, third-party apps) embed the kernel as a Go module and consume the SDK packages from npm. One bundle, every host.

**This repository** is the public, open-source SDK that makes building, distributing and consuming Metacore addons possible:

- The `metacore` Go CLI for scaffolding, validating, signing and packaging addons.
- A monorepo of 16 npm packages under the `@asteby/*` scope that hosts and addons share — from the federated runtime to the auth kit to the design tokens.
- Reference examples and the canonical `manifest.json` specification.

The kernel itself is private and hosted in [`asteby/metacore-kernel`](https://github.com/asteby/metacore-kernel).

## Quickstart

### Build an addon

Install the Go CLI and scaffold a new addon:

```bash
go install github.com/asteby/metacore-sdk/cli@latest
metacore init my-addon
cd my-addon
metacore validate
metacore build --strict
```

Full walkthrough — manifest, migrations, signing, marketplace upload — in [`docs/quickstart.md`](./docs/quickstart.md).

### Build a host app (Vite + React)

Scaffold a Vite + React host that consumes the SDK:

```bash
npx create-metacore-app my-app
cd my-app
pnpm dev
```

The scaffolder wires `@asteby/metacore-starter-config`, `@asteby/metacore-theme`, `@asteby/metacore-ui`, auth, i18n and the runtime in one step. See [`docs/CONSUMER_GUIDE.md`](./docs/CONSUMER_GUIDE.md) for the full integration guide.

## Packages

All published as `@asteby/metacore-*` on npm under Apache-2.0. Versions reflect the state at time of writing — see [npm](https://www.npmjs.com/org/asteby) or each package's `CHANGELOG.md` for current.

| Package | Description | Stability |
|---|---|---|
| [`@asteby/metacore-sdk`](./packages/sdk) | Frontend SDK — federated addon loader, slot registry, typed manifest, API client. | stable |
| [`@asteby/metacore-runtime-react`](./packages/runtime-react) | React runtime — renders addon contributions (DynamicTable, DynamicForm, ActionDispatcher, slots). | stable |
| [`@asteby/metacore-ui`](./packages/ui) | Headless + styled UI kit (data-table, layout shell, command menu, dialogs, shadcn primitives). | beta |
| [`@asteby/metacore-theme`](./packages/theme) | Design tokens, fonts, Tailwind v4 preset (oklch palette, dark mode). | beta |
| [`@asteby/metacore-auth`](./packages/auth) | Auth kit — Zustand store, API client factory, TanStack Router guard, brand-less pages. | stable |
| [`@asteby/metacore-i18n`](./packages/i18n) | i18next factory, base ES/EN bundles, language switcher, RTL provider. | stable |
| [`@asteby/metacore-lib`](./packages/lib) | Pure utilities — date, currency, number formatting, error handling. | beta |
| [`@asteby/metacore-tools`](./packages/tools) | TypeScript client for the kernel Tools runtime — execution, registry, validation. | alpha |
| [`@asteby/metacore-websocket`](./packages/websocket) | WebSocket provider — auto-reconnect, typed messages, channel subscriptions. | beta |
| [`@asteby/metacore-notifications`](./packages/notifications) | Notifications dropdown, app badge, real-time WebSocket updates. | stable |
| [`@asteby/metacore-webhooks`](./packages/webhooks) | Webhooks management UI — list, create, logs, test/replay, signing secrets. | stable |
| [`@asteby/metacore-pwa`](./packages/pwa) | PWA helpers — Vite plugin wrapper, install/update prompts, push, offline. | beta |
| [`@asteby/metacore-app-providers`](./packages/app-providers) | Generic providers — direction, font, layout, search palette. | beta |
| [`@asteby/metacore-starter-config`](./packages/starter-config) | Shared Vite, TypeScript, Tailwind 4 and ESLint presets. | beta |
| [`@asteby/metacore-starter-core`](./packages/starter-core) | Internal starter scaffolding (private — not published to npm). | internal |
| [`create-metacore-app`](./packages/create-metacore-app) | `npx` scaffolder for new Metacore Vite + React apps. | beta |

> Stability legend: `alpha` = pre-1.0, breaking changes likely; `beta` = pre-1.0 but stabilizing; `stable` = 1.0+ with semver discipline.

## Architecture

```
                   +-----------------------------+
                   |       Addon (your code)     |
                   |  manifest.json + migrations |
                   |  + frontend/ + WASM backend |
                   +--------------+--------------+
                                  |
                                  v
                   +-----------------------------+
                   |   metacore-sdk (this repo)  |
                   |  CLI · Go pkg · npm packages|
                   +--------------+--------------+
                                  |
                                  v
                   +-----------------------------+
                   |     metacore-kernel (Go)    |
                   |  WASM runtime · capability  |
                   |  enforcer · WebSocket hub   |
                   |  installer · lifecycle      |
                   +--------------+--------------+
                                  |
                       +----------+-----------+
                       |                      |
                       v                      v
                 +-----------+         +-----------+
                 |    Ops    |         |   Link    |
                 |  (CRUD)   |         |  (LLM)    |
                 +-----------+         +-----------+
                  Host apps embed the kernel as a
                  Go module; the React frontends
                  consume @asteby/metacore-* from npm.
```

- **Addon → SDK.** You write a manifest and (optionally) a TinyGo WASM backend. The CLI validates, signs and packages a `.tar.gz`.
- **SDK → Kernel.** The kernel parses the manifest, runs migrations under tenant isolation, loads the WASM bundle into wazero, and exposes the addon's contributions over WebSocket + REST.
- **Kernel → Host.** Ops and Link embed the kernel as a Go module. Their React frontends import from `@asteby/metacore-*` to render the contributions consistently.

## Documentation

| Doc | What it covers |
|---|---|
| [`docs/quickstart.md`](./docs/quickstart.md) | Your first addon in 10 minutes — scaffold, validate, sign, upload. |
| [`docs/manifest-spec.md`](./docs/manifest-spec.md) | Every field of `manifest.json` against `APIVersion = 2.0.0`. |
| [`docs/capabilities.md`](./docs/capabilities.md) | Declaring scoped permissions safely. |
| [`docs/wasm-abi.md`](./docs/wasm-abi.md) | Writing a sandboxed WASM backend (TinyGo ABI). |
| [`docs/CONSUMER_GUIDE.md`](./docs/CONSUMER_GUIDE.md) | Apps consuming the npm packages — install, Vite, Tailwind, deploy, Renovate. |
| [`docs/addon-publishing.md`](./docs/addon-publishing.md) | Signing, uploading and the marketplace review flow. |
| [`docs/PUBLISHING.md`](./docs/PUBLISHING.md) | Releasing the SDK packages — Changesets, Release PR, npm publish. |
| [`docs/internal-setup.md`](./docs/internal-setup.md) | Local setup for SDK contributors. |

## Repository layout

```
metacore-sdk/
├── cli/          # `metacore` Go CLI — init, validate, build, sign, compile-wasm
├── pkg/          # Go SDK helpers — manifest types, signing, host context
├── packages/     # pnpm workspace — 16 npm packages under @asteby/metacore-*
├── examples/     # reference addons (fiscal-mx, tickets, hello-wasm)
├── templates/    # scaffold templates embedded by the CLI
├── docs/         # public documentation served from this folder
└── .changeset/   # version + changelog state for the npm release pipeline
```

## Contributing

Issues, pull requests and design RFCs are welcome. Read [`CONTRIBUTING.md`](./CONTRIBUTING.md) and [`SECURITY.md`](./SECURITY.md) before opening a PR — security reports go to `security@asteby.com`.

**Any PR that touches `packages/*` must include a Changeset.** From the repo root:

```bash
pnpm changeset
```

Pick the affected packages, the bump level (`patch` / `minor` / `major`), and write a one-line summary aimed at consumers. Commit the generated `.changeset/*.md` alongside your code. Reviewers expect both — see the [Changesets docs](https://github.com/changesets/changesets) for the full model.

For local setup, see [`docs/internal-setup.md`](./docs/internal-setup.md).

## Release process

Releases are fully automated through [Changesets](https://github.com/changesets/changesets) + GitHub Actions:

1. **Author:** open a PR with your code change plus a `.changeset/*.md` entry generated by `pnpm changeset`.
2. **Merge to `main`:** the [`Release npm packages`](./.github/workflows/release-npm.yml) workflow runs.
3. **Version PR:** if there are unreleased changesets, the workflow opens (or updates) a `chore(release): version packages` PR. Its diff bumps `package.json` versions, regenerates `CHANGELOG.md`, and consumes the changesets.
4. **Publish:** merging the version PR runs `changeset publish`, building the affected packages and pushing them to npm under the `@asteby` scope.
5. **Propagate:** consumer apps (Ops, Link, internal panels) receive a Renovate PR within minutes — patch and minor bumps auto-merge, majors await human review.

The workflow uses `NPM_TOKEN` (a Granular Access Token with **Bypass 2FA** enabled, scoped to publish on `@asteby`). Linked packages — `@asteby/metacore-ui` and `@asteby/metacore-theme` — version together; `@asteby/metacore-starter-core` and `create-metacore-app` are excluded from the publish flow via `.changeset/config.json`.

Full details and troubleshooting in [`docs/PUBLISHING.md`](./docs/PUBLISHING.md).

## Related repositories

**Framework** (`asteby/`):

- [`metacore-sdk`](https://github.com/asteby/metacore-sdk) — this repo (public).
- [`metacore-kernel`](https://github.com/asteby/metacore-kernel) — runtime kernel (private).

**Products** (`asteby-hq/`):

- [`hub`](https://github.com/asteby-hq/hub) — marketplace UI + API server.
- [`ops`](https://github.com/asteby-hq/ops) — the CRUD/ERP host.
- [`link`](https://github.com/asteby-hq/link) — the conversational LLM host.

Public marketplace: [hub.asteby.com](https://hub.asteby.com).

## License

Apache License 2.0. Copyright 2026 Asteby, Inc. See [`LICENSE`](./LICENSE).
