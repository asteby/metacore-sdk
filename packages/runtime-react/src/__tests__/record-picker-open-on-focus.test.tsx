// @vitest-environment happy-dom
//
// RecordPicker trigger="input" + openOnFocus: la lista se abre al enfocar el cuadro
// (sin teclear ni hacer clic aparte); sin la opcion queda cerrada como antes.
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'

vi.mock('react-i18next', () => {
    const t = (k: string, o?: Record<string, any>) => o?.defaultValue ?? k
    const value = { t, i18n: { language: 'es' } }
    return { useTranslation: () => value }
})

import { RecordPicker } from '../record-picker'

afterEach(cleanup)
const rows = [
    { id: 'a', name: 'Alfa' },
    { id: 'b', name: 'Beta' },
]
function Picker({ openOnFocus }: { openOnFocus?: boolean }) {
    return (
        <RecordPicker<(typeof rows)[number]>
            trigger="input"
            items={rows}
            minChars={0}
            getKey={(r) => r.id}
            getLabel={(r) => r.name}
            value={null}
            selected={null}
            onSelect={() => {}}
            openOnFocus={openOnFocus}
            entityLabel="Elemento"
        />
    )
}

describe('RecordPicker openOnFocus', () => {
    it('abre la lista al enfocar', async () => {
        render(<Picker openOnFocus />)
        fireEvent.focus(screen.getByRole('combobox'))
        expect(await screen.findByText('Alfa')).toBeTruthy()
    })
    it('sin openOnFocus no abre al enfocar', () => {
        render(<Picker />)
        fireEvent.focus(screen.getByRole('combobox'))
        expect(screen.queryByText('Alfa')).toBeNull()
    })
})
