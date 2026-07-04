// @vitest-environment happy-dom
//
// Dependent STATIC enum options in DynamicForm:
//   - a static `select` whose options are gated by a sibling field's value
//     shows only the applicable options;
//   - when the sibling value invalidates the current selection, it resets;
//   - when no option applies, the whole field (label included) is hidden.
//
// The gating (parent) field here is a plain text field rather than a second
// Radix `select`. That is deliberate: under happy-dom a Radix Select rendered
// inside a <form> mounts a hidden native <select> (BubbleSelect) whose value,
// when set programmatically before its <option> list is present, collapses to
// '' and dispatches a spurious change event that resets the parent — a
// test-environment artifact that does not occur in a real browser. Driving the
// sibling through a text field exercises the exact same gating path
// (`applyOptionWhen` reads `values[gate]` regardless of the sibling's widget)
// without that artifact. The pure string-comparison semantics of `when`
// (in/not_in, field fallback) are covered by dependent-enum-options.test.ts.
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, render, screen } from '@testing-library/react'
import { useState } from 'react'

vi.mock('react-i18next', () => ({
    useTranslation: () => ({ t: (k: string) => k }),
}))

import { DynamicForm } from '../dynamic-form'
import type { ActionFieldDef } from '../types'

afterEach(cleanup)

const fields: ActionFieldDef[] = [
    {
        key: 'type',
        label: 'Type',
        type: 'text',
    },
    {
        key: 'provider',
        label: 'Provider',
        type: 'select',
        dependsOn: 'type',
        options: [
            { value: 'qr', label: 'QR', when: { field: 'type', in: ['whatsapp'] } },
            { value: 'meta', label: 'Meta', when: { field: 'type', in: ['whatsapp'] } },
        ],
    },
]

// Harness that lets the test drive `type` and observe the submitted `provider`.
function Harness({ onSubmit }: { onSubmit: (v: Record<string, any>) => void }) {
    const [initial, setInitial] = useState<Record<string, any>>({ type: 'whatsapp', provider: 'qr' })
    return (
        <div>
            <button type="button" onClick={() => setInitial({ type: 'sms', provider: 'qr' })}>
                to-sms
            </button>
            <DynamicForm fields={fields} initialValues={initial} onSubmit={onSubmit} />
        </div>
    )
}

describe('DynamicForm dependent static enum', () => {
    it('hides the gated select and resets its value when no option applies', async () => {
        const onSubmit = vi.fn()
        render(<Harness onSubmit={onSubmit} />)

        // type=whatsapp → provider field visible.
        expect(screen.getByText('Provider')).toBeTruthy()

        // Switch type to sms → no provider option applies → field hidden.
        await act(async () => {
            screen.getByText('to-sms').click()
        })
        expect(screen.queryByText('Provider')).toBeNull()

        // The invalidated selection was reset — submit carries empty provider.
        await act(async () => {
            screen.getByText('Guardar').click()
        })
        expect(onSubmit).toHaveBeenCalled()
        expect(onSubmit.mock.calls[0][0].provider).toBe('')
    })
})
