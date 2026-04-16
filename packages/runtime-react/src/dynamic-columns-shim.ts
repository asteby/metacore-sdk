// Shim: the host still owns `dynamic-columns` (it renders shadcn Badge/Avatar/
// MediaGallery primitives that are tightly coupled to the host's design system).
// DynamicTable imports it through this shim, and the hosts alias it back to
// their own `@/components/dynamic/dynamic-columns` via bundler config.
export { getDynamicColumns, type ColumnFilterConfig, DynamicIcon } from '@/components/dynamic/dynamic-columns'
