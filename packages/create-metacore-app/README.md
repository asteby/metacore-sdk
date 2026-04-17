# create-metacore-app

Scaffolder CLI for metacore Vite+React apps.

```bash
npx create-metacore-app my-app
cd my-app
pnpm dev
```

The generated app depends on:

- `@asteby/metacore-starter-core` — providers, hooks, UI primitives.
- `@asteby/metacore-starter-config` — shared Vite, TS and Tailwind presets.

## Options

```bash
create-metacore-app [name] [options]

  -t, --template <name>   template to use (default: "default")
      --no-install        skip dependency install after copy
      --pm <manager>      package manager (pnpm|npm|yarn, default: pnpm)
```

## Templates

- `default` — Vite 8, React 19, TanStack Router, Tailwind 4, theme tokens.

Add new templates by dropping a folder under `templates/<name>/`. Files named
`_gitignore` / `_env.example` are renamed to `.gitignore` / `.env.example` on
copy, and `{{APP_NAME}}` is replaced inside `package.json`, `README.md`,
`index.html`, and `.env*` files.
