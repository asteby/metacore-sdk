---
'@asteby/metacore-sdk': minor
'@asteby/metacore-starter-config': patch
---

docs: documenting `ModalProps.payload` widening and federation canonical helper.

Two contract changes that existed in code but had no docs:

1. **`ModalProps.payload` widening.** `packages/sdk/src/registry.ts` declares
   `payload: Record<string, unknown>` — the registry holds modals from any
   addon, so the typed shape cannot survive contravariance. Addons that used
   to declare a narrow `payload: { ticketId }` directly on the prop type need
   to switch to the **narrow-at-entry** pattern: type the component as
   `ModalProps`, then `const { ticketId } = props.payload as unknown as MyPayload`
   inside the body. The runtime contract is unchanged. See the new
   [`docs/modals.md`](https://github.com/asteby/metacore-sdk/blob/main/docs/modals.md)
   and the new "Modals" section in `packages/sdk/README.md`.

2. **`metacoreFederationShared()` is the canonical federation helper.**
   `@originjs/vite-plugin-federation` >= 1.4 dropped `singleton` from its
   public `SharedConfig` TypeScript type (the runtime still honours the
   field). Any addon authoring a `shared:` block against the plugin's own
   type will fail to typecheck on the next bump. The new
   [`docs/federation.md`](https://github.com/asteby/metacore-sdk/blob/main/docs/federation.md)
   promotes `metacoreFederationShared()` from `@asteby/metacore-starter-config/vite`
   as the **only** documented way to wire federation, with a worked sample,
   a warning against the plugin's direct type, and a fallback for the rare
   case where the helper does not fit. The starter-config README links to
   it, and the `addon-cookbook.md` "How do I bundle a frontend extension"
   recipe + the `full-page-federation.md` sample now use the helper instead
   of the legacy inline `shared:` array.

No runtime or public type changes — docs only.
