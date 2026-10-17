import type { ComponentType } from 'react'
import type { MockupProduct, MockupVariant } from '@asteby/storefront/mockup'
import type { MockupFrameProps } from './frame.js'
import type { MockupLabels } from './labels.js'

/** Props every mockup component receives. Spread the rest on `<MockupFrame>`. */
export type MockupComponentProps<D = unknown> = Omit<MockupFrameProps, 'label' | 'kind' | 'children'> & {
  data: D
  /** Accessible name already built (prefixed with `labels.illustration`). */
  label: string
  labels: MockupLabels
}

export type MockupComponent<D = unknown> = ComponentType<MockupComponentProps<D>>

/** A registered mockup: how to draw it and, optionally, how to read its data from a product. */
export type MockupRenderer<D = any> = {
  component: MockupComponent<D>
  /** Product → data. Default: the built-in extractor for the kind (generic data for custom kinds). */
  fromProduct?: (product: MockupProduct, variant?: MockupVariant | null) => D
  /** Data → accessible name. Default: `describeMockup`. */
  describe?: (data: D, labels: MockupLabels) => string
}
