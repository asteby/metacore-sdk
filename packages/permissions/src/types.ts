/** Minimal HTTP surface the package needs. An axios instance satisfies it. */
export interface PermissionsHttpClient {
  get(url: string): Promise<{ data?: unknown }>
  post(url: string, body?: unknown): Promise<{ data?: unknown }>
  put(url: string, body?: unknown): Promise<{ data?: unknown }>
  delete(url: string): Promise<{ data?: unknown }>
}

/** Structural nav item — compatible with the SDK's NavItem and with host types. */
export interface NavItemLike {
  title: string
  url?: string | unknown
  icon?: unknown
  items?: NavItemLike[]
  requires?: string
  folderKey?: string
}

export interface NavGroupLike<T extends NavItemLike = NavItemLike> {
  title: string
  items: T[]
}
