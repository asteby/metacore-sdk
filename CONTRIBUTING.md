# Contributing to metacore-sdk

Thanks for your interest in improving the SDK. This repo is open source
under Apache-2.0 and we welcome issues, pull requests and design RFCs.

## Getting started

```bash
git clone https://github.com/asteby/metacore-sdk.git
cd metacore-sdk

# Go side (cli/, examples/)
go mod download
go test ./...

# npm side (packages/*, TypeScript types)
corepack enable
pnpm install
pnpm -r build
pnpm -r test
```

Go 1.25+ and Node 20+ are required (the repo `go.mod` pins `go 1.25.7`).
TinyGo 0.31+ is needed only to rebuild the WASM examples.

## Repository layout (monorepo)

- `cli/` — the `metacore` binary.
- `packages/` — pnpm workspace. Each subdir is an npm-publishable package
  under the `@asteby/metacore-*` scope (e.g. `@asteby/metacore-sdk`,
  `@asteby/metacore-runtime-react`, `@asteby/metacore-ui`).
- `examples/` — runnable reference addons. CI builds each to catch
  regressions in the CLI or manifest schema.
- `docs/` — public documentation served from the repo.

## Commit conventions

We use [Conventional Commits](https://www.conventionalcommits.org/):

```
feat(cli): add --target=binary flag
fix(manifest): reject empty kernel range under strict mode
docs(capabilities): clarify SSRF guard for IPv6 loopback
chore: bump tinygo to 0.33
```

Types: `feat`, `fix`, `docs`, `chore`, `refactor`, `test`, `perf`. The
release automation derives semver bumps from commit types.

## Running tests

- `go test ./...` — Go unit tests (CLI, signing, WASM scan).
- `pnpm -r test` — TS and React tests.
- The `metacore` CLI exercises scaffold → validate → build → sign → inspect
  end-to-end; run those subcommands against a fresh `metacore init` directory
  when touching the CLI.

Keep tests fast (<30 s locally). Any flaky test is treated as a bug.

## Proposing changes to the manifest or ABI

The manifest grammar and the WASM ABI live in the **kernel**
(`github.com/asteby/metacore-kernel/manifest`, `.../runtime/wasm`); this repo
consumes them and mirrors the manifest types into `@asteby/metacore-sdk` via
`tygo`. Changes to either are **contract changes** that affect every published
addon. Follow the RFC process:

1. Open a discussion at `github.com/asteby/metacore-sdk/discussions` with
   the `rfc` label.
2. Land the grammar/ABI change in the kernel first, bumping its `APIVersion`
   if the change is breaking.
3. Re-run `pnpm codegen` here to regenerate `packages/sdk/src/generated/manifest.ts`,
   then open a PR that bumps the kernel dependency in `go.mod` and commits the
   regenerated TS types *in the same commit*.
4. Document the migration path in `docs/manifest-spec.md`.

Non-contract changes (CLI UX, new examples, docs) go through normal PRs.

## Code of Conduct

This project follows the
[Contributor Covenant v2.1](https://www.contributor-covenant.org/version/2/1/code_of_conduct/).
By participating you agree to its terms.
