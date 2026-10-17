// Host start-up: once, before the first view renders. Both imports are tiny;
// MapLibre and the renderers load when a `map` view or panel is first shown.
import { registerMapRenderers } from '@asteby/metacore-maps/register'

registerMapRenderers({
  config: {
    style: {
      light: 'https://cdn.example.com/map/light.json',
      dark: 'https://cdn.example.com/map/dark.json',
    },
    attribution: '© OpenStreetMap contributors',
  },
})
