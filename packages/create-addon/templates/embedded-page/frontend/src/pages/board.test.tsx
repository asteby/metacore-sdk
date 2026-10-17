import { describe, expect, it } from 'vitest'
import { fireEvent, screen, waitFor } from '@testing-library/react'
import { createMockHostApi, renderWithHost } from '@asteby/metacore-runtime-react/testing'
import Board from './board'

const props = {
  host: {},
  basePath: '/a/{{ADDON_KEY}}/board',
  params: {},
  page: { key: 'board', path: 'board', title: '{{ADDON_NAME}}' },
}

describe('board page', () => {
  it('shows the summary served by the addon API route and sets the header', async () => {
    const api = createMockHostApi({
      get: { '/gw/{{ADDON_KEY}}/summary': { cards: [{ key: 'open', label: 'Abiertos', value: 3 }] } },
    })
    const { chrome, navigate } = renderWithHost(<Board {...props} />, { api, basePath: props.basePath })
    await waitFor(() => expect(screen.getByText('Abiertos')).toBeTruthy())
    expect(chrome.get().title).toBe('{{ADDON_NAME}}')
    fireEvent.click(screen.getByText('Abiertos'))
    expect(navigate.calls[0]?.[0]).toBe('/a/{{ADDON_KEY}}/board?status=open')
  })

  it('shows the error the host API returned', async () => {
    renderWithHost(<Board {...props} />, { api: createMockHostApi() })
    await waitFor(() => expect(screen.getByRole('alert').textContent).toMatch(/No mock/))
  })
})
