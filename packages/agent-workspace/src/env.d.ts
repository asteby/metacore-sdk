// Vite-style globals the moved code relies on; the host bundler provides them.
interface ImportMeta {
  readonly env: { readonly BASE_URL: string; readonly [key: string]: unknown }
}
declare module '*.css'
