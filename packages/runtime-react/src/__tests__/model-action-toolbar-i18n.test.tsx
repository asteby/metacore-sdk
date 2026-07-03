// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from 'vitest'
import { act, cleanup, render, screen, waitFor } from '@testing-library/react'
import i18next from 'i18next'
import { I18nextProvider } from 'react-i18next'

import { ModelActionToolbar } from '../model-action-toolbar'
import { ApiProvider } from '../api-context'
import type { ActionDefinition } from '../types'

afterEach(cleanup)

// Stub api client — the toolbar only calls it when it must fetch metadata, and
// we pass `actions` directly so it never does. Present only to satisfy useApi().
const api = {
    get: async () => ({ data: { data: {} } }),
    post: async () => ({ data: { success: true } }),
} as never

// A fresh i18next configured EXACTLY like the failing prod instance: keySeparator
// default and ignoreJSONStructure:false, so a flat literal key would NOT resolve
// — the fix must build/read a nested tree AND translate at render time.
function makeI18n() {
    const inst = i18next.createInstance()
    inst.init({
        lng: 'es',
        fallbackLng: 'es',
        ignoreJSONStructure: false,
        react: { bindI18nStore: 'added removed', useSuspense: false },
        resources: { es: { translation: {} } },
    })
    return inst
}

// The addon's create action exactly as the metadata endpoint ships it: the
// label is an i18n KEY, not display text (backend does not localize action
// labels — see the raw-key bug).
const createAction: ActionDefinition = {
    key: 'create_issue',
    label: 'integration_github.action.create_issue.label',
    placement: 'create',
} as ActionDefinition

function renderToolbar(inst: ReturnType<typeof makeI18n>) {
    return render(
        <I18nextProvider i18n={inst}>
            <ApiProvider client={api}>
                <ModelActionToolbar model="github_issues" actions={[createAction]} />
            </ApiProvider>
        </I18nextProvider>,
    )
}

describe('ModelActionToolbar — translates addon action labels at render', () => {
    it('shows the translation once the addon bundle lands (no raw key)', async () => {
        const inst = makeI18n()
        renderToolbar(inst)

        // Before the addon bundle loads the toolbar has only the key; with the
        // fix it renders the key text (t() falls back to defaultValue = the key).
        // The point of the test is the TRANSITION below.
        expect(
            screen.getByText('integration_github.action.create_issue.label'),
        ).toBeTruthy()

        // The addon locale bundle arrives asynchronously (OpsAddonLocaleLoader
        // fetch → addResourceBundle). It is NESTED, as the host loader now merges
        // it. This fires the i18next store 'added' event.
        act(() => {
            inst.addResourceBundle(
                'es',
                'translation',
                { integration_github: { action: { create_issue: { label: 'Crear issue' } } } },
                true,
                true,
            )
        })

        // The toolbar must re-render and show the translated label — the exact
        // behaviour that was missing (a bare {a.label} never re-derived).
        await waitFor(() => expect(screen.getByText('Crear issue')).toBeTruthy())
        expect(
            screen.queryByText('integration_github.action.create_issue.label'),
        ).toBeNull()
    })

    it('leaves an already-localized label untouched (defaultValue passthrough)', () => {
        const inst = makeI18n()
        render(
            <I18nextProvider i18n={inst}>
                <ApiProvider client={api}>
                    <ModelActionToolbar
                        model="github_issues"
                        actions={[{ key: 'x', label: 'Crear issue', placement: 'create' } as ActionDefinition]}
                    />
                </ApiProvider>
            </I18nextProvider>,
        )
        expect(screen.getByText('Crear issue')).toBeTruthy()
    })
})
