import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react-swc";
import tailwindcss from "@tailwindcss/vite";
import {
  assertMetacorePageShares,
  assertPagesExposed,
  metacorePageShareConfig,
  readMetacoreManifest
} from "./federation-pages.js";
export * from "./federation-pages.js";
const METACORE_REMOTE_ENTRY_MAX_BYTES = 512 * 1024;
const METACORE_FRONTEND_MAX_BYTES = 4 * 1024 * 1024;
const metacoreOptimizeDepsInclude = [
  "@asteby/metacore-app-providers",
  "@asteby/metacore-auth",
  "@asteby/metacore-notifications",
  "@asteby/metacore-pwa",
  "@asteby/metacore-runtime-react",
  "@asteby/metacore-sdk",
  "@asteby/metacore-starter-core",
  "@asteby/metacore-theme",
  "@asteby/metacore-tools",
  "@asteby/metacore-ui",
  "@asteby/metacore-ui/primitives",
  "@asteby/metacore-ui/lib",
  "@asteby/metacore-ui/data-table",
  "@asteby/metacore-ui/dialogs",
  "@asteby/metacore-ui/layout",
  "@asteby/metacore-ui/hooks",
  "@asteby/metacore-ui/icons",
  "@asteby/metacore-ui/command-menu",
  "@asteby/metacore-websocket"
];
const metacoreOptimizeDeps = {
  include: [...metacoreOptimizeDepsInclude]
};
const METACORE_FEDERATION_SINGLETONS = [
  "react",
  "react-dom",
  "react/jsx-runtime",
  "react-i18next",
  "i18next",
  // @tanstack/react-query MUST be a singleton: it carries a React context
  // (the QueryClient). The host renders `<QueryClientProvider>` and the shared
  // `@asteby/metacore-app-providers` calls `useQueryClient`/`useQuery` inside
  // it (org-config, platform-config providers). Without sharing react-query,
  // the host provider and the app-providers consumer can resolve DIFFERENT
  // copies of react-query — different context — and the app crashes with
  // "No QueryClient set, use QueryClientProvider to set one" thrown from the
  // app-providers loadShare chunk. Intermittent because it depends on which
  // container wins the app-providers share negotiation / chunk load order.
  "@tanstack/react-query",
  "@asteby/metacore-ui",
  "@asteby/metacore-runtime-react",
  "@asteby/metacore-sdk",
  "@asteby/metacore-app-providers",
  "@asteby/metacore-theme",
  "@asteby/metacore-auth",
  // The host router is a singleton: a remote page navigates through the host's
  // TanStack router (useAddonNavigate), never a second copy. Remotes get it
  // with `import: false` (the host always provides it), so an addon that does
  // not install the router still builds.
  "@tanstack/react-router"
];
const METACORE_REMOTE_HOST_ONLY_SINGLETONS = ["@tanstack/react-router"];
function metacoreFederationShared(opts) {
  const {
    host,
    apps,
    filename = "remoteEntry.js",
    exposes,
    extras = [],
    extra = {},
    overrides = {},
    manifest,
    pageShares = [],
    root = process.cwd(),
    hostProvided = [],
    only
  } = opts;
  if (only) assertKnownOnly(only);
  const keep = (name) => !only || only.includes(name);
  const role = opts.role ?? (exposes ? "remote" : "host");
  const shared = {};
  for (const name of METACORE_FEDERATION_SINGLETONS) {
    if (keep(name)) shared[name] = { singleton: true };
  }
  if (role === "remote") {
    for (const name of METACORE_REMOTE_HOST_ONLY_SINGLETONS) {
      if (keep(name)) shared[name] = { singleton: true, import: false };
    }
  }
  const lazy = new Set(pageShares);
  if (manifest) {
    const pages = assertPagesExposed(readMetacoreManifest(manifest, root), exposes);
    for (const p of pages) for (const sh of p.shares) lazy.add(sh);
  }
  assertMetacorePageShares([...lazy], "pageShares");
  Object.assign(shared, metacorePageShareConfig(role, [...lazy]));
  for (const name of extras) {
    shared[name] ??= { singleton: true };
  }
  for (const [name, cfg] of Object.entries(extra)) {
    shared[name] = { singleton: true, ...cfg };
  }
  for (const name of hostProvided) {
    shared[name] = { ...shared[name] ?? {}, singleton: true, import: false };
  }
  for (const [name, override] of Object.entries(overrides)) {
    const merged = { ...shared[name] ?? {}, ...override };
    for (const k of Object.keys(merged)) if (merged[k] === void 0) delete merged[k];
    shared[name] = merged;
  }
  assertMetacoreFederationShared(shared, { partial: !!only });
  return {
    name: host,
    filename,
    // Host: remotes vacío por default (se registran dinámicamente en runtime).
    // Si el caller pasa `apps`, se incluyen estáticamente.
    ...apps ? { remotes: { ...apps } } : {},
    ...exposes ? { exposes: { ...exposes } } : {},
    shared
  };
}
function assertKnownOnly(only) {
  const known = METACORE_FEDERATION_SINGLETONS;
  const unknown = only.filter((n) => !known.includes(n));
  if (unknown.length) {
    throw new Error(
      `metacore federation shared: unknown \`only\` entr${unknown.length > 1 ? "ies" : "y"} ${unknown.map((n) => `"${n}"`).join(", ")}. \`only\` accepts canonical singletons (${known.join(", ")}); add other packages with \`extras\`/\`extra\`.`
    );
  }
}
function assertMetacoreFederationShared(shared, opts = {}) {
  for (const name of METACORE_FEDERATION_SINGLETONS) {
    if (opts.partial && shared[name] === void 0) continue;
    if (!shared[name]?.singleton) {
      throw new Error(
        `metacore federation shared: "${name}" must be { singleton: true }. Use metacoreFederationShared() from @asteby/metacore-starter-config/vite and do not override singleton to false.`
      );
    }
  }
}
function assertFederationDistBudgets(outDir, opts = {}) {
  const filename = opts.filename ?? "remoteEntry.js";
  const maxRemote = opts.maxRemoteEntryBytes ?? METACORE_REMOTE_ENTRY_MAX_BYTES;
  const maxTotal = opts.maxFrontendBytes ?? METACORE_FRONTEND_MAX_BYTES;
  let total = 0;
  let remoteEntry = 0;
  const walk = (dir) => {
    let entries;
    try {
      entries = readdirSync(dir);
    } catch {
      return;
    }
    for (const name of entries) {
      const full = path.join(dir, name);
      let st;
      try {
        st = statSync(full);
      } catch {
        continue;
      }
      if (st.isDirectory()) {
        walk(full);
        continue;
      }
      if (!st.isFile()) continue;
      total += st.size;
      if (name === filename || full.endsWith(`/${filename}`) || full.endsWith(`\\${filename}`)) {
        remoteEntry += st.size;
      }
    }
  };
  walk(outDir);
  if (total > maxTotal) {
    throw new Error(
      `frontend budget exceeded: ${outDir} is ${total} bytes (max ${maxTotal}). Split exposes or trim the remote \u2014 oversized federation taxes every host shell open.`
    );
  }
  if (remoteEntry > maxRemote) {
    throw new Error(
      `frontend budget exceeded: ${filename} is ${remoteEntry} bytes (max ${maxRemote}). Keep the container thin and lazy-load feature chunks.`
    );
  }
  return { total, remoteEntry };
}
function metacoreFederationBudgetPlugin(opts = {}) {
  let outDir = path.resolve(process.cwd(), opts.outDir ?? "dist");
  return {
    name: "metacore-federation-budget",
    apply: "build",
    configResolved(config) {
      outDir = opts.outDir ? path.resolve(config.root, opts.outDir) : path.resolve(config.root, config.build.outDir);
    },
    closeBundle() {
      assertFederationDistBudgets(outDir, opts);
    }
  };
}
const metacoreFederationAliases = {
  "virtual:pwa-register/react": fileURLToPath(
    new URL("./pwa-register-stub.js", import.meta.url)
  )
};
function detectHandRolledFederationShared(source) {
  if (/\bmetacoreFederationShared\s*\(/.test(source)) return null;
  const usesFederation = /@module-federation\/vite/.test(source) || /\bfederation\s*\(/.test(source);
  const handSingletons = /singleton\s*:\s*true/.test(source);
  if (usesFederation || handSingletons) {
    return "hand-written federation `shared` map detected. Replace it with `federation(metacoreFederationShared({ host, exposes, manifest }))` from '@asteby/metacore-starter-config/vite' (use `hostProvided`, `overrides` or `extra` for per-package tweaks) \u2014 see docs/federation.md.";
  }
  return null;
}
function assertNoHandRolledFederationShared(source, file = "vite.config.ts") {
  const problem = detectHandRolledFederationShared(source);
  if (problem) throw new Error(`metacore federation (${file}): ${problem}`);
}
function metacoreFederationPlugin(opts = {}) {
  const mode = opts.handRolledShared ?? "error";
  return {
    name: "metacore-federation",
    config() {
      return { resolve: { alias: { ...metacoreFederationAliases } } };
    },
    configResolved(config) {
      if (mode === "off" || !config.configFile) return;
      let source;
      try {
        source = readFileSync(config.configFile, "utf8");
      } catch {
        return;
      }
      const problem = detectHandRolledFederationShared(source);
      if (!problem) return;
      const msg = `metacore federation (${path.basename(config.configFile)}): ${problem}`;
      if (mode === "error") throw new Error(msg);
      config.logger.warn(msg);
    }
  };
}
async function defineMetacoreConfig(options = {}) {
  const {
    router = true,
    routerIgnorePattern = ".((css|styl|less|sass|scss)|d.ts)$|components/.*",
    pwa = false,
    extraPlugins = [],
    extend = {}
  } = options;
  const plugins = [];
  if (router) {
    const { tanstackRouter } = await import("@tanstack/router-plugin/vite");
    plugins.push(
      tanstackRouter({
        target: "react",
        autoCodeSplitting: true,
        routeFileIgnorePattern: routerIgnorePattern
      })
    );
  }
  plugins.push(react(), tailwindcss());
  if (pwa) {
    const { VitePWA } = await import("vite-plugin-pwa");
    plugins.push(
      VitePWA({
        strategies: pwa.strategies ?? "injectManifest",
        srcDir: pwa.srcDir ?? "src",
        filename: pwa.filename ?? "sw.js",
        registerType: "prompt",
        includeAssets: ["images/**/*"],
        manifest: {
          name: pwa.name,
          short_name: pwa.shortName ?? pwa.name,
          description: pwa.description,
          theme_color: pwa.themeColor ?? "#84cc16",
          background_color: pwa.backgroundColor ?? "#1a2e05",
          start_url: pwa.startUrl ?? "/",
          display: "standalone",
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          ...pwa.icons ? { icons: pwa.icons } : {},
          ...pwa.manifestExtra ?? {}
        },
        injectManifest: {
          globPatterns: ["**/*.{js,css,html,ico,png,svg,woff,woff2}"]
        },
        devOptions: { enabled: true, type: "module" }
      })
    );
  }
  plugins.push(...extraPlugins);
  return {
    ...extend,
    plugins: [...plugins, ...extend.plugins ?? []],
    optimizeDeps: {
      ...metacoreOptimizeDeps,
      ...extend.optimizeDeps ?? {},
      include: [
        ...metacoreOptimizeDepsInclude,
        ...extend.optimizeDeps?.include ?? []
      ]
    }
  };
}
export {
  METACORE_FEDERATION_SINGLETONS,
  METACORE_FRONTEND_MAX_BYTES,
  METACORE_REMOTE_ENTRY_MAX_BYTES,
  METACORE_REMOTE_HOST_ONLY_SINGLETONS,
  assertFederationDistBudgets,
  assertMetacoreFederationShared,
  assertNoHandRolledFederationShared,
  defineMetacoreConfig,
  detectHandRolledFederationShared,
  metacoreFederationAliases,
  metacoreFederationBudgetPlugin,
  metacoreFederationPlugin,
  metacoreFederationShared,
  metacoreOptimizeDeps,
  metacoreOptimizeDepsInclude
};
