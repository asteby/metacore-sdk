// @vitest-environment happy-dom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { OrgAISettings, type OrgAISettingsProps } from './org-ai-settings'
import type { OrgAIApi, OrgAIConfig } from './types'

afterEach(cleanup)

const cfg = (over: Partial<OrgAIConfig> = {}): OrgAIConfig => ({
  mode: 'anthropic',
  proxy_base_url: '',
  proxy_model: '',
  has_api_key: true,
  ...over,
})

function setup(api: Partial<OrgAIApi>, props: Partial<OrgAISettingsProps> = {}) {
  const full: OrgAIApi = {
    getConfig: vi.fn(async () => cfg()),
    updateConfig: vi.fn(async (b) => cfg({ mode: b.mode })),
    ...api,
  }
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <OrgAISettings api={full} {...props} />
    </QueryClientProvider>,
  )
  return full
}

describe('OrgAISettings', () => {
  it('shows loading, then provider radios with defaults and no secret value', async () => {
    setup({})
    expect(screen.getByRole('status').getAttribute('aria-busy')).toBe('true')
    const group = await screen.findByRole('radiogroup')
    expect(group.querySelectorAll('[role="radio"]').length).toBe(4)
    expect(screen.getByRole('radio', { name: /Anthropic/ }).getAttribute('aria-checked')).toBe('true')
    expect((screen.getByLabelText('API key') as HTMLInputElement).value).toBe('')
    expect((screen.getByLabelText('Model') as HTMLInputElement).value).toBe('claude-sonnet-4-5')
    expect(document.body.textContent).not.toMatch(/spark|hub|billing/i)
  })

  it('error state offers retry', async () => {
    const getConfig = vi.fn().mockRejectedValueOnce(new Error('x')).mockResolvedValue(cfg())
    setup({ getConfig })
    await screen.findByRole('alert')
    fireEvent.click(screen.getByText('Retry'))
    await screen.findByRole('radiogroup')
  })

  it('empty providers renders the empty state', async () => {
    setup({}, { providers: [] })
    await waitFor(() => expect(screen.getByRole('status').textContent).toContain('No AI providers'))
  })

  it('switching provider fills presets and saves only typed key', async () => {
    const notify = { success: vi.fn(), error: vi.fn() }
    const api = setup({}, { notify })
    await screen.findByRole('radiogroup')
    fireEvent.click(screen.getByRole('radio', { name: /^OpenAI GPT/ }))
    expect((screen.getByLabelText('Base URL') as HTMLInputElement).value).toBe('https://api.openai.com/v1')
    fireEvent.change(screen.getByLabelText('API key'), { target: { value: 'sk-test' } })
    fireEvent.click(screen.getByText('Save'))
    await waitFor(() => expect(notify.success).toHaveBeenCalledWith('AI settings saved'))
    expect(api.updateConfig).toHaveBeenCalledWith({
      mode: 'openai',
      base_url: 'https://api.openai.com/v1',
      model: 'gpt-4o-mini',
      api_key: 'sk-test',
    })
    expect(screen.getByRole('status').textContent).toBe('AI settings saved')
  })

  it('save failure surfaces server message in an alert', async () => {
    setup({ updateConfig: vi.fn(async () => Promise.reject({ response: { data: { message: 'bad key' } } })) })
    await screen.findByRole('radiogroup')
    fireEvent.click(screen.getByText('Save'))
    expect((await screen.findByRole('alert')).textContent).toBe('bad key')
  })

  it('Claude connect is hidden without props and shown behind claudeConnect + seat', async () => {
    const claude = { getBinary: vi.fn(), install: vi.fn(), start: vi.fn(), submitCode: vi.fn(), submitToken: vi.fn(), cancel: vi.fn() }
    setup({ getConfig: vi.fn(async () => cfg({ seats: { claude_code: { ready: false } } })) })
    await screen.findByRole('radiogroup')
    expect(screen.queryByText('Connect')).toBeNull()
    cleanup()
    setup({ getConfig: vi.fn(async () => cfg({ seats: { claude_code: { ready: false } } })) }, { claudeConnect: { api: claude } })
    expect(await screen.findByText('Connect')).toBeTruthy()
  })

  it('seat-bound provider is disabled until its seat is ready', async () => {
    setup(
      { getConfig: vi.fn(async () => cfg({ seats: { local: { ready: false } } })) },
      { providers: [{ id: 'localagent', title: 'Local agent', needsEndpoint: false, needsKey: false, defaultURL: '', defaultModel: '', seatId: 'local' }] },
    )
    const radio = (await screen.findByRole('radio', { name: /Local agent/ })) as HTMLButtonElement
    expect(radio.disabled).toBe(true)
    expect((screen.getByText('Save') as HTMLButtonElement).disabled).toBe(true)
  })

  it('user-source toggle only appears when the api supports it', async () => {
    const updateUserSource = vi.fn(async () => 'local' as const)
    setup({ getConfig: vi.fn(async () => cfg({ user_ai_source: 'inherit' })), updateUserSource })
    fireEvent.click(await screen.findByLabelText(/Use my local AI/))
    await waitFor(() => expect(updateUserSource).toHaveBeenCalledWith('local'))
  })
})
