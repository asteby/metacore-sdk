# {{ADDON_NAME}}

{{ADDON_DESCRIPTION}}

Addon with an **embedded federated page** (level D): `./pages/board` renders
inside the host chrome at `/a/{{ADDON_KEY}}/board`, next to a declarative split
view of `Item` (level A, zero JavaScript).

## Why a page (and not a declarative view)

> Fill this in before publishing. The hub warns about addons that ship a page
> without any declarative view, and reviewers ask for this justification:
> which interaction can a `view_type` (map, timeline, calendar, chart, split)
> or a detail panel NOT express?

Default to `view_type` / `detail.panels`; add views with
`npx create-metacore-addon add view --type <map|timeline|calendar|chart|split> --model Item`.

## Layout

```
manifest.json            frontend.pages[] (board, layout shell, budget_kb 60) + contributions.api (summary)
frontend/src/register.tsx    headless expose (actions, slots) — no routes
frontend/src/pages/board.tsx the page: definePage + host hooks
frontend/src/pages/board.test.tsx  vitest + renderWithHost
frontend/src/dev.tsx     dev harness (simulated host, mock API)
backend/main.go          WASM export `summary` for GET /{{ADDON_KEY}}/summary (auth staff)
migrations/0001_init.sql
```

## Develop

```bash
cd frontend
pnpm install
pnpm dev          # page in a simulated host
pnpm test         # page tests (renderWithHost)
pnpm build        # remote + dist/metacore-pages.json (fails over budget_kb)
cd ../backend && ./build.sh   # requires tinygo
cd .. && metacore build .     # checks page budgets, stamps frontend.sdk + integrity
```

## Rules the template follows

- The page never reads a token: every call goes through `useHostApi()`
  (`/gw/...` reaches this addon's `contributions.api` routes).
- React, router, query, i18n and the UI kit are host singletons; maps and
  charts may only come as lazy host shares (`pages[].shares`).
- Business numbers come from the backend (`summary`), never computed in the page.
