// @vitest-environment happy-dom
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Composer } from './composer'
import { ConversationList } from './conversation-list'
import { HtmlSandboxFrame } from './html-sandbox-frame'
import { InboxProvider } from './i18n'
import { ProposalCard } from './proposal-card'
import { ThreadView } from './thread-view'
import { useInboxShortcuts } from './shortcuts'
import type { ConversationSummary, ThreadMessage } from './types'
import { createLocalDraftStore } from './drafts'

afterEach(() => {
  cleanup()
  localStorage.clear()
  vi.useRealTimers()
})

const many = (n: number): ConversationSummary[] =>
  Array.from({ length: n }, (_, i) => ({ id: `c${i}`, participants: `Persona ${i}`, title: `Asunto ${i}`, preview: 'hola', lastAt: '2026-10-22T10:00:00Z', unread: i === 0 }))

describe('ConversationList', () => {
  it('virtualizes: 10k items mount a small window', () => {
    render(<ConversationList items={many(10_000)} onSelect={() => {}} />)
    const n = screen.getAllByRole('option').length
    expect(n).toBeGreaterThan(0)
    expect(n).toBeLessThan(40)
    expect(screen.getAllByRole('option')[0]!.getAttribute('aria-setsize')).toBe('10000')
  })
  it('selects on click and moves with arrow keys', () => {
    const onSelect = vi.fn()
    render(<ConversationList items={many(5)} selectedId="c1" onSelect={onSelect} />)
    fireEvent.click(screen.getByText('Persona 3'))
    expect(onSelect).toHaveBeenLastCalledWith('c3')
    fireEvent.keyDown(screen.getByRole('listbox'), { key: 'ArrowDown' })
    expect(onSelect).toHaveBeenLastCalledWith('c2')
    expect(screen.getByRole('option', { selected: true }).textContent).toContain('Persona 1')
  })
  it('renders loading, empty and error states (localized)', () => {
    const retry = vi.fn()
    const { rerender } = render(<ConversationList items={[]} loading onSelect={() => {}} />)
    expect(screen.getByRole('status')).toBeTruthy()
    rerender(<ConversationList items={[]} onSelect={() => {}} />)
    expect(screen.getByText('Todo al día')).toBeTruthy()
    rerender(
      <InboxProvider locale="en">
        <ConversationList items={[]} error="x" onRetry={retry} onSelect={() => {}} />
      </InboxProvider>,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }))
    expect(retry).toHaveBeenCalled()
  })
  it('fires onEndReached once per length', () => {
    const onEnd = vi.fn()
    const { rerender } = render(<ConversationList items={many(10)} onSelect={() => {}} onEndReached={onEnd} />)
    expect(onEnd).toHaveBeenCalledTimes(1)
    rerender(<ConversationList items={many(10)} onSelect={() => {}} onEndReached={onEnd} />)
    expect(onEnd).toHaveBeenCalledTimes(1)
  })
})

describe('ThreadView', () => {
  const msgs: ThreadMessage[] = [
    { id: '1', direction: 'in', sender: { name: 'Ana', address: 'a@x.com' }, sentAt: '2026-10-22T10:00:00Z', text: 'Hola\n\nOn Mon, Oct 5, 2026 at 10:00 AM Bo <b@x.com> wrote:\n> viejo', attachments: [{ id: 'f', name: 'cfdi.pdf', size: 2048, url: '/f' }] },
    { id: '2', direction: 'in', sender: { name: 'Ana', address: 'a@x.com' }, sentAt: '2026-10-22T10:01:00Z', text: 'otra cosa' },
    { id: '3', direction: 'out', sender: { name: 'Yo' }, sentAt: '2026-10-22T10:30:00Z', text: 'respuesta', status: 'failed' },
  ]
  it('groups messages, collapses quotes and lists attachments', () => {
    render(<ThreadView messages={msgs} title="Factura" onRetrySend={() => {}} />)
    expect(screen.getAllByRole('region')).toHaveLength(2)
    expect(screen.queryByText(/viejo/)).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Mostrar texto citado' }))
    expect(screen.getByText(/viejo/)).toBeTruthy()
    expect(screen.getByRole('link', { name: /cfdi.pdf/ }).getAttribute('href')).toBe('/f')
    expect(screen.getByRole('button', { name: 'Reintentar' })).toBeTruthy()
  })
  it('shows skeleton, error and empty', () => {
    const { rerender } = render(<ThreadView messages={[]} loading />)
    expect(screen.getByRole('status')).toBeTruthy()
    rerender(<ThreadView messages={[]} error="x" />)
    expect(screen.getByRole('alert')).toBeTruthy()
    rerender(<ThreadView messages={[]} />)
    expect(screen.getByText('Selecciona una conversación')).toBeTruthy()
  })
})

describe('ThreadView url hygiene', () => {
  it('drops javascript: attachment links and avatars', () => {
    const m = [{ id: '1', direction: 'in' as const, sender: { name: 'Ana', address: 'a@x.com', avatarUrl: 'javascript:alert(1)' }, sentAt: '2026-10-22T10:00:00Z', text: 'x', attachments: [{ id: 'f', name: 'evil.pdf', size: 1, url: 'javascript:alert(1)' }, { id: 'g', name: 'ok.pdf', size: 1, url: 'https://x.com/ok.pdf' }] }]
    const { container } = render(<ThreadView messages={m} title="t" />)
    expect(container.innerHTML).not.toContain('javascript:')
    expect(container.querySelector('a[href="https://x.com/ok.pdf"]')).toBeTruthy()
  })
})

describe('HtmlSandboxFrame', () => {
  it('uses a script-less sandbox, blocks images and offers an opt-in', () => {
    const onLoad = vi.fn()
    render(<HtmlSandboxFrame html={'<p>x</p><img src="https://t.example/p.gif">'} onLoadImages={onLoad} />)
    const frame = screen.getByTitle('Contenido del mensaje') as HTMLIFrameElement
    const sandbox = frame.getAttribute('sandbox') ?? ''
    expect(sandbox).not.toMatch(/allow-scripts/) // INVARIANT: never allow-scripts together with allow-same-origin
    expect(frame.getAttribute('srcdoc')).not.toContain('p.gif')
    fireEvent.click(screen.getByRole('button', { name: 'Cargar imágenes' }))
    expect(onLoad).toHaveBeenCalled()
    expect((screen.getByTitle('Contenido del mensaje') as HTMLIFrameElement).getAttribute('srcdoc')).toContain('p.gif')
    expect(screen.queryByRole('button', { name: 'Cargar imágenes' })).toBeNull()
  })
})

describe('Composer', () => {
  it('sends with ctrl+enter, builds safe html and clears', async () => {
    const onSend = vi.fn().mockResolvedValue(undefined)
    render(<Composer onSend={onSend} />)
    const ta = screen.getByRole('textbox')
    fireEvent.change(ta, { target: { value: '**hola** <b>' } })
    fireEvent.keyDown(ta, { key: 'Enter', ctrlKey: true })
    await waitFor(() => expect(onSend).toHaveBeenCalled())
    expect(onSend.mock.calls[0]![0]).toMatchObject({ text: '**hola** <b>', html: '<p><strong>hola</strong> &lt;b&gt;</p>' })
    await waitFor(() => expect((ta as HTMLTextAreaElement).value).toBe(''))
  })
  it('keeps content and shows the error when send fails', async () => {
    render(<Composer onSend={() => Promise.reject(new Error('SMTP caído'))} />)
    const ta = screen.getByRole('textbox') as HTMLTextAreaElement
    fireEvent.change(ta, { target: { value: 'hola' } })
    fireEvent.click(screen.getByRole('button', { name: 'Enviar' }))
    expect((await screen.findByRole('alert')).textContent).toBe('SMTP caído')
    expect(ta.value).toBe('hola')
  })
  it('disables send when empty and sends the chosen identity', async () => {
    const onSend = vi.fn()
    render(<Composer onSend={onSend} identities={[{ id: 'a', label: 'Ventas' }, { id: 'b', label: 'Soporte' }]} />)
    expect((screen.getByRole('button', { name: 'Enviar' }) as HTMLButtonElement).disabled).toBe(true)
    fireEvent.change(screen.getByLabelText('Enviar como'), { target: { value: 'b' } })
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'x' } })
    fireEvent.click(screen.getByRole('button', { name: 'Enviar' }))
    await waitFor(() => expect(onSend).toHaveBeenCalled())
    expect(onSend.mock.calls[0]![0].identityId).toBe('b')
  })
  it('autosaves the draft (debounced) and restores it', async () => {
    const store = createLocalDraftStore('t:')
    const { unmount } = render(<Composer onSend={() => {}} draftKey="conv1" draftStore={store} draftDelayMs={20} />)
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'borrador' } })
    await waitFor(() => expect(store.load('conv1')).toMatchObject({ text: 'borrador' }))
    unmount()
    render(<Composer onSend={() => {}} draftKey="conv1" draftStore={store} draftDelayMs={20} />)
    await waitFor(() => expect((screen.getByRole('textbox') as HTMLTextAreaElement).value).toBe('borrador'))
  })
  it('never saves the previous conversation text under the new draftKey', async () => {
    const saved: Record<string, string> = {}
    let release: (v: null) => void = () => {}
    const store = {
      load: (k: string) => (k === 'conv2' ? new Promise<null>((r) => (release = r)) : null),
      save: (k: string, d: { text: string }) => void (saved[k] = d.text),
      remove: (k: string) => void delete saved[k],
    }
    const { rerender, unmount } = render(<Composer onSend={() => {}} draftKey="conv1" draftStore={store} draftDelayMs={20} />)
    await new Promise((r) => setTimeout(r, 10)) // conv1 hydrated
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'texto A' } })
    rerender(<Composer onSend={() => {}} draftKey="conv2" draftStore={store} draftDelayMs={20} />)
    await new Promise((r) => setTimeout(r, 60))
    unmount()
    release(null)
    expect(saved.conv1).toBe('texto A')
    expect(saved.conv2).toBeUndefined()
  })
  it('draft store clear() removes only its own prefix', () => {
    localStorage.setItem('other:x', '1')
    const store = createLocalDraftStore('mine:')
    store.save('a', { text: 'x' })
    store.clear?.()
    expect(store.load('a')).toBeNull()
    expect(localStorage.getItem('other:x')).toBe('1')
  })
  it('uploads attachments through the adapter and rejects oversize', async () => {
    const upload = vi.fn().mockResolvedValue({ id: 'srv1', name: 'a.txt', size: 3 })
    const onSend = vi.fn()
    render(<Composer onSend={onSend} uploadAttachment={upload} maxAttachmentBytes={10} />)
    const input = screen.getByTestId('composer-file-input')
    fireEvent.change(input, { target: { files: [new File(['abc'], 'a.txt'), new File(['x'.repeat(50)], 'big.bin')] } })
    await waitFor(() => expect(screen.getByText('a.txt')).toBeTruthy())
    expect(upload).toHaveBeenCalledTimes(1)
    expect(screen.getByText('No se pudo subir')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Enviar' }))
    await waitFor(() => expect(onSend).toHaveBeenCalled())
    expect(onSend.mock.calls[0]![0].attachments).toEqual([{ id: 'srv1', name: 'a.txt', size: 3 }])
  })
})

describe('ProposalCard', () => {
  it('confirms, shows progress and the final state', async () => {
    let done!: () => void
    const onConfirm = vi.fn(() => new Promise<void>((r) => (done = r)))
    render(<ProposalCard title="Crear tarea" risk="high" onConfirm={onConfirm} onDismiss={() => {}} />)
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar' }))
    expect(screen.getByRole('button', { name: 'Aplicando…' })).toBeTruthy()
    await act(async () => done())
    expect(screen.getByText('Aplicada')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Confirmar' })).toBeNull()
  })
  it('surfaces errors and allows retry; dismisses', async () => {
    const onConfirm = vi.fn().mockRejectedValueOnce(new Error('falló')).mockResolvedValue(undefined)
    const onDismiss = vi.fn()
    render(<ProposalCard title="x" onConfirm={onConfirm} onDismiss={onDismiss} />)
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar' }))
    expect((await screen.findByRole('alert')).textContent).toBe('falló')
    fireEvent.click(screen.getByRole('button', { name: 'Descartar' }))
    await waitFor(() => expect(screen.getByText('Descartada')).toBeTruthy())
    expect(onDismiss).toHaveBeenCalled()
  })
})

describe('useInboxShortcuts', () => {
  function Probe({ h }: { h: Record<string, () => void> }) {
    useInboxShortcuts(h)
    return <input aria-label="campo" />
  }
  it('fires single keys, skips while typing, but allows mod combos', () => {
    const h = { next: vi.fn(), send: vi.fn(), delete: vi.fn() }
    render(<Probe h={h} />)
    fireEvent.keyDown(document.body, { key: 'j' })
    expect(h.next).toHaveBeenCalledTimes(1)
    fireEvent.keyDown(document.body, { key: '#', shiftKey: true })
    expect(h.delete).toHaveBeenCalledTimes(1)
    const input = screen.getByLabelText('campo')
    fireEvent.keyDown(input, { key: 'j' })
    expect(h.next).toHaveBeenCalledTimes(1)
    fireEvent.keyDown(input, { key: 'Enter', ctrlKey: true })
    fireEvent.keyDown(input, { key: 'Enter', metaKey: true })
    expect(h.send).toHaveBeenCalled()
  })
})
