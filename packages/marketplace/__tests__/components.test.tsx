/**
 * Smoke tests for the marketplace components. We use `react-dom/server`
 * + `renderToStaticMarkup` instead of `@testing-library/react` to keep
 * the suite in node-only mode (matches `@asteby/metacore-auth`'s
 * approach). We assert structural markers (data-testid, key strings)
 * rather than visual styling.
 */
import { describe, expect, it } from 'vitest'
import { createElement, type PropsWithChildren } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MarketplaceProvider } from '../src/providers/MarketplaceProvider'
import { AddonCard } from '../src/components/AddonCard'
import { PermissionsDiff } from '../src/components/PermissionsDiff'
import { InstallConfirmModal } from '../src/components/InstallConfirmModal'
import { AddonDetailPanel } from '../src/components/AddonDetailPanel'
import { normalizeManifest } from '../src/client/manifest'
import type {
  AddonDetail,
  AddonSummary,
  ManifestV3,
} from '../src/client/types'

const stubHub = {
  listCatalog: () => Promise.resolve({ items: [], total: 0, page: 1, page_size: 20 }),
  getAddon: () =>
    Promise.resolve({
      key: 'x',
      name: 'X',
      latest_version: '1.0.0',
      versions: [],
      screenshots: [],
    } as unknown as AddonDetail),
  initiateInstall: () =>
    Promise.resolve({
      token: 'tok',
      expires_at: '',
      addon_key: 'x',
      version: '1.0.0',
    }),
} as never

const stubOps = {
  listInstalled: () => Promise.resolve([]),
  getInstalled: () =>
    Promise.resolve({
      addon_key: 'x',
      version: '1.0.0',
      status: 'installed',
      installed_at: '',
      name: 'X',
      granted_capabilities: [],
    }),
  claimInstall: () =>
    Promise.resolve({
      addon_key: 'x',
      version: '1.0.0',
      status: 'installed',
      installed_at: '',
      name: 'X',
      granted_capabilities: [],
    }),
  upgrade: () =>
    Promise.resolve({
      addon_key: 'x',
      version: '2.0.0',
      status: 'installed',
      installed_at: '',
      name: 'X',
      granted_capabilities: [],
    }),
  uninstall: () => Promise.resolve(),
} as never

function Wrap({ children }: PropsWithChildren) {
  const qc = new QueryClient()
  return createElement(
    QueryClientProvider,
    { client: qc },
    createElement(
      MarketplaceProvider,
      { hub: stubHub, ops: stubOps, organizationId: 'org_1' },
      children,
    ),
  )
}

const summary: AddonSummary = {
  key: 'fiscal_mx',
  name: 'Fiscal MX',
  latest_version: '1.2.3',
  description: 'CFDI stamping',
  category: 'finance',
  tags: ['mx', 'fiscal'],
}

const v3: ManifestV3 = {
  apiVersion: '3',
  key: 'fiscal_mx',
  name: 'Fiscal MX',
  version: '1.2.3',
  capabilities: [{ kind: 'http:fetch', target: 'api.factura.com' }],
  permissions: [
    { kind: 'http:fetch', target: 'api.factura.com', reason: 'Stamp CFDI' },
  ],
  consents: [{ key: 'telemetry', label: 'Send stats', default: false }],
}

describe('AddonCard', () => {
  it('renders the addon name, version, and tags', () => {
    const html = renderToStaticMarkup(createElement(AddonCard, { addon: summary }))
    expect(html).toContain('Fiscal MX')
    expect(html).toContain('v1.2.3')
    expect(html).toContain('mx')
    expect(html).toContain('fiscal')
    expect(html).toContain(`data-testid="addon-card-${summary.key}"`)
  })

  it('renders a badge when supplied', () => {
    const html = renderToStaticMarkup(
      createElement(AddonCard, { addon: summary, badge: 'Installed' }),
    )
    expect(html).toContain('Installed')
  })

  it('disables the button when `disabled` is true', () => {
    const html = renderToStaticMarkup(
      createElement(AddonCard, { addon: summary, disabled: true }),
    )
    expect(html).toContain('disabled')
  })
})

describe('PermissionsDiff', () => {
  it('renders an empty-state when there are no rows after filtering', () => {
    const m = normalizeManifest({
      apiVersion: '2',
      key: 'x',
      name: 'X',
      version: '1',
      capabilities: [],
    })
    const html = renderToStaticMarkup(
      createElement(PermissionsDiff, { current: null, next: m }),
    )
    expect(html).toContain('No permission changes.')
  })

  it('renders added rows when current is null', () => {
    const m = normalizeManifest(v3)
    const html = renderToStaticMarkup(
      createElement(PermissionsDiff, { current: null, next: m }),
    )
    expect(html).toContain('data-change="added"')
    expect(html).toContain('http:fetch')
    expect(html).toContain('api.factura.com')
  })
})

describe('InstallConfirmModal', () => {
  it('renders the permissions title + cancel/confirm buttons when open', () => {
    const m = normalizeManifest(v3)
    const html = renderToStaticMarkup(
      createElement(Wrap, {
        children: createElement(InstallConfirmModal, {
          open: true,
          next: m,
          current: null,
          onClose: () => {},
          onConfirm: () => {},
        }),
      }),
    )
    expect(html).toContain('data-testid="install-confirm-modal"')
    expect(html).toContain('Permissions requested')
    expect(html).toContain('Confirm')
    expect(html).toContain('Cancel')
    // v3 consent toggle should be rendered
    expect(html).toContain('Send stats')
  })

  it('renders nothing when `open` is false', () => {
    const m = normalizeManifest(v3)
    const html = renderToStaticMarkup(
      createElement(Wrap, {
        children: createElement(InstallConfirmModal, {
          open: false,
          next: m,
          current: null,
          onClose: () => {},
          onConfirm: () => {},
        }),
      }),
    )
    expect(html).not.toContain('install-confirm-modal')
  })
})

describe('AddonDetailPanel', () => {
  const detail: AddonDetail = {
    ...summary,
    readme: '# Hello',
    screenshots: [{ url: 'https://x/y.png', alt: 'shot 1', order: 0 }],
    versions: [
      {
        version: '1.2.3',
        apiVersion: '3',
        published_at: '2026-04-01T00:00:00Z',
        manifest: v3,
      },
    ],
  }

  it('renders the header, screenshots, and README', () => {
    const html = renderToStaticMarkup(
      createElement(Wrap, {
        children: createElement(AddonDetailPanel, { detail }),
      }),
    )
    expect(html).toContain('data-testid="addon-detail-panel"')
    expect(html).toContain('Fiscal MX')
    expect(html).toContain('CFDI stamping')
    expect(html).toContain('https://x/y.png')
    expect(html).toContain('# Hello')
  })

  it('switches the CTA label when an installed version is supplied', () => {
    const html = renderToStaticMarkup(
      createElement(Wrap, {
        children: createElement(AddonDetailPanel, {
          detail,
          installedVersion: '1.0.0',
          onInstallClick: () => {},
        }),
      }),
    )
    // installed at older version → CTA reflects upgrade messaging
    expect(html).toContain('Upgrade available: 1.2.3')
  })
})
