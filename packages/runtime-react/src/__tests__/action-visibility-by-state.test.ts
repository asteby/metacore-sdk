import { describe, it, expect } from 'vitest'

import { isActionAllowedForRowState } from '../dynamic-columns'

describe('isActionAllowedForRowState', () => {
    it('hides the action when row.status is NOT in requiresState', () => {
        const action = { key: 'start', requiresState: ['reception'] }
        const row = { id: 1, status: 'in_progress' }
        expect(isActionAllowedForRowState(action, row)).toBe(false)
    })

    it('shows the action when row.status IS in requiresState', () => {
        const action = { key: 'start', requiresState: ['reception'] }
        const row = { id: 1, status: 'reception' }
        expect(isActionAllowedForRowState(action, row)).toBe(true)
    })

    it('shows the action when row.status matches one of several requiresState entries', () => {
        const action = { key: 'finish', requiresState: ['in_progress', 'paused'] }
        expect(isActionAllowedForRowState(action, { status: 'paused' })).toBe(true)
    })

    it('always shows the action when requiresState is empty', () => {
        const action = { key: 'view', requiresState: [] as string[] }
        expect(isActionAllowedForRowState(action, { status: 'whatever' })).toBe(true)
    })

    it('always shows the action when requiresState is absent (no regression)', () => {
        const action = { key: 'view' }
        expect(isActionAllowedForRowState(action, { status: 'in_progress' })).toBe(true)
    })

    it('shows all actions when the row has no status field (no regression)', () => {
        const action = { key: 'start', requiresState: ['reception'] }
        expect(isActionAllowedForRowState(action, { id: 1 })).toBe(true)
        expect(isActionAllowedForRowState(action, { id: 1, status: null })).toBe(true)
        expect(isActionAllowedForRowState(action, { id: 1, status: '' })).toBe(true)
    })

    it('tolerates the snake_case requires_state served by the backend', () => {
        const action = { key: 'start', requires_state: ['reception'] }
        expect(isActionAllowedForRowState(action, { status: 'reception' })).toBe(true)
        expect(isActionAllowedForRowState(action, { status: 'in_progress' })).toBe(false)
    })

    it('coerces numeric status / state values via String() comparison', () => {
        const action = { key: 'advance', requiresState: [1, 2] as unknown as string[] }
        expect(isActionAllowedForRowState(action, { status: 2 })).toBe(true)
        expect(isActionAllowedForRowState(action, { status: '3' })).toBe(false)
    })

    it('falls back to row.state when status is absent (purchases, transfers)', () => {
        const receive = { key: 'receive_goods', requiresState: ['confirmed', 'partial'] }
        expect(isActionAllowedForRowState(receive, { state: 'draft' })).toBe(false)
        expect(isActionAllowedForRowState(receive, { state: 'confirmed' })).toBe(true)
        expect(isActionAllowedForRowState(receive, { state: 'partial' })).toBe(true)
        expect(isActionAllowedForRowState(receive, { state: 'received' })).toBe(false)
    })

    it('prefers status over state when both are set', () => {
        const action = { key: 'start', requiresState: ['reception'] }
        expect(isActionAllowedForRowState(action, { status: 'reception', state: 'draft' })).toBe(true)
        expect(isActionAllowedForRowState(action, { status: 'in_progress', state: 'reception' })).toBe(false)
    })

    it('ignores empty status and uses state instead', () => {
        const action = { key: 'confirm', requiresState: ['draft'] }
        expect(isActionAllowedForRowState(action, { status: '', state: 'draft' })).toBe(true)
        expect(isActionAllowedForRowState(action, { status: '', state: 'confirmed' })).toBe(false)
    })
})
