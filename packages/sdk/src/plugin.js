/**
 * Plugin contract — every addon's federated module default-exports one of these.
 * The host calls `register(api)` once after loading the remote entry.
 */
/**
 * Convenience helper so addon authors get type inference on the object literal:
 *
 *   export default definePlugin({
 *     key: "tickets",
 *     register(api) { api.registry.registerRoute(...) },
 *   });
 */
export function definePlugin(p) {
    return p;
}
