// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { renderHook } from '@testing-library/react'
import type { ReactNode } from 'react'
import { ApiProvider, useApi, type ApiClient } from '../api-context'
import { resetQueryBatchCache } from '../query-batch'

const rows = { success: true, data: [{ id: 1 }], meta: { total: 1 } }

function makeClient(post: ApiClient['post']) {
  const get = vi.fn(async () => ({ data: rows }))
  const client: ApiClient = {
    get,
    post,
    put: vi.fn(async () => ({ data: {} })),
    delete: vi.fn(async () => ({ data: {} })),
  }
  return { client, get }
}

function render(client: ApiClient, batch?: boolean) {
  const wrapper = ({ children }: { children: ReactNode }) => (
    <ApiProvider client={client} batch={batch}>
      {children}
    </ApiProvider>
  )
  return renderHook(() => useApi(), { wrapper }).result.current
}

describe('ApiProvider batch', () => {
  beforeEach(() => resetQueryBatchCache())
  afterEach(() => resetQueryBatchCache())

  it('groups reads into one POST /q by default', async () => {
    const post = vi.fn(async () => ({
      data: { success: true, parts: { q1: { success: true, data: [{ id: 1 }], meta: { total: 1 } } } },
    }))
    const { client, get } = makeClient(post)
    const api = render(client)
    const res = await api.get('/data/products')
    expect(post).toHaveBeenCalledTimes(1)
    expect(post.mock.calls[0][0]).toBe('/q')
    expect(get).not.toHaveBeenCalled()
    expect(res.data.data).toEqual([{ id: 1 }])
  })

  it('does not emit POST /q with batch={false}', async () => {
    const post = vi.fn(async () => ({ data: {} }))
    const { client, get } = makeClient(post)
    const api = render(client, false)
    const res = await api.get('/data/products')
    expect(post).not.toHaveBeenCalled()
    expect(get).toHaveBeenCalledWith('/data/products')
    expect(res.data).toEqual(rows)
  })

  it('turns itself off after a 404 and resolves the read through GET', async () => {
    const post = vi.fn(async () => {
      throw Object.assign(new Error('Not Found'), { response: { status: 404 } })
    })
    const { client, get } = makeClient(post)
    const api = render(client)
    const first = await api.get('/data/products')
    expect(first.data).toEqual(rows)
    expect(post).toHaveBeenCalledTimes(1)
    await api.get('/metadata/table/products')
    await api.get('/data/orders')
    expect(post).toHaveBeenCalledTimes(1)
    expect(get).toHaveBeenCalledTimes(3)
  })

  it('keeps trying /q after a transient 500', async () => {
    const post = vi.fn(async () => {
      throw Object.assign(new Error('boom'), { response: { status: 500 } })
    })
    const { client, get } = makeClient(post)
    const api = render(client)
    await api.get('/data/products')
    await api.get('/data/orders')
    expect(post).toHaveBeenCalledTimes(2)
    expect(get).toHaveBeenCalledTimes(2)
  })
})
