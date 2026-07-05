// Active-state matcher for sidebar nav. Core regression: two navs over the SAME
// model that differ only by their `view`/`group_by` query (a "Board" kanban and
// an "Issues" list) must light up ONE at a time — only the item whose view
// identity equals the current href. Filter (`f_`) and transient (page/sort)
// behaviour must be preserved.
import { describe, expect, it } from 'vitest'
import { checkIsActive, splitHref, declaredFiltersMatch } from '../nav-active'
import type { NavLinkItem, NavCollapsibleItem } from '../types'

const link = (title: string, url: string): NavLinkItem => ({ title, url })

describe('splitHref', () => {
  it('buckets view/group_by, f_ filters and transient query separately', () => {
    const s = splitHref('/m/orders?view=kanban&group_by=stage&f_status=eq:x&page=2')
    expect(s.path).toBe('/m/orders')
    expect(s.view).toBe('group_by=stage&view=kanban') // sorted, exclusive
    // `eq:` (explicit equality) normalizes to the bare value, so a nav item
    // declaring `f_status=eq:x` matches a URL rewritten to `f_status=x`.
    expect(s.filters).toBe('f_status=x')
    expect(s.query).toBe('page=2')
  })

  it('treats eq:-prefixed and bare filter values as the same filter', () => {
    const cur = splitHref('/m/orders?view=list&f_status=reception')
    const target = splitHref('/m/orders?view=list&f_status=eq:reception')
    expect(declaredFiltersMatch(cur.filters, target.filters)).toBe(true)
  })

  it('is param-order independent', () => {
    expect(splitHref('/m/o?view=kanban&group_by=stage').view).toBe(
      splitHref('/m/o?group_by=stage&view=kanban').view,
    )
  })
})

describe('checkIsActive — Board vs Issues on the same model (BUG A)', () => {
  const board = link('Board', '/m/github_issues?view=kanban&group_by=stage')
  const issues = link('Issues', '/m/github_issues?view=list')

  it('currentHref=?view=list → only Issues active', () => {
    const href = '/m/github_issues?view=list'
    expect(checkIsActive(href, issues)).toBe(true)
    expect(checkIsActive(href, board)).toBe(false)
  })

  it('currentHref=?view=kanban&group_by=stage → only Board active', () => {
    const href = '/m/github_issues?view=kanban&group_by=stage'
    expect(checkIsActive(href, board)).toBe(true)
    expect(checkIsActive(href, issues)).toBe(false)
  })

  it('query param order in the href does not change the result', () => {
    const href = '/m/github_issues?group_by=stage&view=kanban'
    expect(checkIsActive(href, board)).toBe(true)
    expect(checkIsActive(href, issues)).toBe(false)
  })
})

describe('checkIsActive — query-less default vs query-bearing sibling', () => {
  // The realistic multi-active regression: "Issues" is the bare default list
  // and "Board" carries ?view=kanban. On the board, ONLY Board must light up.
  const issuesDefault = link('Issues', '/m/github_issues')
  const board = link('Board', '/m/github_issues?view=kanban')

  it('on the board, the query-less default does NOT also light up', () => {
    const href = '/m/github_issues?view=kanban'
    expect(checkIsActive(href, board)).toBe(true)
    expect(checkIsActive(href, issuesDefault)).toBe(false)
  })

  it('on the bare model path, only the default lights up', () => {
    const href = '/m/github_issues'
    expect(checkIsActive(href, issuesDefault)).toBe(true)
    expect(checkIsActive(href, board)).toBe(false)
  })
})

describe('checkIsActive — view-less landing resolves to the model default view_type', () => {
  // The reported "both green" bug: github_issues has metadata.view_type=kanban,
  // so the bare landing `/m/github_issues?per_page=15` (no ?view) RENDERS the
  // kanban board. The matcher must resolve the absent ?view to the model's
  // ACTUAL default (kanban here) so EXACTLY ONE sibling lights — never both,
  // and never the wrong one. The default is threaded as the 4th arg (hosts pass
  // it from metadata.view_type / NavItem.defaultView).
  const tablero = link('Tablero', '/m/github_issues?view=kanban')
  const issues = link('Issues', '/m/github_issues?view=list')

  describe('(a) model default = kanban', () => {
    const href = '/m/github_issues?per_page=15' // view-less landing → kanban
    it('bare landing → ONLY the kanban/Tablero item is active', () => {
      expect(checkIsActive(href, tablero, false, 'kanban')).toBe(true)
      expect(checkIsActive(href, issues, false, 'kanban')).toBe(false)
    })
    it('bare path (no query) → ONLY the kanban/Tablero item', () => {
      expect(checkIsActive('/m/github_issues', tablero, false, 'kanban')).toBe(true)
      expect(checkIsActive('/m/github_issues', issues, false, 'kanban')).toBe(false)
    })
  })

  describe('(b) model default = list', () => {
    const href = '/m/github_issues?per_page=15' // view-less landing → list
    it('bare landing → ONLY the list/Issues item is active', () => {
      expect(checkIsActive(href, issues, false, 'list')).toBe(true)
      expect(checkIsActive(href, tablero, false, 'list')).toBe(false)
    })
    it('bare path (no query) → ONLY the list/Issues item', () => {
      expect(checkIsActive('/m/github_issues', issues, false, 'list')).toBe(true)
      expect(checkIsActive('/m/github_issues', tablero, false, 'list')).toBe(false)
    })
  })

  it('(c) explicit ?view=kanban → only the kanban item, regardless of default', () => {
    const href = '/m/github_issues?view=kanban'
    expect(checkIsActive(href, tablero, false, 'list')).toBe(true)
    expect(checkIsActive(href, issues, false, 'list')).toBe(false)
    expect(checkIsActive(href, tablero, false, 'kanban')).toBe(true)
    expect(checkIsActive(href, issues, false, 'kanban')).toBe(false)
  })

  it('(d) explicit ?view=list → only the list item, regardless of default', () => {
    const href = '/m/github_issues?view=list'
    expect(checkIsActive(href, issues, false, 'kanban')).toBe(true)
    expect(checkIsActive(href, tablero, false, 'kanban')).toBe(false)
    expect(checkIsActive(href, issues, false, 'list')).toBe(true)
    expect(checkIsActive(href, tablero, false, 'list')).toBe(false)
  })

  it('with NO default supplied, a view-less URL matches neither explicit-view sibling (never both)', () => {
    const href = '/m/github_issues?per_page=15'
    expect(checkIsActive(href, tablero)).toBe(false)
    expect(checkIsActive(href, issues)).toBe(false)
  })
})

describe('checkIsActive — singleton + filter (f_) behaviour preserved', () => {
  it('a query-less link stays highlighted under transient f_ filters', () => {
    const all = link('All Orders', '/m/orders')
    expect(checkIsActive('/m/orders?f_status=eq:reception', all)).toBe(true)
  })

  it('a query-less link stays highlighted under transient page/sort/search', () => {
    const all = link('All Orders', '/m/orders')
    expect(checkIsActive('/m/orders?page=2&sort=name', all)).toBe(true)
  })

  it('per-status entries light up one at a time by declared f_', () => {
    const reception = link('Reception', '/m/orders?f_status=eq:reception')
    const delivered = link('Delivered', '/m/orders?f_status=eq:delivered')
    const href = '/m/orders?f_status=eq:reception'
    expect(checkIsActive(href, reception)).toBe(true)
    expect(checkIsActive(href, delivered)).toBe(false)
  })

  it('a declared f_ item does not match when the filter is absent', () => {
    const reception = link('Reception', '/m/orders?f_status=eq:reception')
    expect(checkIsActive('/m/orders', reception)).toBe(false)
  })
})

describe('checkIsActive — collapsible parent + mainNav loose matching', () => {
  const parent: NavCollapsibleItem = {
    title: 'Issues',
    url: '/m/github_issues',
    items: [
      link('Board', '/m/github_issues?view=kanban&group_by=stage'),
      link('List', '/m/github_issues?view=list'),
    ],
  }

  it('parent is active when a child matches', () => {
    expect(checkIsActive('/m/github_issues?view=list', parent)).toBe(true)
  })

  it('mainNav opens the group for a deeper path under the same model', () => {
    expect(checkIsActive('/m/github_issues/123', parent, true)).toBe(true)
  })

  it('mainNav does not open an unrelated model group', () => {
    expect(checkIsActive('/m/customers', parent, true)).toBe(false)
  })
})
