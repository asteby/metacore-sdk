# Consumer Guide — integrating `@asteby/metacore-*`

Guide for apps that consume the metacore SDK (ops, link, starter, doctores.lat, p2p, and any future app). It covers installation, wiring providers, using key pieces, and getting automatic updates via Renovate.

## 1. Install

All metacore packages are published under the `@asteby` npm scope. Install the ones you need — they're designed to be composable, not all-or-nothing.

```bash
pnpm add \
  @asteby/metacore-theme \
  @asteby/metacore-ui \
  @asteby/metacore-pwa \
  @asteby/metacore-auth \
  @asteby/metacore-runtime-react
```

Peer dependencies (React 18, React-DOM 18) should already be in your app. The packages declare them as peers so you don't get duplicated React instances.

What each package gives you:

| Package | Purpose |
| --- | --- |
| `@asteby/metacore-theme` | Design tokens, CSS variables, Tailwind preset. |
| `@asteby/metacore-ui` | Headless + styled components (DataTable, Form, Dialog, …). |
| `@asteby/metacore-pwa` | Vite PWA plugin wrapper + runtime service-worker helpers. |
| `@asteby/metacore-auth` | `AuthProvider`, `AuthGuard`, session hooks. |
| `@asteby/metacore-runtime-react` | Root provider stack + capability/manifest bindings. |

## 2. Mount providers in `main.tsx`

The runtime package exposes a single `<MetacoreProvider>` that composes theme, auth, query client, and router context. Wrap your app root once.

```tsx
// src/main.tsx
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { MetacoreProvider } from "@asteby/metacore-runtime-react";
import { AuthProvider } from "@asteby/metacore-auth";
import { ThemeProvider } from "@asteby/metacore-theme";
import "@asteby/metacore-theme/styles.css";
import "@asteby/metacore-ui/styles.css";

import App from "./App";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ThemeProvider defaultTheme="system">
      <AuthProvider
        config={{
          issuer: import.meta.env.VITE_AUTH_ISSUER,
          clientId: import.meta.env.VITE_AUTH_CLIENT_ID,
          redirectUri: `${window.location.origin}/auth/callback`,
        }}
      >
        <MetacoreProvider
          manifest={{ appId: "my-app", capabilities: ["read", "write"] }}
        >
          <BrowserRouter>
            <App />
          </BrowserRouter>
        </MetacoreProvider>
      </AuthProvider>
    </ThemeProvider>
  </StrictMode>,
);
```

Order matters: `ThemeProvider` outermost (so auth UI picks it up), `AuthProvider` next (so queries inside `MetacoreProvider` see the session), router innermost (so providers don't re-mount on navigation).

## 3. Using `DataTable`

```tsx
import { DataTable, type ColumnDef } from "@asteby/metacore-ui";

type User = { id: string; name: string; email: string };

const columns: ColumnDef<User>[] = [
  { accessorKey: "name", header: "Name" },
  { accessorKey: "email", header: "Email" },
];

export function UsersPage({ data }: { data: User[] }) {
  return (
    <DataTable
      columns={columns}
      data={data}
      pagination
      selection
      emptyState={<p>No users yet.</p>}
    />
  );
}
```

The table is controlled-agnostic — pass `state` + `onStateChange` for server-side pagination, or omit for client-side.

## 4. Protecting routes with `AuthGuard`

```tsx
import { AuthGuard } from "@asteby/metacore-auth";
import { Routes, Route } from "react-router-dom";

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route
        path="/*"
        element={
          <AuthGuard fallback={<Navigate to="/login" replace />}>
            <AuthenticatedShell />
          </AuthGuard>
        }
      />
    </Routes>
  );
}
```

`AuthGuard` reads from `AuthProvider`, handles the silent-renew flow, and renders `fallback` while unauthenticated. For role gating, use `<AuthGuard requires={["admin"]} />`.

## 5. Wiring the PWA plugin in `vite.config.ts`

```ts
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { metacorePwa } from "@asteby/metacore-pwa/vite";

export default defineConfig({
  plugins: [
    react(),
    metacorePwa({
      manifest: {
        name: "My Metacore App",
        short_name: "Metacore",
        theme_color: "#0ea5e9",
        icons: [
          { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
          { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
        ],
      },
      workbox: {
        navigateFallback: "/index.html",
      },
    }),
  ],
});
```

The wrapper preconfigures sensible Workbox defaults (runtime caching for the metacore API, offline shell, update-on-reload). Override any field by passing it explicitly.

## 6. Getting automatic updates via Renovate

Once metacore publishes a new version, your app should get it without anyone filing an issue. Drop [`docs/renovate-consumer-template.json`](./renovate-consumer-template.json) from the SDK repo at the root of your consumer repo as `renovate.json`:

```bash
curl -o renovate.json \
  https://raw.githubusercontent.com/asteby/metacore-sdk/main/docs/renovate-consumer-template.json
```

Then commit it. Make sure the [Renovate GitHub App](https://github.com/apps/renovate) is installed on your repo.

What this gives you:

- **Patch/minor bumps** of any `@asteby/metacore-*` package: Renovate opens a PR and auto-merges once CI is green (`automerge: true` + `platformAutomerge: true`). Typically lands within minutes of publish.
- **Major bumps**: Renovate opens a PR, assigns `@tech-lead` (change this for your app), and **does not** auto-merge. Review breaking changes, run your app, merge manually.
- **Schedule `at any time`**: metacore updates don't wait for Monday — they flow continuously.

You can of course extend the template with app-specific rules. Keep the `@asteby/metacore-*` rules intact so propagation stays predictable across all consumer apps.

## 7. Upgrading metacore manually

If you need a specific version before Renovate picks it up:

```bash
pnpm up "@asteby/metacore-*@latest"
```

Or for a pre-release channel:

```bash
pnpm up "@asteby/metacore-*@next"
```

See the SDK's [`PUBLISHING.md`](./PUBLISHING.md) for channel semantics.
