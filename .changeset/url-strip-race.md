---
"@asteby/metacore-runtime-react": patch
---

fix(dynamic-table): don't strip a deep-linked filter on first mount (URL race)

The URL-write effect ran on the very first commit — when `initializedFromUrl`
(a ref) is already true but the init effect's `setDynamicFilters` hasn't
re-rendered yet — so it wrote a URL WITHOUT `f_status`, stripping a
deep-linked/reloaded filter and flickering the address bar until it settled
without the filter. Gate the write on a STATE flag (`urlSynced`) set once the
URL has been adopted, so the first write only happens on the render where
`dynamicFilters`/`pagination` already mirror the URL (a true no-op).
