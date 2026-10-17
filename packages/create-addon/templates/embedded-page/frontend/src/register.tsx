/**
 * {{ADDON_NAME}} — headless entry (`./register`).
 *
 * Pages are NOT registered here: `manifest.json#frontend.pages[]` is the
 * registry, and the host mounts `./pages/board` at /a/{{ADDON_KEY}}/board inside
 * its chrome. Use register() only for actions, slots and modals.
 */
import { definePlugin } from '@asteby/metacore-sdk'

export default definePlugin({
  key: '{{ADDON_KEY}}',
  register(api) {
    api.log.info('{{ADDON_KEY}} registered', { version: api.manifest.version })
  },
})
