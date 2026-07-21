---
"@asteby/metacore-theme": patch
---

fix(theme): stop sidebar nav groups overlapping after returning from a full-screen route

`.CollapsibleContent` used a keyframe `animation: slideDown/slideUp` that runs on
initial mount. For `defaultOpen` groups the height was not yet measured, so the
group settled at a wrong height and overlapped the group below it (surfaced when
returning from the POS, which remounts the sidebar). Replaced the keyframe with a
`transition: height` (gated behind `prefers-reduced-motion`), which does not run on
first paint. Mirrors the earlier ops-side fix, now consolidated in the shared theme.
