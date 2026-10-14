// @vitest-environment happy-dom
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { ReactElement } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const toastCalls: Array<Record<string, unknown>> = []
vi.mock('./toast', () => ({
  showNotificationToast: (opts: Record<string, unknown>) => {
    toastCalls.push(opts)
    return opts.id
  },
}))

import { NotificationsDropdown as Real } from './dropdown'
import type {
  NotificationsDropdownProps,
  NotificationItem,
  NotificationsApiClient,
  NotificationWsPayload,
} from './types'

// The built-in WebSocket path needs a provider; tests use the custom
// subscription path (a stable no-op unless a test supplies its own feed).
const noopSubscribe = () => () => {}
function NotificationsDropdown(props: NotificationsDropdownProps) {
  return <Real subscribeToNotifications={noopSubscribe} {...props} />
}

const iso = new Date().toISOString()
const item = (id: string | number, over: Partial<NotificationItem> = {}): NotificationItem => ({
  id,
  title: `Title ${id}`,
  message: `Body ${id}`,
  type: 'info',
  is_read: false,
  created_at: iso,
  ...over,
})

function fakeClient(rows: unknown, extra: Partial<NotificationsApiClient> = {}) {
  const get = vi.fn(async (_url: string, _config?: { params?: Record<string, unknown> }) => ({
    data: rows as never,
  }))
  const patch = vi.fn(async (_url: string, _data?: unknown) => ({ data: {} as never }))
  const client = { get, patch, ...extra } as unknown as NotificationsApiClient
  return { client, get, patch }
}

/** Captures the live-ingest callback so tests can push payloads. */
function liveFeed() {
  let push: (p: NotificationWsPayload) => void = () => {}
  const subscribe = (cb: (p: NotificationWsPayload) => void) => {
    push = cb
    return () => {}
  }
  return { subscribe, emit: (p: NotificationWsPayload) => act(() => push(p)) }
}

async function reopen() {
  if (trigger().getAttribute('aria-expanded') !== 'true') {
    fireEvent.pointerDown(trigger(), { button: 0, ctrlKey: false })
  }
  await waitFor(() => expect(trigger().getAttribute('aria-expanded')).toBe('true'))
}
function trigger(): HTMLElement {
  return document.querySelector('[data-slot="dropdown-menu-trigger"]') as HTMLElement
}
/** The shipped primitive only mounts the menu content while open. */
function renderOpen(ui: ReactElement, open = true) {
  const result = render(ui)
  if (open) fireEvent.pointerDown(trigger(), { button: 0, ctrlKey: false })
  return result
}

/** Let the initial list request resolve before pushing live payloads. */
const settle = () => act(async () => { await new Promise((r) => setTimeout(r, 0)) })

const noToast = { showToastOnIngest: false }

beforeEach(() => {
  toastCalls.length = 0
  vi.spyOn(console, 'error').mockImplementation(() => {})
})
afterEach(() => {
  cleanup()
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('defaults (legacy contract)', () => {
  it('requests the legacy params, reads {data}, patches per item, counts locally', async () => {
    const { client, get, patch } = fakeClient({
      data: [item('a'), item('b'), item('c', { is_read: true })],
    })
    renderOpen(<NotificationsDropdown apiClient={client} apiBasePath='/n/me' />)
    await screen.findByText('Title a')
    expect(get).toHaveBeenCalledTimes(1)
    expect(get).toHaveBeenCalledWith('/n/me', {
      params: { orderBy: 'created_at', orderDir: 'desc', per_page: 20 },
    })
    expect(screen.getByText('2 nuevas')).toBeTruthy()

    fireEvent.click(screen.getByText('Title a'))
    await waitFor(() => expect(patch).toHaveBeenCalledTimes(1))
    expect(patch).toHaveBeenCalledWith('/n/me/a', { is_read: true })
    await reopen()
    expect(screen.getByText('1 nuevas')).toBeTruthy()

    fireEvent.click(screen.getByText('Marcar todo como leído'))
    await waitFor(() => expect(patch).toHaveBeenCalledTimes(2))
    expect(patch).toHaveBeenLastCalledWith('/n/me/b', { is_read: true })
    await reopen()
    expect(screen.queryByText(/nuevas/)).toBeNull()
  })

  it('never shows a delete button nor a footer without the props', async () => {
    const { client } = fakeClient({ data: [item('a')] })
    renderOpen(<NotificationsDropdown apiClient={client} apiBasePath='/n' />)
    await screen.findByText('Title a')
    expect(screen.queryByLabelText('Eliminar notificación')).toBeNull()
  })

  it('opens nothing for a relative link; window.open only for http', async () => {
    const open = vi.spyOn(window, 'open').mockImplementation(() => null)
    const { client } = fakeClient({
      data: [item('rel', { link: '/orders/1' }), item('abs', { link: 'https://x.test/y' })],
    })
    renderOpen(<NotificationsDropdown apiClient={client} apiBasePath='/n' />)
    fireEvent.click(await screen.findByText('Title rel'))
    expect(open).not.toHaveBeenCalled()
    await reopen()
    fireEvent.click(screen.getByText('Title abs'))
    expect(open).toHaveBeenCalledWith('https://x.test/y', '_blank', 'noopener,noreferrer')
  })

  it('caps the badge at 99+ by default and honours badgeMax', async () => {
    const rows = Array.from({ length: 12 }, (_, i) => item(`n${i}`))
    const { client } = fakeClient({ data: rows })
    const { unmount } = renderOpen(
      <NotificationsDropdown apiClient={client} apiBasePath='/n' perPage={50} />,
    )
    await screen.findByText('Title n0')
    expect(screen.queryByText('12')).toBeTruthy()
    unmount()
    renderOpen(<NotificationsDropdown apiClient={client} apiBasePath='/n' badgeMax={9} />)
    await screen.findByText('Title n0')
    expect(screen.getByText('9+')).toBeTruthy()
  })
})

describe('host contract: parseList + normalizeItem', () => {
  const raw = {
    notifications: [
      { id: 7, title: 'Hola', body: 'cuerpo', type: 'info', read_at: null, created_at: iso, action_url: '/a/7' },
      { id: 8, title: 'Leída', body: 'x', type: 'info', read_at: iso, created_at: iso },
    ],
    unread_count: 42,
  }
  const props = {
    apiBasePath: '/notifications',
    listParams: (n: number) => ({ limit: n, sort: 'desc' }),
    parseList: (b: unknown) => {
      const r = b as { notifications: unknown[]; unread_count: number }
      return { items: r.notifications, unreadCount: r.unread_count }
    },
    normalizeItem: (r: unknown): NotificationItem => {
      const x = r as Record<string, unknown>
      return {
        id: x.id as number,
        title: x.title as string,
        message: (x.body as string) ?? '',
        type: x.type as 'info',
        is_read: x.read_at != null,
        created_at: x.created_at as string,
        link: x.action_url as string | undefined,
        metadata: { source: 'host' },
      }
    },
  }

  it('uses custom params, numeric ids, normalized rows and the server unread count', async () => {
    const { client, get } = fakeClient(raw)
    renderOpen(<NotificationsDropdown apiClient={client} {...props} perPage={5} />)
    await screen.findByText('Hola')
    expect(get).toHaveBeenCalledWith('/notifications', { params: { limit: 5, sort: 'desc' } })
    // server says 42 even though only one row is locally unread
    expect(screen.getByText('42 nuevas')).toBeTruthy()
  })

  it('passes the full normalized item (with metadata) to onNotificationClick, opening nothing', async () => {
    const open = vi.spyOn(window, 'open').mockImplementation(() => null)
    const onClick = vi.fn()
    const { client } = fakeClient(raw)
    renderOpen(
      <NotificationsDropdown apiClient={client} {...props} onNotificationClick={onClick} />,
    )
    fireEvent.click(await screen.findByText('Hola'))
    expect(onClick).toHaveBeenCalledTimes(1)
    expect(onClick.mock.calls[0]![0]).toMatchObject({
      id: 7,
      link: '/a/7',
      metadata: { source: 'host' },
    })
    expect(open).not.toHaveBeenCalled()
  })

  it('accepts a static listParams object', async () => {
    const { client, get } = fakeClient(raw)
    renderOpen(
      <NotificationsDropdown apiClient={client} {...props} listParams={{ a: 1 }} />,
    )
    await screen.findByText('Hola')
    expect(get).toHaveBeenCalledWith('/notifications', { params: { a: 1 } })
  })
})

describe('onMarkRead / onMarkAllRead', () => {
  it('replaces the default PATCH, optimistic, ids passed through', async () => {
    const { client, patch } = fakeClient({ data: [item(1), item(2)] })
    const onMarkRead = vi.fn(async () => {})
    renderOpen(
      <NotificationsDropdown apiClient={client} apiBasePath='/n' onMarkRead={onMarkRead} closeOnClick={false} />,
    )
    fireEvent.click(await screen.findByText('Title 1'))
    expect(screen.getByText('1 nuevas')).toBeTruthy()
    expect(onMarkRead).toHaveBeenCalledWith([1])
    expect(patch).not.toHaveBeenCalled()
  })

  it('rolls back when onMarkRead rejects', async () => {
    const { client } = fakeClient({ data: [item(1), item(2)] })
    const onMarkRead = vi.fn(async () => {
      throw new Error('boom')
    })
    renderOpen(
      <NotificationsDropdown apiClient={client} apiBasePath='/n' onMarkRead={onMarkRead} closeOnClick={false} />,
    )
    fireEvent.click(await screen.findByText('Title 1'))
    await waitFor(() => expect(onMarkRead).toHaveBeenCalled())
    await waitFor(() => expect(screen.getByText('2 nuevas')).toBeTruthy())
  })

  it('onMarkAllRead is one call, optimistic, and rolls back on failure', async () => {
    const { client, patch } = fakeClient({ data: [item(1), item(2)] })
    let fail = true
    const onMarkAllRead = vi.fn(async () => {
      if (fail) throw new Error('nope')
    })
    renderOpen(
      <NotificationsDropdown
        apiClient={client}
        apiBasePath='/n'
        onMarkAllRead={onMarkAllRead}
      />,
    )
    await screen.findByText('Title 1')
    fireEvent.click(screen.getByText('Marcar todo como leído'))
    await waitFor(() => expect(onMarkAllRead).toHaveBeenCalledTimes(1))
    await waitFor(() => expect(screen.getByText('2 nuevas')).toBeTruthy())
    fail = false
    fireEvent.click(screen.getByText('Marcar todo como leído'))
    await waitFor(() => expect(onMarkAllRead).toHaveBeenCalledTimes(2))
    expect(screen.queryByText(/nuevas/)).toBeNull()
    expect(patch).not.toHaveBeenCalled()
  })

  it('falls back to onMarkRead(unreadIds) when only that one is given', async () => {
    const { client } = fakeClient({ data: [item(1), item(2, { is_read: true }), item(3)] })
    const onMarkRead = vi.fn(async () => {})
    renderOpen(
      <NotificationsDropdown apiClient={client} apiBasePath='/n' onMarkRead={onMarkRead} closeOnClick={false} />,
    )
    await screen.findByText('Title 1')
    fireEvent.click(screen.getByText('Marcar todo como leído'))
    await waitFor(() => expect(onMarkRead).toHaveBeenCalledWith([1, 3]))
  })
})

describe('onDelete', () => {
  it('needs a second click, removes optimistically and rolls back on failure', async () => {
    const { client } = fakeClient({ data: [item(1), item(2)] })
    let fail = true
    const onDelete = vi.fn(async () => {
      if (fail) throw new Error('x')
    })
    renderOpen(<NotificationsDropdown apiClient={client} apiBasePath='/n' onDelete={onDelete} />)
    await screen.findByText('Title 1')
    const first = screen.getAllByLabelText('Eliminar notificación')[0]!
    fireEvent.click(first)
    expect(onDelete).not.toHaveBeenCalled()
    // marks-as-read must not fire from the delete click
    expect(screen.getByText('2 nuevas')).toBeTruthy()
    fireEvent.click(screen.getAllByLabelText('Pulsa de nuevo para eliminar')[0]!)
    expect(onDelete).toHaveBeenCalledWith(1)
    await waitFor(() => expect(screen.getByText('Title 1')).toBeTruthy())
    expect(screen.getByText('2 nuevas')).toBeTruthy()
    // order restored: Title 1 before Title 2
    const titles = screen.getAllByText(/^Title \d$/).map((n) => n.textContent)
    expect(titles).toEqual(['Title 1', 'Title 2'])

    fail = false
    fireEvent.click(screen.getAllByLabelText('Eliminar notificación')[0]!)
    fireEvent.click(screen.getAllByLabelText('Pulsa de nuevo para eliminar')[0]!)
    await waitFor(() => expect(screen.queryByText('Title 1')).toBeNull())
    expect(screen.getByText('1 nuevas')).toBeTruthy()
  })
})

describe('unread counter polling', () => {
  it('polls only while the tab is visible', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    const { client } = fakeClient({ data: [] })
    const fetchUnreadCount = vi.fn(async () => 5)
    let visibility: DocumentVisibilityState = 'visible'
    vi.spyOn(document, 'visibilityState', 'get').mockImplementation(() => visibility)
    renderOpen(
      <NotificationsDropdown
        apiClient={client}
        apiBasePath='/n'
        fetchUnreadCount={fetchUnreadCount}
        unreadPollMs={1000}
      />,
    )
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000)
    })
    expect(fetchUnreadCount).toHaveBeenCalledTimes(1)
    expect(screen.getByText('5')).toBeTruthy()
    visibility = 'hidden'
    await act(async () => {
      await vi.advanceTimersByTimeAsync(3000)
    })
    expect(fetchUnreadCount).toHaveBeenCalledTimes(1)
    visibility = 'visible'
    await act(async () => {
      document.dispatchEvent(new Event('visibilitychange'))
      await vi.advanceTimersByTimeAsync(0)
    })
    expect(fetchUnreadCount).toHaveBeenCalledTimes(2)
  })

  it('does not poll without unreadPollMs', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    const { client } = fakeClient({ data: [] })
    const fetchUnreadCount = vi.fn(async () => 1)
    renderOpen(
      <NotificationsDropdown
        apiClient={client}
        apiBasePath='/n'
        fetchUnreadCount={fetchUnreadCount}
      />,
    )
    await act(async () => {
      await vi.advanceTimersByTimeAsync(120000)
    })
    expect(fetchUnreadCount).not.toHaveBeenCalled()
  })
})

describe('loading / error / retry', () => {
  it('shows loading, then the error with a retry that refetches', async () => {
    const get = vi
      .fn()
      .mockRejectedValueOnce(new Error('down'))
      .mockResolvedValueOnce({ data: { data: [item('z')] } })
    const client = { get, patch: vi.fn() } as unknown as NotificationsApiClient
    renderOpen(<NotificationsDropdown apiClient={client} apiBasePath='/n' showLoadStates />)
    expect(screen.getByText('Cargando…')).toBeTruthy()
    await screen.findByText('No se pudieron cargar las notificaciones')
    fireEvent.click(screen.getByText('Reintentar'))
    await screen.findByText('Title z')
    expect(get).toHaveBeenCalledTimes(2)
  })

  it('uses overridden labels', async () => {
    const get = vi.fn().mockRejectedValue(new Error('down'))
    const client = { get, patch: vi.fn() } as unknown as NotificationsApiClient
    renderOpen(
      <NotificationsDropdown
        apiClient={client}
        apiBasePath='/n'
        labels={{ error: 'Fallo', retry: 'Otra vez' }}
        showLoadStates
      />,
    )
    await screen.findByText('Fallo')
    expect(screen.getByText('Otra vez')).toBeTruthy()
  })
})

describe('realtime', () => {
  it('onIngest gets the payload and the normalized item; dedups numeric ids', async () => {
    const { client } = fakeClient({ data: [] })
    const feed = liveFeed()
    const onIngest = vi.fn()
    renderOpen(
      <NotificationsDropdown
        apiClient={client}
        apiBasePath='/n'
        subscribeToNotifications={feed.subscribe}
        onIngest={onIngest}
        normalizeItem={(r) => {
          const p = r as NotificationWsPayload
          return {
            id: p.id as number,
            title: `N:${p.title}`,
            message: p.body ?? '',
            type: 'info',
            is_read: false,
            created_at: iso,
            metadata: { from: 'live' },
          }
        }}
        {...noToast}
      />,
    )
    await settle()
    await feed.emit({ id: 99, title: 'Vivo', body: 'b' })
    await screen.findByText('N:Vivo')
    expect(onIngest).toHaveBeenCalledTimes(1)
    expect(onIngest.mock.calls[0]![0]).toMatchObject({ id: 99, title: 'Vivo' })
    expect(onIngest.mock.calls[0]![1]).toMatchObject({ id: 99, title: 'N:Vivo', metadata: { from: 'live' } })
    await feed.emit({ id: 99, title: 'Vivo' })
    await feed.emit({ id: '99', title: 'Vivo' })
    expect(onIngest).toHaveBeenCalledTimes(1)
    expect(screen.getAllByText('N:Vivo')).toHaveLength(1)
    expect(screen.getByText('1 nuevas')).toBeTruthy()
  })

  it('still toasts with the normalized item and delegates the click', async () => {
    const { client } = fakeClient({ data: [] })
    const feed = liveFeed()
    const onClick = vi.fn()
    renderOpen(
      <NotificationsDropdown
        apiClient={client}
        apiBasePath='/n'
        subscribeToNotifications={feed.subscribe}
        onNotificationClick={onClick}
        richText={false}
      />,
    )
    await feed.emit({ id: 'l1', title: 'T', body: 'B', link: '/rel' })
    expect(toastCalls).toHaveLength(1)
    expect(toastCalls[0]).toMatchObject({ id: 'ntf-l1', title: 'T', body: 'B', richText: false })
    const open = vi.spyOn(window, 'open').mockImplementation(() => null)
    ;(toastCalls[0]!.onClick as () => void)()
    expect(onClick).toHaveBeenCalledWith(expect.objectContaining({ id: 'l1', link: '/rel' }))
    expect(open).not.toHaveBeenCalled()
  })

  it('keeps a stable subscription when callbacks are inline', async () => {
    const { client } = fakeClient({ data: [] })
    const subscribe = vi.fn(() => () => {})
    const { rerender } = renderOpen(
      <NotificationsDropdown
        apiClient={client}
        apiBasePath='/n'
        subscribeToNotifications={subscribe}
        onIngest={() => {}}
        onNotificationClick={() => {}}
      />,
    )
    rerender(
      <NotificationsDropdown
        apiClient={client}
        apiBasePath='/n'
        subscribeToNotifications={subscribe}
        onIngest={() => {}}
        onNotificationClick={() => {}}
      />,
    )
    expect(subscribe).toHaveBeenCalledTimes(1)
  })
})

describe('UI extensions', () => {
  it('footer function form + closeOnClick={true} closes the menu', async () => {
    const { client } = fakeClient({ data: [item('a')] })
    renderOpen(
      <NotificationsDropdown
        apiClient={client}
        apiBasePath='/n'
        closeOnClick
        footer={(close) => <button onClick={close}>Ver todas</button>}
      />,
    )
    await screen.findByText('Title a')
    await waitFor(() => expect(trigger().getAttribute('aria-expanded')).toBe('true'))
    fireEvent.click(screen.getByText('Ver todas'))
    await waitFor(() => expect(trigger().getAttribute('aria-expanded')).toBe('false'))
    fireEvent.pointerDown(trigger(), { button: 0, ctrlKey: false })
    await screen.findByText('Title a')
    fireEvent.click(screen.getByText('Title a'))
    await waitFor(() => expect(trigger().getAttribute('aria-expanded')).toBe('false'))
  })

  it('closeOnClick unset closes (legacy); false keeps it open', async () => {
    const { client } = fakeClient({ data: [item('a')] })
    const { unmount } = renderOpen(<NotificationsDropdown apiClient={client} apiBasePath='/n' />)
    fireEvent.click(await screen.findByText('Title a'))
    await waitFor(() => expect(trigger().getAttribute('aria-expanded')).toBe('false'))
    unmount()
    renderOpen(<NotificationsDropdown apiClient={client} apiBasePath='/n' closeOnClick={false} />)
    fireEvent.click(await screen.findByText('Title a'))
    await new Promise((r) => setTimeout(r, 50))
    expect(trigger().getAttribute('aria-expanded')).toBe('true')
  })

  it('footer element form and triggerAriaLabel', async () => {
    const { client } = fakeClient({ data: [item('a'), item('b')] })
    renderOpen(
      <NotificationsDropdown
        apiClient={client}
        apiBasePath='/n'
        footer={<a href='/all'>Todas</a>}
        triggerAriaLabel={(n) => `${n} sin leer`}
      />,
    )
    await screen.findByText('Todas')
    expect(screen.getByLabelText('2 sin leer')).toBeTruthy()
  })

  it('renderAvatar and the user initials fallback', async () => {
    const { client } = fakeClient({
      data: [item('a', { user: { name: 'Ana Pérez' } })],
    })
    const { unmount } = renderOpen(<NotificationsDropdown apiClient={client} apiBasePath='/n' />)
    await screen.findByText('AP')
    unmount()
    renderOpen(
      <NotificationsDropdown
        apiClient={client}
        apiBasePath='/n'
        renderAvatar={(n) => <i data-testid='av'>{String(n.id)}</i>}
      />,
    )
    expect((await screen.findByTestId('av')).textContent).toBe('a')
  })
})

describe('richText', () => {
  const hostile = '<img src=x onerror=alert(1)><b>hi</b>'

  it('true (default) sanitizes and keeps allowed markup', async () => {
    const { client } = fakeClient({ data: [item('a', { message: hostile })] })
    const { container } = renderOpen(<NotificationsDropdown apiClient={client} apiBasePath='/n' />)
    await screen.findByText('Title a')
    expect(document.body.querySelector('img[onerror]')).toBeNull()
    expect(document.body.querySelector('p b')?.textContent).toBe('hi')
    void container
  })

  it('false renders the body as escaped plain text', async () => {
    const { client } = fakeClient({ data: [item('a', { message: hostile })] })
    renderOpen(<NotificationsDropdown apiClient={client} apiBasePath='/n' richText={false} />)
    await screen.findByText('Title a')
    expect(document.body.querySelector('img')).toBeNull()
    expect(document.body.querySelector('p b')).toBeNull()
    expect(screen.getByText(hostile)).toBeTruthy()
  })
})

function deferred<T = void>() {
  let resolve!: (v: T) => void
  let reject!: (e: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}
const rows = () => Array.from(document.querySelectorAll('[role="menuitem"]')) as HTMLElement[]

describe('legacy default: load states are opt-in', () => {
  it('first render and a failed GET show the usual empty text, no loading/error/retry', async () => {
    const pending = deferred<{ data: unknown }>()
    const get = vi.fn().mockReturnValueOnce(pending.promise)
    const client = { get, patch: vi.fn() } as unknown as NotificationsApiClient
    renderOpen(<NotificationsDropdown apiClient={client} apiBasePath='/n' />)
    expect(screen.getByText('No tienes notificaciones')).toBeTruthy()
    expect(screen.queryByText('Cargando…')).toBeNull()
    await act(async () => {
      pending.reject(new Error('down'))
      await pending.promise.catch(() => {})
    })
    expect(get).toHaveBeenCalledTimes(1)
    expect(screen.getByText('No tienes notificaciones')).toBeTruthy()
    expect(screen.queryByText('No se pudieron cargar las notificaciones')).toBeNull()
    expect(screen.queryByText('Reintentar')).toBeNull()
  })
})

describe('live toast id', () => {
  it('passes a prefixed string id for numeric ids and opens links with noopener', async () => {
    const { client } = fakeClient({ data: [] })
    const feed = liveFeed()
    const open = vi.spyOn(window, 'open').mockImplementation(() => null)
    renderOpen(
      <NotificationsDropdown apiClient={client} apiBasePath='/n' subscribeToNotifications={feed.subscribe} />,
    )
    await settle()
    await feed.emit({ id: 5, title: 'T', link: 'https://x.test/a' })
    expect(toastCalls[0]!.id).toBe('ntf-5')
    ;(toastCalls[0]!.onClick as () => void)()
    expect(open).toHaveBeenCalledWith('https://x.test/a', '_blank', 'noopener,noreferrer')
  })

  it('treats a numeric payload id of 0 as a real id', async () => {
    const { client } = fakeClient({ data: [] })
    const feed = liveFeed()
    renderOpen(
      <NotificationsDropdown apiClient={client} apiBasePath='/n' subscribeToNotifications={feed.subscribe} />,
    )
    await settle()
    await feed.emit({ id: 0, title: 'Cero' })
    await feed.emit({ id: 0, title: 'Cero' })
    expect(toastCalls).toHaveLength(1)
    expect(toastCalls[0]!.id).toBe('ntf-0')
  })
})

describe('rollback with concurrent actions', () => {
  it('rollbackRead does not count rows deleted meanwhile', async () => {
    const { client } = fakeClient({ data: [item(1), item(2)] })
    const mark = deferred()
    const onMarkRead = vi.fn(() => mark.promise)
    const onDelete = vi.fn(async () => {})
    renderOpen(
      <NotificationsDropdown apiClient={client} apiBasePath='/n' onMarkRead={onMarkRead} onDelete={onDelete} closeOnClick={false} />,
    )
    fireEvent.click(await screen.findByText('Title 1'))
    expect(screen.getByText('1 nuevas')).toBeTruthy()
    // delete the (already read) row 1 while the mark is in flight
    fireEvent.click(screen.getAllByLabelText('Eliminar notificación')[0]!)
    fireEvent.click(screen.getAllByLabelText('Pulsa de nuevo para eliminar')[0]!)
    await waitFor(() => expect(screen.queryByText('Title 1')).toBeNull())
    await act(async () => {
      mark.reject(new Error('x'))
      await mark.promise.catch(() => {})
    })
    expect(screen.getByText('1 nuevas')).toBeTruthy()
  })

  it('rollbackRead does not double count an already reverted id', async () => {
    const { client } = fakeClient({ data: [item(1), item(2)] })
    const a = deferred()
    const b = deferred()
    const onMarkRead = vi.fn().mockReturnValueOnce(a.promise).mockReturnValueOnce(b.promise)
    renderOpen(
      <NotificationsDropdown apiClient={client} apiBasePath='/n' onMarkRead={onMarkRead} closeOnClick={false} />,
    )
    fireEvent.click(await screen.findByText('Title 1'))
    fireEvent.click(screen.getByText('Marcar todo como leído')) // marks only id 2 via onMarkRead([2])
    await waitFor(() => expect(onMarkRead).toHaveBeenCalledTimes(2))
    await act(async () => {
      a.reject(new Error('x'))
      await a.promise.catch(() => {})
    })
    expect(screen.getByText('1 nuevas')).toBeTruthy()
    await act(async () => {
      b.reject(new Error('x'))
      await b.promise.catch(() => {})
    })
    expect(screen.getByText('2 nuevas')).toBeTruthy()
  })

  it('markAll rollback is incremental: live notifications that arrived meanwhile are kept', async () => {
    const { client } = fakeClient({ data: [item(1), item(2)] })
    const feed = liveFeed()
    const all = deferred()
    renderOpen(
      <NotificationsDropdown
        apiClient={client}
        apiBasePath='/n'
        subscribeToNotifications={feed.subscribe}
        onMarkAllRead={() => all.promise}
        {...noToast}
      />,
    )
    await screen.findByText('Title 1')
    fireEvent.click(screen.getByText('Marcar todo como leído'))
    await feed.emit({ id: 'live', title: 'Live' })
    await reopen()
    expect(screen.getByText('1 nuevas')).toBeTruthy()
    await act(async () => {
      all.reject(new Error('x'))
      await all.promise.catch(() => {})
    })
    expect(screen.getByText('3 nuevas')).toBeTruthy()
  })

  it('delete rollback respects the CURRENT is_read after a failed mark-read', async () => {
    const { client } = fakeClient({ data: [item(1), item(2)] })
    const mark = deferred()
    const del = deferred()
    renderOpen(
      <NotificationsDropdown
        apiClient={client}
        apiBasePath='/n'
        onMarkRead={() => mark.promise}
        onDelete={() => del.promise}
        closeOnClick={false}
      />,
    )
    fireEvent.click(await screen.findByText('Title 1'))
    expect(screen.getByText('1 nuevas')).toBeTruthy()
    fireEvent.click(screen.getAllByLabelText('Eliminar notificación')[0]!)
    fireEvent.click(screen.getAllByLabelText('Pulsa de nuevo para eliminar')[0]!)
    await waitFor(() => expect(screen.queryByText('Title 1')).toBeNull())
    // mark-read of the deleted row fails -> it is unread again
    await act(async () => {
      mark.reject(new Error('x'))
      await mark.promise.catch(() => {})
    })
    // delete fails -> the row comes back as unread, counter back to 2
    await act(async () => {
      del.reject(new Error('x'))
      await del.promise.catch(() => {})
    })
    await screen.findByText('Title 1')
    expect(screen.getByText('2 nuevas')).toBeTruthy()
  })

  it('a poll that overlaps an action does not overwrite the optimistic counter', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    const { client } = fakeClient({ data: [item(1), item(2)] })
    const poll = deferred<number>()
    const mark = deferred()
    const fetchUnreadCount = vi.fn(() => poll.promise)
    renderOpen(
      <NotificationsDropdown
        apiClient={client}
        apiBasePath='/n'
        onMarkRead={() => mark.promise}
        fetchUnreadCount={fetchUnreadCount}
        unreadPollMs={1000}
        closeOnClick={false}
      />,
    )
    await screen.findByText('Title 1')
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000)
    })
    expect(fetchUnreadCount).toHaveBeenCalledTimes(1)
    fireEvent.click(screen.getByText('Title 1')) // optimistic: 2 -> 1
    expect(screen.getByText('1 nuevas')).toBeTruthy()
    await act(async () => {
      poll.resolve(2) // stale server value from before the action
      await poll.promise
    })
    expect(screen.getByText('1 nuevas')).toBeTruthy()
    await act(async () => {
      mark.resolve()
      await mark.promise
    })
  })
})

describe('markAll with only onMarkRead', () => {
  it('does not call onMarkRead([]) when nothing is unread', async () => {
    const { client } = fakeClient({ data: [item(1, { is_read: true })] })
    const onMarkRead = vi.fn(async () => {})
    renderOpen(<NotificationsDropdown apiClient={client} apiBasePath='/n' onMarkRead={onMarkRead} />)
    await screen.findByText('Title 1')
    fireEvent.click(screen.getByText('Marcar todo como leído'))
    await new Promise((r) => setTimeout(r, 20))
    expect(onMarkRead).not.toHaveBeenCalled()
  })
})

describe('keyboard delete', () => {
  it('Delete twice on the focused row confirms, with a live-region announcement', async () => {
    const { client } = fakeClient({ data: [item(1), item(2)] })
    const onDelete = vi.fn(async () => {})
    renderOpen(<NotificationsDropdown apiClient={client} apiBasePath='/n' onDelete={onDelete} />)
    await screen.findByText('Title 1')
    const row = rows()[0]!
    // the mouse button is out of the ARIA/tab order
    const btn = row.querySelector('button') as HTMLButtonElement
    expect(btn.getAttribute('aria-hidden')).toBe('true')
    expect(btn.tabIndex).toBe(-1)
    act(() => row.focus())
    fireEvent.keyDown(row, { key: 'Delete' })
    expect(onDelete).not.toHaveBeenCalled()
    expect(screen.getByRole('status').textContent).toBe('Pulsa Supr otra vez para eliminar')
    fireEvent.keyDown(row, { key: 'Delete' })
    expect(onDelete).toHaveBeenCalledWith(1)
    await waitFor(() => expect(screen.queryByText('Title 1')).toBeNull())
    expect(screen.getByRole('status').textContent).toBe('')
  })

  it('moving focus away cancels the pending confirmation', async () => {
    const { client } = fakeClient({ data: [item(1), item(2)] })
    const onDelete = vi.fn(async () => {})
    renderOpen(<NotificationsDropdown apiClient={client} apiBasePath='/n' onDelete={onDelete} />)
    await screen.findByText('Title 1')
    const [r1, r2] = rows()
    act(() => r1!.focus())
    fireEvent.keyDown(r1!, { key: 'Delete' })
    act(() => r2!.focus())
    fireEvent.keyDown(r1!, { key: 'Delete' })
    expect(onDelete).not.toHaveBeenCalled()
  })
})

describe('listParams robustness', () => {
  it('a throwing listParams function does not throw during render', async () => {
    const { client } = fakeClient({ data: [] })
    expect(() =>
      renderOpen(
        <NotificationsDropdown
          apiClient={client}
          apiBasePath='/n'
          listParams={() => {
            throw new Error('bad')
          }}
        />,
      ),
    ).not.toThrow()
  })
})

describe('linkActions', () => {
  it('keeps only {label, link} strings, trims and caps at 3', async () => {
    const { linkActions } = await import('./dropdown')
    expect(linkActions(undefined)).toEqual([])
    expect(linkActions('x')).toEqual([])
    expect(
      linkActions([
        { label: ' Ver ', link: ' /hallazgos/1 ' },
        { label: 'sin link' },
        { label: 1, link: '/x' },
        null,
        { label: 'B', link: '/b' },
        { label: 'C', link: '/c' },
        { label: 'D', link: '/d' },
      ]),
    ).toEqual([
      { label: 'Ver', link: '/hallazgos/1' },
      { label: 'B', link: '/b' },
      { label: 'C', link: '/c' },
    ])
  })
})
