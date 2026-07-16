---
"@asteby/metacore-runtime-react": patch
---

feat(dynamic-table): cache first-page rows for instant reload paint

The table fetched rows into local state, so a full reload showed a full-table
skeleton until `/data/:model` resolved — even for the view just seen. Stash the
last first-page result in sessionStorage (org/user-scoped → must not outlive the
tab session) keyed by model+endpoint+branch+URL params, and seed the initial
rows from it so a reload paints instantly and revalidates in the background
(stale-while-revalidate).
