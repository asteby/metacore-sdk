import react from "@vitejs/plugin-react-swc";
import tailwindcss from "@tailwindcss/vite";
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
  "@asteby/metacore-runtime-react",
  "@asteby/metacore-theme",
  "@asteby/metacore-auth",
  "@asteby/metacore-ui",
  "@asteby/metacore-sdk"
];
function metacoreFederationShared(opts) {
  const {
    host,
    apps,
    filename = "remoteEntry.js",
    exposes,
    extras = [],
    overrides = {}
  } = opts;
  const shared = {};
  for (const name of METACORE_FEDERATION_SINGLETONS) {
    shared[name] = { singleton: true, requiredVersion: false };
  }
  for (const name of extras) {
    shared[name] ??= { singleton: true, requiredVersion: false };
  }
  for (const [name, override] of Object.entries(overrides)) {
    shared[name] = { ...shared[name] ?? {}, ...override };
  }
  return {
    name: host,
    filename,
    ...apps ? { remotes: { ...apps } } : {},
    ...exposes ? { exposes: { ...exposes } } : {},
    shared
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
  defineMetacoreConfig,
  metacoreFederationShared,
  metacoreOptimizeDeps,
  metacoreOptimizeDepsInclude
};
