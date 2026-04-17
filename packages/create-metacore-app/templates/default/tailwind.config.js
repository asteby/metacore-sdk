import preset from '@asteby/metacore-starter-config/tailwind'

/** @type {import('tailwindcss').Config} */
export default {
  presets: [preset],
  content: [
    './index.html',
    './src/**/*.{ts,tsx}',
    // Pick up classes used inside the starter-core primitives.
    './node_modules/@asteby/metacore-starter-core/dist/**/*.{js,cjs}',
  ],
}
