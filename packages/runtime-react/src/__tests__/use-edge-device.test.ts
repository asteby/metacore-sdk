// Locks resolveEdgeDevice's selection rules: branch match wins, org-level
// device (no sucursalId) is the fallback, offline devices are never picked.
import { describe, it, expect } from 'vitest'
import { resolveEdgeDevice, type EdgeDevice } from '../use-edge-device'

function device(overrides: Partial<EdgeDevice>): EdgeDevice {
    return {
        id: 'd1',
        label: 'Device',
        kind: 'printer',
        status: 'online',
        capabilities: ['print'],
        ...overrides,
    }
}

describe('resolveEdgeDevice', () => {
    it('prefers a device paired to the active branch', () => {
        const branch = device({ id: 'branch', sucursalId: 'suc-1' })
        const other = device({ id: 'other', sucursalId: 'suc-2' })
        expect(resolveEdgeDevice([other, branch], 'print', 'suc-1')).toEqual(branch)
    })

    it('falls back to an org-level device when the branch has none', () => {
        const org = device({ id: 'org', sucursalId: null })
        const other = device({ id: 'other', sucursalId: 'suc-2' })
        expect(resolveEdgeDevice([other, org], 'print', 'suc-1')).toEqual(org)
    })

    it('returns undefined when no device offers the capability', () => {
        const weigher = device({ id: 'w1', capabilities: ['weigh'] })
        expect(resolveEdgeDevice([weigher], 'print', 'suc-1')).toBeUndefined()
    })

    it('ignores offline devices even if capability matches', () => {
        const offline = device({ id: 'off', status: 'offline', sucursalId: 'suc-1' })
        expect(resolveEdgeDevice([offline], 'print', 'suc-1')).toBeUndefined()
    })

    it('falls back to any eligible device when no sucursalId is given', () => {
        const d = device({ id: 'any', sucursalId: 'suc-9' })
        expect(resolveEdgeDevice([d], 'print')).toEqual(d)
    })
})
