export const cx = (...c: Array<string | false | null | undefined>) => c.filter(Boolean).join(' ')

export const FOCUS =
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-background'
