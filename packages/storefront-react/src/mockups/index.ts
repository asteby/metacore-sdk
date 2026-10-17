/**
 * `@asteby/storefront-react/mockups`: fallback illustrations for products
 * without an image. SVG, SSR-safe, no JS at runtime, no network, themed by
 * CSS variables. The pure half (kind resolution, data extraction) lives in
 * `@asteby/storefront/mockup` and is re-exported here.
 */
export { ProductImage, ProductMockup } from './product-image.js'
export type { ProductImageProduct, ProductImageProps, ProductMockupProps } from './product-image.js'

export {
  BUILTIN_MOCKUPS,
  MockupProvider,
  createMockupRegistry,
  defaultMockupRegistry,
  registerMockup,
  useMockupConfig,
} from './registry.js'
export type {
  MockupConfig,
  MockupProviderProps,
  MockupRegistry,
  MockupRendererInput,
  ResolveMockupKind,
  ResolvedMockupRenderer,
} from './registry.js'
export type { MockupComponent, MockupComponentProps, MockupRenderer } from './types.js'

export { TireMockup } from './tire.js'
export { PartMockup } from './part.js'
export { SupplementMockup } from './supplement.js'
export { GenericMockup } from './generic.js'

export { MockupFrame, MockupText, MOCKUP_MONO, MOCKUP_SIZE, MOCKUP_TOKENS, fitMockupFontSize, tone, wrapMockupText } from './frame.js'
export type { MockupFrameProps, MockupTextProps, MockupTone } from './frame.js'

export { DEFAULT_MOCKUP_LABELS, describeMockup } from './labels.js'
export type { MockupLabels } from './labels.js'

export {
  BUILTIN_MOCKUP_KINDS,
  DEFAULT_MOCKUP_KIND_RULES,
  MOCKUP_KIND_ATTRIBUTES,
  MOCKUP_TEXT_LIMITS,
  cleanMockupText,
  genericMockupData,
  mockupDataFromProduct,
  mockupMonogram,
  partMockupData,
  resolveMockupKind,
  supplementMockupData,
  tireMockupData,
} from '@asteby/storefront/mockup'
export type {
  BuiltinMockupData,
  BuiltinMockupKind,
  GenericMockupData,
  MockupDataMap,
  MockupKind,
  MockupKindRule,
  MockupProduct,
  MockupVariant,
  PartMockupData,
  ResolveMockupKindOptions,
  SupplementMockupData,
  SupplementShape,
  TireMockupData,
} from '@asteby/storefront/mockup'
