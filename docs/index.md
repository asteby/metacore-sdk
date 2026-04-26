---
layout: home

hero:
  name: "Metacore SDK"
  text: "Declarative addons. Zero-glue UI."
  tagline: Build a CRUD addon in 5 minutes — declare it, don't code it.
  image:
    src: /assets/metacore.svg
    alt: Metacore
  actions:
    - theme: brand
      text: Quickstart
      link: /quickstart
    - theme: alt
      text: Dynamic UI
      link: /dynamic-ui
    - theme: alt
      text: GitHub
      link: https://github.com/asteby/metacore-sdk

features:
  - icon: 📜
    title: Declarative
    details: Describe your addon in a single manifest.json — tables, columns, actions, capabilities. The kernel and SDK do the rest.
  - icon: ⚡
    title: Zero-glue UI
    details: A single &lt;DynamicTable model="..." /&gt; gives you full CRUD with pagination, sorting, filtering, edit modals, and custom actions.
  - icon: 🔒
    title: Capability-gated
    details: Permissions are part of the addon contract — declared in the manifest, enforced by the kernel, surfaced in the UI.
  - icon: 🧱
    title: Composable runtime
    details: 16 published packages — pick what you need. UI primitives, auth, websocket, theme, runtime-react, starter-config, and more.
  - icon: 🚀
    title: Production-grade releases
    details: Changesets-driven semver, automated GitHub Actions publish to npm with two-factor bypass tokens.
  - icon: 🦀
    title: WASM-native
    details: Sandboxed addon execution via wazero. Sign your addon, compile to WASM, ship safely.
---
