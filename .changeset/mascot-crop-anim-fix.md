---
"@asteby/metacore-app-providers": patch
---

Fix `<Mascot>`: it now injects its own animation CSS into `<head>` on
mount (consuming apps no longer need to wire `MASCOT_CSS` manually —
this was silently missing everywhere, so nothing animated), tightens
the SVG viewBox to hug the drawn shape (was ~35% empty padding, making
the mascot look tiny and off-center at any given pixel size), and
drops the ground-shadow ellipse + drop-shadow filter that read as a
stray dark smudge at small sizes.
