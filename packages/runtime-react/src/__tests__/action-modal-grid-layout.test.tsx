// @vitest-environment happy-dom
//
// GenericActionModal layout contract (the placement:create "Crear Issue" modal
// and every declarative action form): fields lay out in a shared responsive
// grid instead of a single cramped row with a horizontal scrollbar.
//   - Scalar fields (input, select) each sit in a `min-w-0` cell so a long
//     value can't blow the two columns past the dialog and spawn an x-scroll.
//   - textareas span both columns (`sm:col-span-2`).
//   - The grid itself declares one column on phones, two from `sm:`.
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'

vi.mock('react-i18next', () => ({
    useTranslation: () => ({ t: (k: string) => k }),
}))

import { ActionModalDispatcher } from '../action-modal-dispatcher'
import { ApiProvider, type ApiClient } from '../api-context'
import type { ActionMetadata } from '@asteby/metacore-sdk'

afterEach(cleanup)

const noopApi: ApiClient = {
    get: vi.fn().mockResolvedValue({ data: {} }),
    post: vi.fn().mockResolvedValue({ data: { success: true } }),
} as unknown as ApiClient

const action: ActionMetadata = {
    key: 'create_issue',
    label: 'Crear Issue',
    placement: 'create',
    fields: [
        { key: 'repo', label: 'Repositorio', type: 'select', required: true, options: [{ value: 'a', label: 'a' }] },
        { key: 'title', label: 'Título', type: 'text', required: true },
        { key: 'body', label: 'Descripción', type: 'textarea' },
    ],
} as unknown as ActionMetadata

function renderModal() {
    return render(
        <ApiProvider client={noopApi}>
            <ActionModalDispatcher
                open
                onOpenChange={() => {}}
                action={action}
                model="issue"
                record={{} as any}
                endpoint="/data/issue"
                onSuccess={() => {}}
            />
        </ApiProvider>,
    )
}

describe('GenericActionModal grid layout', () => {
    it('renders a responsive two-column grid, not a single cramped row', () => {
        renderModal()
        const grid = document.body.querySelector('.sm\\:grid-cols-2')
        expect(grid).not.toBeNull()
        expect(grid!.className).toContain('grid')
        expect(grid!.className).toContain('grid-cols-1')
    })

    it('gives every field cell min-w-0 so a long value cannot spawn a horizontal scrollbar', () => {
        renderModal()
        const repoLabel = screen.getByText('Repositorio')
        // Label → FieldLabel → cell (FieldCell). The cell is the label's parent.
        const cell = repoLabel.closest('div')!
        expect(cell.className).toContain('min-w-0')
    })

    it('spans textareas across both columns and keeps scalars single-column', () => {
        renderModal()
        const bodyCell = screen.getByText('Descripción').closest('div')!
        expect(bodyCell.className).toContain('sm:col-span-2')

        const titleCell = screen.getByText('Título').closest('div')!
        expect(titleCell.className).not.toContain('sm:col-span-2')
    })

    it('marks required fields with an asterisk', () => {
        renderModal()
        const label = screen.getByText('Repositorio').closest('label')!
        expect(label.textContent).toContain('*')
    })
})
