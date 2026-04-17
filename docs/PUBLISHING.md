# Publishing `@asteby/metacore-*` packages

End-to-end guide for releasing packages from this monorepo and propagating updates to consumer apps.

## TL;DR

1. Change code in `packages/*`.
2. Run `pnpm changeset` and pick the bump (patch/minor/major) per affected package.
3. Commit the generated `.changeset/*.md` file alongside your code in a PR.
4. When your PR merges to `main`, the **Release npm packages** workflow opens (or updates) a `chore(release): version packages` PR.
5. Merging that "Version Packages" PR bumps versions, updates changelogs, and triggers `pnpm release` which publishes to npm under the `@asteby` scope.
6. Renovate bots in consumer apps (ops, link, starter, doctores.lat, p2p, …) pick up the new versions and open PRs. Patch/minor bumps auto-merge; major bumps wait for human review.

## Prerequisites

- **npm token** (`NPM_TOKEN` repo secret in `asteby/metacore-sdk`) with `publish` permission on the `@asteby` scope. Generate at <https://www.npmjs.com/settings/asteby/tokens> as an **Automation** token (bypasses 2FA for CI).
- **Repo permissions**: the `release` job declares `contents: write`, `pull-requests: write`, and `id-token: write`. Make sure "Allow GitHub Actions to create and approve pull requests" is enabled in repo settings → Actions → General.
- **pnpm 10+** locally (matches CI). The root `packageManager` field is authoritative.

## The release workflow

File: `.github/workflows/release-npm.yml`.

It runs on every push to `main`:

- If the push **contains** `.changeset/*.md` files not yet versioned, `changesets/action@v1` opens/updates a single PR titled `chore(release): version packages` whose diff bumps `package.json` versions and moves the changesets into `CHANGELOG.md`.
- If the push **is** that PR being merged (so no changesets are left), the action runs `pnpm release`, which executes `turbo run build --filter=./packages/*` followed by `changeset publish`, pushing any packages whose versions bumped to npm.

The action reads `.changeset/config.json` for scope, access (`public`), linked packages (UI and theme are version-locked), and baseBranch.

## Authoring a changeset

```bash
pnpm changeset
```

Pick:

- Which packages changed (space to toggle, enter to confirm).
- Bump level:
  - **patch**: bug fix, docs, internal refactor with no API change.
  - **minor**: new backwards-compatible feature.
  - **major**: breaking change. Triggers consumer-side human review via Renovate.
- Summary — goes straight into the CHANGELOG, write it for humans.

Commit the generated `.changeset/*.md` in the same PR as your code. Reviewers can eyeball both the change and the bump.

## Pre-releases (next / beta / rc)

Use the `pre` mode when you want to ship from `main` without going stable:

```bash
pnpm changeset pre enter next
pnpm changeset        # author changeset as usual
# ...merge PRs to main, each publishes as e.g. 0.3.0-next.0, 0.3.0-next.1
pnpm changeset pre exit
```

While in pre mode the release workflow publishes with the `next` dist-tag, so `pnpm add @asteby/metacore-ui@next` opts in. Exit pre mode before the stable release PR.

For an isolated channel (e.g., `beta`), use `pnpm changeset pre enter beta`.

## Troubleshooting

- **"Version Packages" PR never opens.** No unversioned `.changeset/*.md` files on `main`. Run `pnpm changeset` and push.
- **Publish step fails with 401/403.** `NPM_TOKEN` missing, expired, or lacks publish rights on `@asteby`. Regenerate as an Automation token and update the repo secret.
- **Publish succeeds for some packages but skips others.** Check the package's `"private": true` flag and that `.changeset/config.json` `ignore` array doesn't list it.
- **Linked packages drifted.** `@asteby/metacore-ui` and `@asteby/metacore-theme` must bump together; the `linked` array in `.changeset/config.json` enforces this — don't remove it without understanding the downstream effect on consumers.
- **pnpm install fails in CI with ERR_PNPM_LOCKFILE_BROKEN.** The lockfile is regenerated via `--frozen-lockfile=false`; if it persists, delete `pnpm-lock.yaml` locally, reinstall, commit.
- **Consumer app didn't get a Renovate PR.** Confirm the consumer's `renovate.json` extends from `docs/renovate-consumer-template.json` semantics and that Renovate is installed on the consumer repo (`github.com/apps/renovate`).
- **Version Packages PR has merge conflicts with `pnpm-lock.yaml`.** Close it; the next push to `main` regenerates a clean one.

## References

- Changesets docs: <https://github.com/changesets/changesets>
- changesets/action: <https://github.com/changesets/action>
- Consumer Renovate template: [`renovate-consumer-template.json`](./renovate-consumer-template.json)
- Consumer integration guide: [`CONSUMER_GUIDE.md`](./CONSUMER_GUIDE.md)
