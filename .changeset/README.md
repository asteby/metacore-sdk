# Changesets

This directory records intent-to-release notes for the `@asteby/metacore-*` packages.

## Workflow

1. Make your change in a package under `packages/`.
2. Run `pnpm changeset` and follow the prompts: pick the packages affected and the semver bump (`patch`/`minor`/`major`).
3. Commit the generated `.md` file in this directory alongside your PR.
4. When the PR lands on `main`, the `Release` GitHub Action opens (or updates) a "Version Packages" PR that bumps versions, updates `CHANGELOG.md`, and writes a new lockfile. Merging that PR publishes to npm automatically.

## Rules of thumb

- UI/behavior change consumers can see → `minor` or `major` (breaking).
- Internal refactor with same public API → `patch`.
- CSS token rename in `@asteby/metacore-theme` → `major` (linked with `@asteby/metacore-ui`).
