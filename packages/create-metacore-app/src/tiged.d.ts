declare module 'tiged' {
  interface TigedEmitter {
    clone: (target: string) => Promise<void>
  }
  type TigedOptions = {
    cache?: boolean
    force?: boolean
    verbose?: boolean
  }
  function tiged(src: string, opts?: TigedOptions): TigedEmitter
  export default tiged
}
