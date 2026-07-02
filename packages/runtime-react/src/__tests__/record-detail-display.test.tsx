// @vitest-environment happy-dom
//
// Detail-dialog display mapping: the read-only `ViewValue` must render values
// with the SAME "pro" display logic as the table (shared `display-value.tsx`
// primitives), keyed off the stamped display type (`cellStyle ?? type`):
//   - served option → colored badge with the localized label,
//   - `cellStyle:'url'` on a text column → clickable external link (new tab),
//   - `cellStyle:'status'` bare token (kanban stage) → colored, translated pill,
//   - a `labels`/`tags` array → a row of badges (never a raw mini-table / JSON).
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'

// Identity-ish translator with a tiny stage dictionary, matching how the host
// resolves an addon's i18n keys (t(token, { defaultValue })).
vi.mock('react-i18next', () => ({
    useTranslation: () => ({
        t: (k: string, opts?: any) =>
            k === 'backlog' ? 'Pendiente' : opts?.defaultValue ?? k,
        i18n: { language: 'es' },
    }),
}))

import { ViewValue } from '../dialogs/dynamic-record'

afterEach(cleanup)

describe('ViewValue — detail dialog display mapping', () => {
    it('renders a served option as a colored badge with the localized label', () => {
        render(
            <ViewValue
                field={{
                    key: 'product_type',
                    label: 'Tipo',
                    type: 'select',
                    options: [
                        { value: 'storable', label: 'Almacenable', color: '#22c55e' },
                    ],
                }}
                value="storable"
                record={{}}
            />
        )
        const badge = screen.getByText('Almacenable')
        expect(badge).toBeTruthy()
        // Never the raw enum token.
        expect(screen.queryByText('storable')).toBeNull()
    })

    it('renders a cellStyle:url text column as a clickable external link', () => {
        const { container } = render(
            <ViewValue
                field={{ key: 'github_url', label: 'GitHub', type: 'text', cellStyle: 'url' }}
                value="https://github.com/asteby/x"
                record={{}}
            />
        )
        const link = container.querySelector('a') as HTMLAnchorElement
        expect(link).toBeTruthy()
        expect(link.getAttribute('href')).toBe('https://github.com/asteby/x')
        expect(link.getAttribute('target')).toBe('_blank')
    })

    it('renders a bare stage token (cellStyle:status) as a translated colored pill', () => {
        const { container } = render(
            <ViewValue
                field={{ key: 'stage', label: 'Etapa', type: 'text', cellStyle: 'status' }}
                value="backlog"
                record={{}}
            />
        )
        // Localized via the manifest i18n key, not the raw "backlog".
        expect(screen.getByText('Pendiente')).toBeTruthy()
        expect(container.textContent).not.toContain('backlog')
        // Colored: the badge carries an inline background style.
        const styled = container.querySelector('[style*="background"]')
        expect(styled).toBeTruthy()
    })

    it('renders a labels array (cellStyle:tags) as a row of badges', () => {
        render(
            <ViewValue
                field={{ key: 'labels', label: 'Labels', type: 'json', cellStyle: 'tags' }}
                value={['bug', 'urgent']}
                record={{}}
            />
        )
        expect(screen.getByText('bug')).toBeTruthy()
        expect(screen.getByText('urgent')).toBeTruthy()
    })

    it('renders label objects with color as colored badges', () => {
        render(
            <ViewValue
                field={{ key: 'labels', label: 'Labels', type: 'json', cellStyle: 'relation-badge-list' }}
                value={[{ label: 'Bug', color: '#ef4444' }, { name: 'P1' }]}
                record={{}}
            />
        )
        expect(screen.getByText('Bug')).toBeTruthy()
        expect(screen.getByText('P1')).toBeTruthy()
    })

    it('keeps the "—" empty marker for an empty labels array', () => {
        const { container } = render(
            <ViewValue
                field={{ key: 'labels', label: 'Labels', type: 'json', cellStyle: 'tags' }}
                value={[]}
                record={{}}
            />
        )
        expect(container.textContent).toContain('—')
    })
})
