/**
 * Standalone dev harness (`pnpm dev`): mounts the page inside a simulated host
 * (AddonPageHost + a mock API), so you can iterate without booting OPS.
 * Not exposed, not shipped to the host.
 */
import React from 'react'
import ReactDOM from 'react-dom/client'
import {
  AddonPageHost,
  createPageChromeStore,
  usePageChromeState,
} from '@asteby/metacore-runtime-react'
import { createMockHostApi } from '@asteby/metacore-runtime-react/testing'
import Board from './pages/board'
import './index.css'

const basePath = '/a/{{ADDON_KEY}}/board'
const chrome = createPageChromeStore()
const api = createMockHostApi({
  get: {
    '/gw/{{ADDON_KEY}}/summary': {
      cards: [
        { key: 'open', label: 'Abiertos', value: 12 },
        { key: 'due_today', label: 'Vencen hoy', value: 3 },
      ],
    },
  },
})
const host = { org: { id: 'dev', name: 'Org de desarrollo', currency: 'MXN' }, locale: 'es-MX' }

function Header() {
  const { title, subtitle, actions, breadcrumbs } = usePageChromeState(chrome)
  return (
    <header className="flex items-center justify-between border-b px-6 py-3">
      <div>
        <nav className="text-xs text-muted-foreground">{breadcrumbs.map((b) => b.title).join(' / ')}</nav>
        <h1 className="text-lg font-semibold">{title}</h1>
        {subtitle ? <p className="text-xs text-muted-foreground">{subtitle}</p> : null}
      </div>
      <div className="flex gap-2">
        {actions?.map((a) => (
          <button key={a.key} className="rounded-md border px-3 py-1.5 text-xs" onClick={a.onSelect}>
            {a.label}
          </button>
        ))}
      </div>
    </header>
  )
}

function Harness() {
  const [location, setLocation] = React.useState({ pathname: basePath, search: '' })
  const navigate = (to: string) => {
    const [pathname, search = ''] = to.split('?')
    setLocation({ pathname: pathname ?? basePath, search: search ? `?${search}` : '' })
  }
  return (
    <div className="min-h-screen bg-background text-foreground">
      <Header />
      <AddonPageHost host={host} api={api} basePath={basePath} location={location} navigate={navigate} chrome={chrome}>
        <Board host={host} basePath={basePath} params={{}} page={{ key: 'board', path: 'board', title: '{{ADDON_NAME}}' }} />
      </AddonPageHost>
    </div>
  )
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <Harness />
  </React.StrictMode>,
)
