# Contributing to metacore-sdk

Thanks for your interest in improving the SDK. This repo is open source
under Apache-2.0 and we welcome issues, pull requests and design RFCs.

## Getting started

```bash
git clone https://github.com/asteby/metacore-sdk.git
cd metacore-sdk

# Go side (cli, pkg/, examples/)
go mod download
go test ./...

# npm side (packages/*, TypeScript types)
corepack enable
pnpm install
pnpm -r build
pnpm -r test
```

Go 1.22+ and Node 20+ are required. TinyGo 0.31+ is needed only to rebuild
the WASM examples.

## Repository layout (monorepo)

- `cli/` — the `metacore` binary.
- `pkg/` — Go packages published as `github.com/asteby/metacore-sdk/...`.
- `packages/` — pnpm workspace. Each subdir is an npm-publishable package
  (`@asteby/metacore-types`, `@asteby/metacore-react`).
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

- `go test ./...` — Go unit tests.
- `pnpm -r test` — TS and React tests.
- `./scripts/e2e.sh` — end-to-end: scaffold, validate, build, sign, inspect.

Keep tests fast (<30 s locally). Any flaky test is treated as a bug.

## Proposing changes to the manifest or ABI

Changes to `pkg/manifest/*` or `kernel/runtime/wasm/abi.go` are **contract
changes**. They affect every published addon. Follow the RFC process:

1. Open a discussion at `github.com/asteby/metacore-sdk/discussions` with
   the `rfc` label.
2. Draft a short design note (template: `docs/rfc/TEMPLATE.md`).
3. After rough consensus, open a PR against the `pkg/manifest` types and
   the mirrored TS definitions *in the same commit*.
4. Bump `APIVersion` in the same PR if the change is breaking.
5. Document the migration path in `docs/manifest-spec.md` and update
   `docs/upgrading.md`.

Non-contract changes (CLI UX, new examples, docs) go through normal PRs.

## Code of Conduct

This project follows the
[Contributor Covenant v2.1](https://www.contributor-covenant.org/version/2/1/code_of_conduct/).
By participating you agree to its terms.
