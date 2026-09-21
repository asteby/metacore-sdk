import { describe, expect, it } from 'vitest'
import {
  applySidebarLayout,
  coreRefKey,
  folderAccessCapability,
  leafRefFor,
  slugifyFolderKey,
  type CatalogLeaf,
  type SidebarLayoutNode,
} from './apply-sidebar-layout'

describe('applySidebarLayout', () => {
  const catalog: CatalogLeaf[] = [
    { ref: coreRefKey('/'), title: 'Dashboard', url: '/' },
    { ref: 'addon:crm/model:prices', title: 'Precios', url: '/m/prices', aliases: ['url:/m/prices'] },
    { ref: coreRefKey('/organization'), title: 'Org', url: '/organization' },
  ]

  it('returns null for empty tree', () => {
    expect(applySidebarLayout(catalog, [])).toBeNull()
  })

  it('moves prices under a configuration folder', () => {
    const tree: SidebarLayoutNode[] = [
      {
        type: 'group',
        title: 'Sistema',
        children: [
          {
            type: 'folder',
            key: 'configuracion',
            title: 'Configuración',
            children: [
              { type: 'leaf', ref: coreRefKey('/organization') },
              { type: 'leaf', ref: 'addon:crm/model:prices' },
            ],
          },
        ],
      },
    ]
    const groups = applySidebarLayout(catalog, tree)
    expect(groups).toHaveLength(1)
    expect(groups![0].items[0].folderKey).toBe('configuracion')
    expect(groups![0].items[0].items?.map((i) => i.url)).toEqual([
      '/organization',
      '/m/prices',
    ])
  })

  it('resolves url: alias', () => {
    const tree: SidebarLayoutNode[] = [
      {
        type: 'group',
        title: 'G',
        children: [{ type: 'leaf', ref: 'url:/m/prices' }],
      },
    ]
    const groups = applySidebarLayout(catalog, tree)
    expect(groups![0].items[0].url).toBe('/m/prices')
  })
})

describe('helpers', () => {
  it('slugifies folder keys', () => {
    expect(slugifyFolderKey('Mi Config')).toBe('mi_config')
  })
  it('folder capability', () => {
    expect(folderAccessCapability('configuracion')).toBe('folder.configuracion.access')
  })
  it('leafRefFor model pages', () => {
    expect(leafRefFor('/m/prices')).toBe('url:/m/prices')
    expect(leafRefFor('/organization')).toBe('core:/organization')
  })
})
