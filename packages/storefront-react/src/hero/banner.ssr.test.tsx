import { describe, expect, it } from 'vitest'
import { renderToString } from 'react-dom/server'
import { createSectionRegistry, defineSection } from '../sections.js'
import { sectionTypesToOps, validateOpsSectionTypes } from '../section-types.js'
import { Banner, BANNER_FOCUS, BANNER_SCRIMS, bannerCarouselSchema, bannerFields, bannerFocusField, bannerImageStyle, bannerLayoutFields, bannerObjectPosition } from './index.js'

const base = { image: '/a.webp', alt: 'Proteína', title: 'Rendimiento', text: 'Ciencia aplicada', cta_label: 'Ver', url: '/us/collections/proteinas' }

describe('Banner: the formula (focus, text position, veil)', () => {
  it('without the new fields it renders like before: no layout attributes and no inline style', () => {
    const html = renderToString(<Banner {...base} />)
    expect(html).toContain('data-sf-banner=""')
    for (const a of ['data-text-position', 'data-text-vertical', 'data-text-size', 'data-scrim', 'style=']) expect(html).not.toContain(a)
  })

  it('text position, vertical position and veil go to the wrapper as data attributes (the CSS does the rest)', () => {
    const html = renderToString(<Banner {...base} text_position="right" text_vertical="bottom" text_size="small" scrim="strong" />)
    expect(html).toContain('data-text-size="small"')
    expect(html).toContain('data-text-position="right"')
    expect(html).toContain('data-text-vertical="bottom"')
    expect(html).toContain('data-scrim="strong"')
  })

  it('unknown values (an old or hand-edited page) are ignored, never rendered', () => {
    const html = renderToString(<Banner {...base} text_position="diagonal" text_vertical="somewhere" text_size="huge" scrim="blinding" focus="nowhere" />)
    for (const a of ['data-text-position', 'data-text-vertical', 'data-text-size', 'data-scrim', 'object-position']) expect(html).not.toContain(a)
  })

  it('the focal point is the picture `object-position`; the default centre adds nothing', () => {
    expect(renderToString(<Banner {...base} focus="top-right" />)).toContain('object-position:100% 0%')
    expect(renderToString(<Banner {...base} focus="center" />)).not.toContain('object-position')
    expect(bannerObjectPosition('bottom')).toBe('50% 100%')
    expect(bannerObjectPosition('')).toBeUndefined()
    expect(bannerImageStyle('left')).toEqual({ objectPosition: '0% 50%' })
  })

  it('mobile source, fixed size and LCP priority', () => {
    const first = renderToString(<Banner {...base} image_mobile="/a-m.webp" priority headingLevel="h1" />)
    expect(first).toContain('<source media="(max-width: 700px)" srcSet="/a-m.webp"')
    expect(first).toContain('fetchPriority="high"')
    expect(first).toContain('width="1800"')
    expect(first).toContain('<h1')
    const later = renderToString(<Banner {...base} />)
    expect(later).toContain('loading="lazy"')
    expect(later).toContain('<h2')
  })

  it('a banner without a message is wholly a link (and none without url)', () => {
    expect(renderToString(<Banner image="/b.webp" alt="Sync" url="/x" />)).toMatch(/<a href="\/x"><picture>/)
    expect(renderToString(<Banner image="/b.webp" alt="Sync" />)).not.toContain('<a ')
    expect(renderToString(<Banner image="/b.webp" url="/x" resolveHref={(u) => `/us${u}`} />)).toContain('href="/us/x"')
  })
})

describe('Banner fields: shared by every section', () => {
  it('the option lists of the schema are exactly the ones the component accepts', () => {
    const values = (f: { options: readonly { value: string }[] }) => f.options.map((o) => o.value)
    expect(values(bannerFocusField.focus)).toEqual([...BANNER_FOCUS])
    expect(values(bannerLayoutFields.scrim)).toEqual([...BANNER_SCRIMS])
    expect(bannerFields.image.required).toBe(true)
  })

  it('banner_carousel slides use the same fields', () => {
    expect(bannerCarouselSchema.slides.items).toBe(bannerFields)
  })

  it('a custom section spreads the formula and the closed schema accepts it (the editor of OPS validates against it)', () => {
    const duo = defineSection({
      type: 'banner_pair',
      label: 'Dos banners',
      schema: { items: { kind: 'list', label: 'Banners', default: [], items: bannerFields } },
      component: () => null,
    })
    const registry = createSectionRegistry([duo])
    const { types } = sectionTypesToOps(registry)
    expect(validateOpsSectionTypes(types)).toEqual([])
    const items = types.find((t) => t.type === 'banner_pair')!.schema.props.find((p) => p.key === 'items')!
    expect(JSON.stringify(items)).toContain('text_position')
  })
})
