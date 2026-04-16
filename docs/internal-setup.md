# Internal Setup (DO NOT PUBLISH)

This document is for internal Asteby developers only. It explains how to
configure your local environment to access private Metacore repositories.

## GOPRIVATE setup

For private repos (kernel, hub-server):

```bash
export GOPRIVATE=github.com/asteby/metacore-kernel,github.com/asteby/hub-server

cat >> ~/.netrc <<EOF
machine github.com
  login <your_github_user>
  password <PAT_with_repo_read>
EOF
chmod 600 ~/.netrc
```

The PAT must have `repo` (read) scope for the private repositories.

## CI secrets

The following secrets must be configured at the GitHub organization level
(or per-repo) to allow CI to clone private modules:

- `METACORE_READ_TOKEN` — PAT with read access to private repos
- `NPM_TOKEN` — npm publish token for `@asteby` scope
- `GHCR_TOKEN` — token with `write:packages` scope for ghcr.io
