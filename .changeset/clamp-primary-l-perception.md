---
'@asteby/metacore-app-providers': patch
---

PlatformConfigProvider: clamp the perceptual lightness of `primary_color` when deriving `--primary` so intrinsically light brand hues (lime, yellow, cyan) don't render fluorescent buttons. L is now clamped to [0.45, 0.65] in light mode and [0.55, 0.70] in dark mode. Hue and chroma are preserved, so the brand identity is intact — colors like indigo-500 (L≈0.55) are unaffected.
