// Subpath ligero `@asteby/metacore-runtime-react/brand`: solo depende de React,
// para que `@asteby/metacore-app-providers` lo use sin arrastrar el runtime
// entero a la primera pintura del host.
export {
    EMPTY_BRAND,
    normalizeBrand,
    useBrand,
    type Brand,
    type BrandSource,
} from './context'
export { BrandProvider, type BrandProviderProps } from './brand-provider'
export { BrandDocumentSync, applyBrandFavicon, BRAND_CSS_VARS } from './brand-document-sync'
