// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { BUILTIN_ICONS, FALLBACK_ICON, GenUIProvider, resolveGenUIIcon, type GenUIIconResolver } from './index'
import { PageBlocks, PageProvider, type PageBlockDef } from './page'

afterEach(cleanup)

const MapPin = ({ className }: { className?: string }) => <svg data-testid='host-icon' data-icon='MapPin' className={className} />

const tabs = (icons: Array<string | undefined>): PageBlockDef => ({
  type: 'tabs',
  variant: 'segmented',
  tabs: icons.map((icon, i) => ({ key: `k${i}`, label: `Vista ${i}`, icon, blocks: [{ type: 'text', text: `c${i}` }] })),
})

const mount = (icons: Array<string | undefined>, resolveIcon?: GenUIIconResolver, dark = false) =>
  render(
    <div className={dark ? 'dark' : undefined} data-testid='root'>
      <GenUIProvider resolveIcon={resolveIcon}>
        <PageProvider can={() => true}>
          <PageBlocks blocks={[tabs(icons)]} />
        </PageProvider>
      </GenUIProvider>
    </div>,
  )

const svgIn = (name: string) => screen.getByRole('tab', { name }).querySelector('svg')

describe('host icon resolver', () => {
  it('paints the host component for a name the host resolves', () => {
    mount(['MapPin'], (n) => (n === 'MapPin' ? MapPin : null))
    expect(svgIn('Vista 0')?.getAttribute('data-icon')).toBe('MapPin')
    expect(svgIn('Vista 0')?.getAttribute('class')).toContain('size-4')
  })

  it('without a resolver keeps the built-in set (backwards compatible)', () => {
    mount(['map'])
    expect(svgIn('Vista 0')).toBeTruthy()
    expect(resolveGenUIIcon('map')).toBe(BUILTIN_ICONS.map)
  })

  it('lets the host override a built-in name', () => {
    expect(resolveGenUIIcon('map', () => MapPin)).toBe(MapPin)
  })

  it('falls back to the built-in set when the host returns null', () => {
    expect(resolveGenUIIcon('table', () => null)).toBe(BUILTIN_ICONS.table)
  })

  it('renders a neutral icon for an unknown name and never breaks', () => {
    mount(['NoSuchIcon'], () => null)
    expect(svgIn('Vista 0')).toBeTruthy()
    expect(resolveGenUIIcon('NoSuchIcon')).toBe(FALLBACK_ICON)
    expect(screen.getByText('c0')).toBeTruthy()
  })

  it('survives a throwing resolver', () => {
    mount(['Boom'], () => {
      throw new Error('x')
    })
    expect(svgIn('Vista 0')).toBeTruthy()
  })

  it('paints nothing without a name or with an invalid one', () => {
    mount([undefined, 'not a name!', '__proto__'], () => MapPin)
    expect(svgIn('Vista 0')).toBeNull()
    expect(svgIn('Vista 1')).toBeNull()
    expect(svgIn('Vista 2')).toBeNull()
    expect(resolveGenUIIcon('constructor')).toBe(FALLBACK_ICON)
  })

  it('inherits theme through currentColor classes: only className is passed, in light and dark', () => {
    const seen: Array<string | undefined> = []
    const Probe = ({ className }: { className?: string }) => {
      seen.push(className)
      return <svg className={className} />
    }
    mount(['Probe'], () => Probe)
    cleanup()
    mount(['Probe'], () => Probe, true)
    expect(seen.length).toBeGreaterThanOrEqual(2)
    expect(new Set(seen)).toEqual(new Set(['size-4']))
    expect(screen.getByTestId('root').className).toBe('dark')
  })

  it('inner providers win over outer ones', () => {
    const Other = ({ className }: { className?: string }) => <svg data-icon='Other' className={className} />
    render(
      <GenUIProvider resolveIcon={() => MapPin}>
        <GenUIProvider resolveIcon={() => Other}>
          <PageProvider can={() => true}>
            <PageBlocks blocks={[tabs(['X'])]} />
          </PageProvider>
        </GenUIProvider>
      </GenUIProvider>,
    )
    expect(svgIn('Vista 0')?.getAttribute('data-icon')).toBe('Other')
  })
})
