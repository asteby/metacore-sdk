import { describe, expect, it, vi } from 'vitest'
import { createPermissionsApi, myPermissionsQueryKey } from './permissions-api'
import { createScreenCapabilityRegistry } from './screen-capability-implies'

function http(responses: Record<string, unknown>) {
  const calls: Array<[string, string, unknown?]> = []
  const h = (m: string) => vi.fn(async (u: string, b?: unknown) => {
    calls.push([m, u, b])
    return { data: responses[`${m} ${u}`] }
  })
  return { client: { get: h('GET'), post: h('POST'), put: h('PUT'), delete: h('DELETE') }, calls }
}

describe('createPermissionsApi', () => {
  it('query key is per user', () => {
    expect(myPermissionsQueryKey('u1')).not.toEqual(myPermissionsQueryKey('u2'))
    expect(myPermissionsQueryKey(null)[2]).toBe('anon')
  })
  it('accepts is_admin alias and defaults', async () => {
    const { client } = http({ 'GET /permissions/me': { permissions: ['a'], role: 'r', is_admin: true } })
    expect(await createPermissionsApi({ http: client }).fetchMyPermissions()).toEqual({ permissions: ['a'], role: 'r', isAdmin: true })
    const e = http({})
    expect(await createPermissionsApi({ http: e.client }).fetchMyPermissions()).toEqual({ permissions: [], role: '', isAdmin: false })
  })
  it('adapts legacy modules and stores screen_implies', async () => {
    const registry = createScreenCapabilityRegistry()
    const { client } = http({
      'GET /permissions/modules': { data: [{ key: 'x', actions: ['index', 'ship'] }], screen_implies: { 's.access': ['x.index'] } },
    })
    const cat = await createPermissionsApi({ http: client, registry }).loadPermissionModules()
    expect('modules' in cat && cat.modules[0]?.actions.map((a) => a.kind)).toEqual(['crud', 'custom'])
    expect(registry.get()).toEqual({ 's.access': ['x.index'] })
  })
  it('passes modern catalog through', async () => {
    const { client } = http({ 'GET /permissions/modules': { modules: [{ key: 'm', label: 'M', actions: [] }], general: [{ key: 'g' }] } })
    const cat = await createPermissionsApi({ http: client }).loadPermissionModules()
    expect(cat).toMatchObject({ modules: [{ key: 'm' }], general: [{ key: 'g' }] })
  })
  it('role CRUD, custom paths and sync expansion', async () => {
    const registry = createScreenCapabilityRegistry()
    registry.set({ 's.access': ['x.index'] })
    const { client, calls } = http({
      'GET /r': { data: [{ id: '1', name: 'n', label: '' }] },
      'POST /r': { data: { id: '2', name: 'n2' } },
      'GET /rp/1': { data: ['s.access'] },
    })
    const api = createPermissionsApi({ http: client, registry, paths: { roles: '/r', rolePermissions: '/rp' }, defaultRoleIcon: 'Users' })
    expect(await api.loadRoles()).toEqual([{ id: '1', name: 'n', label: undefined, color: undefined, icon: undefined }])
    expect(await api.createRole({ name: 'n2' })).toMatchObject({ id: '2' })
    expect(calls.find((c) => c[0] === 'POST')?.[2]).toMatchObject({ icon: 'Users', label: 'n2' })
    expect(await api.loadRolePermissions('1')).toEqual(['s.access', 'x.index'])
    await api.syncRolePermissions('1', ['s.access'])
    expect(calls.at(-1)).toEqual(['POST', '/rp/1/sync', { permissions: ['s.access', 'x.index'] }])
    await api.deleteRole('a/b')
    expect(calls.at(-1)?.[1]).toBe('/r/a%2Fb')
  })
})
