// DynamicView routing decision: the same model exposes a "Board" nav
// (`?view=kanban`) and an "Issues" nav (`?view=list`), so the per-nav `view`
// signal — explicit prop or `?view=` query — must win over the model-level
// `metadata.view_type`. These are the pure helpers behind that decision.
import { describe, expect, it } from 'vitest'
import {
    resolveViewRenderer,
    readViewFromSearch,
    resolveActiveView,
} from '../dynamic-view'

describe('resolveViewRenderer', () => {
    it('maps kanban → kanban and everything else → table', () => {
        expect(resolveViewRenderer('kanban')).toBe('kanban')
        expect(resolveViewRenderer('list')).toBe('table')
        expect(resolveViewRenderer('table')).toBe('table')
        expect(resolveViewRenderer(undefined)).toBe('table')
    })
})

describe('readViewFromSearch', () => {
    it('reads view from a leading-? search string', () => {
        expect(readViewFromSearch('?view=kanban&group_by=stage')).toBe('kanban')
    })
    it('reads view from a bare query string', () => {
        expect(readViewFromSearch('view=list')).toBe('list')
    })
    it('reads view from a full href', () => {
        expect(readViewFromSearch('/m/github_issues?view=kanban')).toBe('kanban')
    })
    it('returns undefined when absent or empty', () => {
        expect(readViewFromSearch('?page=2')).toBeUndefined()
        expect(readViewFromSearch('')).toBeUndefined()
        expect(readViewFromSearch(undefined)).toBeUndefined()
    })
})

describe('resolveActiveView precedence', () => {
    it('explicit prop wins over query and metadata', () => {
        expect(resolveActiveView('kanban', '?view=list', 'table')).toBe('kanban')
    })
    it('query wins over metadata when no explicit prop', () => {
        expect(resolveActiveView(undefined, '?view=kanban', 'table')).toBe(
            'kanban',
        )
    })
    it('falls back to metadata view_type when neither prop nor query present', () => {
        expect(resolveActiveView(undefined, '?page=2', 'kanban')).toBe('kanban')
        expect(resolveActiveView(undefined, undefined, 'table')).toBe('table')
    })
    it('Board vs Issues on the same model route to different surfaces', () => {
        // model metadata default could be either; the nav query decides.
        const boardView = resolveActiveView(
            undefined,
            '?view=kanban&group_by=stage',
            'list',
        )
        const issuesView = resolveActiveView(undefined, '?view=list', 'list')
        expect(resolveViewRenderer(boardView)).toBe('kanban')
        expect(resolveViewRenderer(issuesView)).toBe('table')
    })
})
