---
"@asteby/metacore-theme": patch
---

fix(theme): use transition instead of keyframe for CollapsibleContent

`.CollapsibleContent` used a keyframe `animation: slideDown/slideUp` that runs on
initial mount. For `defaultOpen` sidebar groups the Radix height is not yet
measured on first paint, so the group can settle at a wrong height and overlap the
group below it (visible when returning from a full-screen route that remounts the
sidebar, e.g. the POS). Replaced the keyframe with a `transition: height` gated
behind `prefers-reduced-motion`, which does not run on first paint. This mirrors
the existing ops-side fix; consuming the theme stylesheet directly no longer
carries the latent bug.
