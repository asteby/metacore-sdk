import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { parseBrand } from '@asteby/metacore-sdk/brand'
import { ProductBrandProvider } from '@asteby/metacore-app-providers/brand'
import { AgentWorkspaceProvider, storageKey } from './host'

const brand = (extra: Record<string, unknown> = {}) =>
  parseBrand({
    spec: 1,
    key: 'demo',
    name: 'Demo',
    assets: { icon: { url: '/i', type: 'image/svg+xml' } },
    ...extra,
  })!

function keyUnder(props: { namespace?: string; brand?: ReturnType<typeof brand> }) {
  let key = ''
  const Probe = () => {
    key = storageKey('draft')
    return null
  }
  const host = createElement(
    AgentWorkspaceProvider,
    {
      http: {} as never,
      realtime: {} as never,
      user: null,
      navGroups: undefined,
      storageNamespace: props.namespace,
    },
    createElement(Probe),
  )
  renderToStaticMarkup(
    props.brand ? createElement(ProductBrandProvider, { initial: props.brand }, host) : host,
  )
  return key
}

describe('AgentWorkspaceProvider storageNamespace', () => {
  it('keeps ops as the default without a product brand', () => {
    expect(keyUnder({})).toBe('ops:draft')
  })
  it('takes the product storage_namespace, then the brand key', () => {
    expect(keyUnder({ brand: brand({ storage_namespace: 'vnt' }) })).toBe('vnt:draft')
    expect(keyUnder({ brand: brand() })).toBe('demo:draft')
  })
  it('an explicit prop always wins', () => {
    expect(keyUnder({ namespace: 'mi-app', brand: brand({ storage_namespace: 'vnt' }) })).toBe('mi-app:draft')
  })
})
