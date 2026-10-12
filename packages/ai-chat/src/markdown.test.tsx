// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Markdown } from './markdown'
import { closeOpenFences, normalizeMarkdown } from './text/normalize'
import { CopilotChat } from './copilot-chat'
import { CopilotProvider } from './context'
import type { ChatClient } from './types'

afterEach(cleanup)

describe('Markdown', () => {
  it('renders bold, ordered and unordered lists instead of literal markers', () => {
    const { container } = render(<Markdown content={'Hola **mundo**\n\n1. uno\n2. dos\n\n- a\n- b'} />)
    expect(container.querySelector('strong')?.textContent).toBe('mundo')
    expect(container.querySelectorAll('ol > li')).toHaveLength(2)
    expect(container.querySelectorAll('ul > li')).toHaveLength(2)
    expect(container.textContent).not.toContain('**')
  })

  it('turns bullet glyph piles into a list', () => {
    const { container } = render(<Markdown content={'Opciones • uno • dos'} />)
    expect(container.querySelectorAll('ul > li')).toHaveLength(2)
  })

  it('never renders raw HTML', () => {
    const { container } = render(<Markdown content={'<script>window.x=1</script><img src=x onerror=alert(1)> hola'} />)
    expect(container.querySelector('script')).toBeNull()
    expect(container.querySelector('img')).toBeNull()
    expect(container.textContent).toContain('hola')
  })

  it('neutralises javascript: links and hardens external ones', () => {
    const { container } = render(<Markdown content={'[mal](javascript:alert(1)) [bien](https://example.com)'} />)
    const [bad, good] = Array.from(container.querySelectorAll('a'))
    expect(bad?.getAttribute('href') ?? '').not.toMatch(/^javascript:/i)
    expect(good?.getAttribute('rel')).toContain('noopener')
    expect(good?.getAttribute('target')).toBe('_blank')
  })

  it('lets the host intercept in-app links', () => {
    const onLinkClick = vi.fn().mockReturnValue(true)
    render(<Markdown content={'[ver](/m/clientes/7)'} onLinkClick={onLinkClick} />)
    const evt = fireEvent.click(screen.getByText('ver'))
    expect(onLinkClick).toHaveBeenCalledWith('/m/clientes/7', expect.anything())
    expect(evt).toBe(false) // preventDefault called
  })

  it('blocks non-http(s) images', () => {
    const { container } = render(<Markdown content={'![x](data:image/svg+xml;base64,AAAA) ![ok](https://e.com/a.png)'} />)
    const imgs = Array.from(container.querySelectorAll('img'))
    expect(imgs).toHaveLength(1)
    expect(imgs[0]?.getAttribute('src')).toBe('https://e.com/a.png')
  })

  it('wraps tables in a scroll container', () => {
    const { container } = render(<Markdown content={'| a | b |\n|---|---|\n| 1 | 2 |'} />)
    const table = container.querySelector('table')
    expect(table).not.toBeNull()
    expect(table!.parentElement!.className).toContain('overflow-x-auto')
  })

  it('copies code blocks', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })
    render(<Markdown content={'```ts\nconst a = 1\n```'} />)
    fireEvent.click(screen.getByRole('button', { name: 'Copiar código' }))
    await waitFor(() => expect(writeText).toHaveBeenCalledWith('const a = 1'))
    await screen.findByRole('button', { name: 'Copiado' })
  })

  it('closes an unterminated fence while streaming', () => {
    expect(closeOpenFences('a\n```js\nlet x')).toMatch(/```$/)
    expect(closeOpenFences('a\n```js\nlet x\n```')).toBe('a\n```js\nlet x\n```')
    const { container } = render(<Markdown streaming content={'texto\n```js\nlet x = 1'} />)
    expect(container.querySelector('pre')).not.toBeNull()
  })

  it('normalizes leaked tool dumps', () => {
    expect(normalizeMarkdown('- **Count:** 1\n- **Model:** x\nHola')).toBe('Hola')
  })
})

describe('CopilotChat markdown', () => {
  it('renders AI replies as markdown but keeps the user text literal', async () => {
    const c: ChatClient = { send: vi.fn().mockResolvedValue({ sessionId: 'S', reply: 'Es **importante**\n\n1. uno\n2. dos' }) }
    const { container } = render(
      <CopilotProvider client={c} suggestions={['**hola**']}>
        <CopilotChat />
      </CopilotProvider>,
    )
    fireEvent.click(screen.getByText('**hola**'))
    await waitFor(() => expect(container.querySelector('ol > li')).not.toBeNull())
    expect(container.querySelector('strong')?.textContent).toBe('importante')
  })

  it('shows the demo badge only when the backend flags the reply as demo', async () => {
    const c: ChatClient = { send: vi.fn().mockResolvedValue({ sessionId: 'S', reply: 'ok', demo: true }) }
    render(
      <CopilotProvider client={c} suggestions={['Hola']}>
        <CopilotChat />
      </CopilotProvider>,
    )
    expect(screen.queryByText('Datos demostrativos')).toBeNull()
    fireEvent.click(screen.getByText('Hola'))
    await screen.findByText('Datos demostrativos')
  })
})
