// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { createRoot, type Root } from 'react-dom/client'
import { ActionBar } from './action-bar'
import { planActionBar, resolveMaxVisible, type ActionItem } from './action-bar-plan'
import { BackLink } from './back-link'
import { PageHeader } from './page-header'
import { PageShell } from './page-shell'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const noop = () => {}
const item = (key: string, extra: Partial<ActionItem> = {}): ActionItem => ({ key, label: key, run: noop, ...extra })
const keys = (list: ActionItem[]) => list.map((i) => i.key)

describe('planActionBar', () => {
  it('keeps a single primary and demotes later primaries to secondary', () => {
    const plan = planActionBar(
      [item('a'), item('p1', { priority: 'primary' }), item('p2', { priority: 'primary' })],
      { maxVisible: 10 },
    )
    expect(plan.primary?.key).toBe('p1')
    expect(keys(plan.inline)).toEqual(['a', 'p2'])
  })

  it('never inlines destructive actions, even when declared primary, and lists them last', () => {
    const plan = planActionBar(
      [item('del', { destructive: true, priority: 'primary' }), item('edit'), item('more', { priority: 'overflow' })],
      { maxVisible: 10 },
    )
    expect(plan.primary).toBeUndefined()
    expect(keys(plan.inline)).toEqual(['edit'])
    expect(keys(plan.overflow)).toEqual(['more'])
    expect(keys(plan.destructive)).toEqual(['del'])
  })

  it('caps inline buttons by maxVisible (primary included) and drops hidden items', () => {
    const plan = planActionBar(
      [item('p', { priority: 'primary' }), item('a'), item('b'), item('c', { hidden: true }), item('d')],
      { maxVisible: 2 },
    )
    expect(plan.primary?.key).toBe('p')
    expect(keys(plan.inline)).toEqual(['a'])
    expect(keys(plan.overflow)).toEqual(['b', 'd'])
  })

  it('collapses by measured width from the end, keeping the primary', () => {
    const widths = { p: 120, a: 90, b: 90, c: 90, __overflow__: 44 }
    const items = [item('p', { priority: 'primary' }), item('a'), item('b'), item('c')]
    const fits = (containerWidth: number) =>
      planActionBar(items, { maxVisible: 10, containerWidth, widths, overflowTriggerWidth: 44, gap: 8 })
    // 120 + 3×90 + 3×8 = 414: everything fits without «⋯».
    expect(keys(fits(414).inline)).toEqual(['a', 'b', 'c'])
    // 413 → «⋯» appears: 120+90+90+44 + 3×8 = 368 fits.
    expect(keys(fits(413).inline)).toEqual(['a', 'b'])
    expect(keys(fits(413).overflow)).toEqual(['c'])
    // 360 px phone minus gutters (328): primary + one secondary + «⋯».
    expect(keys(fits(328).inline)).toEqual(['a'])
    // Tiny box: only the primary and «⋯» remain, in the declared order.
    const tiny = fits(100)
    expect(tiny.primary?.key).toBe('p')
    expect(tiny.inline).toEqual([])
    expect(keys(tiny.overflow)).toEqual(['a', 'b', 'c'])
  })

  it('counts the «⋯» trigger when destructive items already need the menu', () => {
    const widths = { a: 100, b: 100, __overflow__: 40 }
    const plan = planActionBar([item('a'), item('b'), item('x', { destructive: true })], {
      maxVisible: 10,
      containerWidth: 216,
      widths,
      overflowTriggerWidth: 40,
      gap: 8,
    })
    // 100+100+40 + 2×8 = 256 > 216 → b collapses.
    expect(keys(plan.inline)).toEqual(['a'])
  })
})

describe('resolveMaxVisible', () => {
  it('is mobile-first like Tailwind', () => {
    const v = { base: 1, sm: 2, lg: 4 }
    expect(resolveMaxVisible(v, 360)).toBe(1)
    expect(resolveMaxVisible(v, 700)).toBe(2)
    expect(resolveMaxVisible(v, 900)).toBe(2)
    expect(resolveMaxVisible(v, 1280)).toBe(4)
    expect(resolveMaxVisible(3, 360)).toBe(3)
    expect(resolveMaxVisible(undefined, 360)).toBe(2)
    expect(resolveMaxVisible(undefined, 800)).toBe(3)
  })
})

describe('ActionBar', () => {
  let root: Root | null = null
  let host: HTMLDivElement | null = null

  afterEach(() => {
    act(() => root?.unmount())
    host?.remove()
    root = null
    host = null
    document.body.innerHTML = ''
  })

  const mount = (node: React.ReactNode) => {
    host = document.createElement('div')
    document.body.appendChild(host)
    root = createRoot(host)
    act(() => root!.render(node))
    return host
  }
  const bar = () => document.querySelector('[data-slot=action-bar]') as HTMLElement
  const visibleButtons = () =>
    Array.from(bar().querySelectorAll<HTMLButtonElement>(':scope > button, :scope > span > button'))

  it('renders one primary, labels the group and the «⋯» trigger', () => {
    mount(
      <ActionBar
        items={[
          item('edit'),
          item('dispatch', { priority: 'primary', label: 'Despachar' }),
          item('other', { priority: 'primary' }),
          item('delete', { destructive: true }),
        ]}
      />,
    )
    const group = bar()
    expect(group.getAttribute('role')).toBe('group')
    expect(group.getAttribute('aria-label')).toBe('Acciones')
    const primaries = visibleButtons().filter((b) => b.dataset.variant === 'default')
    expect(primaries.map((b) => b.dataset.action)).toEqual(['dispatch'])
    expect(visibleButtons().some((b) => b.dataset.action === 'delete')).toBe(false)
    const trigger = group.querySelector(':scope > [data-slot=action-bar-overflow]') as HTMLButtonElement
    expect(trigger.getAttribute('aria-label')).toBe('Más')
    // The measuring copies are hidden from assistive tech and focus.
    const measure = group.querySelector('[data-slot=action-bar-measure]') as HTMLElement
    expect(measure.getAttribute('aria-hidden')).toBe('true')
    expect(measure.hasAttribute('inert')).toBe(true)
  })

  it('omits «⋯» when everything fits and nothing is destructive', () => {
    mount(<ActionBar items={[item('a', { priority: 'primary' }), item('b')]} />)
    expect(bar().querySelector(':scope > [data-slot=action-bar-overflow]')).toBeNull()
  })

  it('confirms a destructive action from the sheet before running it', async () => {
    const run = vi.fn()
    mount(
      <ActionBar
        overflowAs='sheet'
        items={[item('save', { priority: 'primary' }), item('release', { label: 'Liberar apartado', destructive: true, run })]}
      />,
    )
    const trigger = bar().querySelector(':scope > [data-slot=action-bar-overflow]') as HTMLButtonElement
    expect(trigger.getAttribute('aria-haspopup')).toBe('dialog')
    act(() => trigger.click())
    const sheet = document.querySelector('[data-slot=action-bar-sheet]') as HTMLElement
    expect(sheet).not.toBeNull()
    const entry = sheet.querySelector('[data-action=release]') as HTMLButtonElement
    expect(entry.className).toContain('text-destructive')
    act(() => entry.click())
    expect(run).not.toHaveBeenCalled()
    const dialog = document.querySelector('[role=alertdialog]') as HTMLElement
    expect(dialog.textContent).toContain('¿Liberar apartado?')
    expect(dialog.textContent).toContain('Esta acción no se puede deshacer.')
    const confirm = Array.from(dialog.querySelectorAll('button')).find((b) => b.textContent === 'Liberar apartado')!
    await act(async () => confirm.click())
    expect(run).toHaveBeenCalledTimes(1)
  })

  it('runs without confirmation when confirm is false, and shows a spinner while pending', async () => {
    let resolve!: () => void
    const run = vi.fn(() => new Promise<void>((r) => (resolve = r)))
    mount(<ActionBar items={[item('go', { priority: 'primary', run }), item('other')]} />)
    const go = bar().querySelector(':scope > [data-action=go]') as HTMLButtonElement
    await act(async () => go.click())
    expect(run).toHaveBeenCalledTimes(1)
    expect(go.getAttribute('aria-busy')).toBe('true')
    // Other actions are locked while one runs.
    expect((bar().querySelector(':scope > [data-action=other]') as HTMLButtonElement).disabled).toBe(true)
    await act(async () => resolve())
    expect(go.hasAttribute('aria-busy')).toBe(false)
  })

  it('disables an action with a reason and keeps it focusable for the tooltip', () => {
    mount(<ActionBar items={[item('ship', { priority: 'primary', disabledReason: 'Falta surtir' })]} />)
    const btn = bar().querySelector('[data-action=ship]') as HTMLButtonElement
    expect(btn.disabled).toBe(true)
    expect((btn.parentElement as HTMLElement).getAttribute('tabindex')).toBe('0')
  })

  it('routes run errors to onActionError', async () => {
    const onActionError = vi.fn()
    const boom = new Error('boom')
    mount(
      <ActionBar
        onActionError={onActionError}
        items={[item('x', { priority: 'primary', run: () => Promise.reject(boom) })]}
      />,
    )
    await act(async () => (bar().querySelector(':scope > [data-action=x]') as HTMLButtonElement).click())
    expect(onActionError).toHaveBeenCalledWith(boom, expect.objectContaining({ key: 'x' }))
  })
})

describe('PageHeader', () => {
  it('marks identifier titles: one line, truncated, full value in title', () => {
    const html = renderToStaticMarkup(
      <PageHeader
        leading={<BackLink href='/m/warehouse_orders' />}
        title='SO-00004'
        titleKind='identifier'
        subtitle='Danny Alejandro'
        actions={<ActionBar items={[item('dispatch', { priority: 'primary' })]} />}
      />,
    )
    expect(html).toContain('data-title-kind="identifier"')
    expect(html).toContain('title="SO-00004"')
    expect(html).toMatch(/class="[^"]*truncate[^"]*whitespace-nowrap/)
    expect(html).toContain('Danny Alejandro')
    expect(html).toContain('@container/page-header')
    expect(html).toContain('data-slot="page-header-actions"')
    expect(html).toContain('href="/m/warehouse_orders"')
  })

  it('wraps text titles instead of cutting them', () => {
    const html = renderToStaticMarkup(<PageHeader title='Una orden con un nombre muy largo' />)
    expect(html).toContain('data-title-kind="text"')
    expect(html).toContain('break-words')
    expect(html).not.toContain('truncate')
    expect(html).not.toContain('page-header-actions')
  })
})

describe('BackLink', () => {
  it('renders an anchor with a 44px target and default label', () => {
    const html = renderToStaticMarkup(<BackLink href='/x' />)
    expect(html).toMatch(/^<a /)
    expect(html).toContain('min-h-11')
    expect(html).toContain('Atrás')
  })

  it('renders a button without href and supports asChild', () => {
    expect(renderToStaticMarkup(<BackLink onClick={noop} label='Volver' />)).toMatch(/^<button type="button"/)
    const html = renderToStaticMarkup(
      <BackLink asChild>
        <a href='/orders'>Órdenes</a>
      </BackLink>,
    )
    expect(html).toMatch(/^<a [^>]*href="\/orders"/)
    expect(html).toContain('Órdenes')
    expect(html).toContain('min-h-11')
  })
})

describe('PageShell', () => {
  it('applies the single gutter, min-w-0 and safe-area bottom padding', () => {
    const html = renderToStaticMarkup(<PageShell header={<h1>T</h1>}>body</PageShell>)
    expect(html).toContain('px-4')
    expect(html).toContain('min-w-0')
    expect(html).toContain('safe-area-inset-bottom')
    expect(html.indexOf('<h1>')).toBeLessThan(html.indexOf('body'))
  })
})
