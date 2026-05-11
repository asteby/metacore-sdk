import { describe, expect, it } from 'vitest'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import {
    AddonLayoutProvider,
    useDeclareAddonLayout,
} from '@asteby/metacore-runtime-react'
import { AddonRoute } from '../AddonRoute'

// We run tests in `node` (no jsdom) and rely on `react-dom/server` to render
// to static HTML. That's enough to assert what `AddonRoute` decides at
// render time: shell-wrapping vs. immersive-wrapping. We avoid jsdom on
// purpose so the SDK keeps its test boot fast and so contributors don't
// need to install a DOM emulator just to lint a wrapper component.

const Marker = (props: { id: string }) =>
    createElement('span', { 'data-marker': props.id })

const Shell = (children: React.ReactNode) =>
    createElement('div', { 'data-shell': 'true' }, children)

describe('AddonRoute', () => {
    it('renders the shell wrapper when layout is "shell" (default)', () => {
        const html = renderToStaticMarkup(
            createElement(
                AddonLayoutProvider,
                null,
                createElement(
                    AddonRoute,
                    { shell: Shell },
                    createElement(Marker, { id: 'inside' }),
                ),
            ),
        )
        expect(html).toContain('data-shell="true"')
        expect(html).toContain('data-marker="inside"')
        // No immersive sentinel.
        expect(html).not.toContain('data-metacore-addon-layout="immersive"')
    })

    it('strips the shell and pins viewport when layout is "immersive" (prop)', () => {
        const html = renderToStaticMarkup(
            createElement(
                AddonLayoutProvider,
                null,
                createElement(
                    AddonRoute,
                    { shell: Shell, layout: 'immersive' },
                    createElement(Marker, { id: 'fullscreen' }),
                ),
            ),
        )
        expect(html).toContain('data-metacore-addon-layout="immersive"')
        expect(html).toContain('fixed inset-0')
        expect(html).toContain('data-marker="fullscreen"')
        // The shell wrapper is NOT rendered when immersive.
        expect(html).not.toContain('data-shell="true"')
    })

    it('honours the initial layout from <AddonLayoutProvider initial="immersive">', () => {
        // Simulates the kiosk / POS host that boots immersive from the
        // first paint. No prop override, no inner declaration — purely
        // driven by the provider's `initial` value.
        const html = renderToStaticMarkup(
            createElement(
                AddonLayoutProvider,
                { initial: 'immersive' },
                createElement(
                    AddonRoute,
                    { shell: Shell },
                    createElement(Marker, { id: 'kiosk' }),
                ),
            ),
        )
        expect(html).toContain('data-metacore-addon-layout="immersive"')
        expect(html).not.toContain('data-shell="true"')
        expect(html).toContain('data-marker="kiosk"')
    })

    it('renders children verbatim when no shell renderer is supplied (shell mode)', () => {
        const html = renderToStaticMarkup(
            createElement(
                AddonLayoutProvider,
                null,
                createElement(
                    AddonRoute,
                    null,
                    createElement(Marker, { id: 'bare' }),
                ),
            ),
        )
        expect(html).toContain('data-marker="bare"')
        expect(html).not.toContain('data-shell="true"')
        expect(html).not.toContain('data-metacore-addon-layout="immersive"')
    })

    it('appends caller-provided immersiveClassName to the immersive wrapper', () => {
        const html = renderToStaticMarkup(
            createElement(
                AddonLayoutProvider,
                null,
                createElement(
                    AddonRoute,
                    {
                        shell: Shell,
                        layout: 'immersive',
                        immersiveClassName: 'pos-theme-dark',
                    },
                    createElement(Marker, { id: 'themed' }),
                ),
            ),
        )
        expect(html).toContain('pos-theme-dark')
        expect(html).toContain('fixed inset-0')
    })

    it('renders unchanged DOM when `version` is undefined (no extra wrapper)', () => {
        const html = renderToStaticMarkup(
            createElement(
                AddonLayoutProvider,
                null,
                createElement(
                    AddonRoute,
                    null,
                    createElement(Marker, { id: 'no-version' }),
                ),
            ),
        )
        // Plain children, no Fragment-introduced wrapper or version markers.
        expect(html).toBe('<span data-marker="no-version"></span>')
    })

    it('still mounts children when `version` is provided (key triggers remount on change)', () => {
        // We can't observe React's unmount/remount cycle via static markup,
        // but we can prove the version prop is accepted and the output is
        // identical to the unversioned render — i.e. the Fragment wrapper
        // is transparent in the output (keys live on the virtual DOM only).
        const html = renderToStaticMarkup(
            createElement(
                AddonLayoutProvider,
                null,
                createElement(
                    AddonRoute,
                    { version: 'abcdef12' },
                    createElement(Marker, { id: 'versioned' }),
                ),
            ),
        )
        expect(html).toBe('<span data-marker="versioned"></span>')
    })

    it('still works when an addon component declares immersive on mount', () => {
        // Inner component models an addon that flips to immersive via the
        // declarative hook. Under SSR, the cleanup never runs, so the
        // effect's "switch to immersive" lands on the rendered output as
        // soon as the provider re-reads on the next render. We assert via
        // the prop-driven path above (the SSR pass below proves the
        // wrapper is callable end-to-end without throwing).
        const Inner = () => {
            useDeclareAddonLayout('immersive')
            return createElement(Marker, { id: 'declarative' })
        }
        expect(() =>
            renderToStaticMarkup(
                createElement(
                    AddonLayoutProvider,
                    null,
                    createElement(
                        AddonRoute,
                        { shell: Shell },
                        createElement(Inner),
                    ),
                ),
            ),
        ).not.toThrow()
    })
})
