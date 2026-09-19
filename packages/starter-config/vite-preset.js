import { readdirSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react-swc";
import tailwindcss from "@tailwindcss/vite";

/** Align with hub `validateFrontendBudgets` (512 KiB remoteEntry). */
const METACORE_REMOTE_ENTRY_MAX_BYTES = 512 * 1024;
/** Align with hub `validateFrontendBudgets` (4 MiB frontend/). */
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
  "@tanstack/react-query",
  "@asteby/metacore-ui",
  "@asteby/metacore-runtime-react",
  "@asteby/metacore-sdk",
  "@asteby/metacore-app-providers",
  "@asteby/metacore-theme",
  "@asteby/metacore-auth"
];
function metacoreFederationShared(opts) {
  const {
    host,
    apps,
    filename = "remoteEntry.js",
    exposes,
    extras = [],
    extra = {},
    overrides = {}
  } = opts;
  const shared = {};
  for (const name of METACORE_FEDERATION_SINGLETONS) {
    shared[name] = { singleton: true };
  }
  for (const name of extras) {
    shared[name] ??= { singleton: true };
  }
  for (const [name, cfg] of Object.entries(extra)) {
    shared[name] = { singleton: true, ...cfg };
  }
  for (const [name, override] of Object.entries(overrides)) {
    shared[name] = { ...shared[name] ?? {}, ...override };
  }
  assertMetacoreFederationShared(shared);
  return {
    name: host,
    filename,
    ...apps ? { remotes: { ...apps } } : {},
    ...exposes ? { exposes: { ...exposes } } : {},
    shared
  };
}
function assertMetacoreFederationShared(shared) {
  for (const name of METACORE_FEDERATION_SINGLETONS) {
    if (!shared[name]?.singleton) {
      throw new Error(
        `metacore federation shared: "${name}" must be { singleton: true }. ` +
          `Use metacoreFederationShared() from @asteby/metacore-starter-config/vite ` +
          `and do not override singleton to false.`
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
      `frontend budget exceeded: ${outDir} is ${total} bytes (max ${maxTotal}). ` +
        `Split exposes or trim the remote — oversized federation taxes every host shell open.`
    );
  }
  if (remoteEntry > maxRemote) {
    throw new Error(
      `frontend budget exceeded: ${filename} is ${remoteEntry} bytes (max ${maxRemote}). ` +
        `Keep the container thin and lazy-load feature chunks.`
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
      outDir = opts.outDir
        ? path.resolve(config.root, opts.outDir)
        : path.resolve(config.root, config.build.outDir);
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
  assertFederationDistBudgets,
  assertMetacoreFederationShared,
  defineMetacoreConfig,
  metacoreFederationAliases,
  metacoreFederationBudgetPlugin,
  metacoreFederationShared,
  metacoreOptimizeDeps,
  metacoreOptimizeDepsInclude
};
