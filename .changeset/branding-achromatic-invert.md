---
"@asteby/metacore-app-providers": minor
---

fix(branding): invert achromatic (grey/near-black) brand for each mode

A greyscale brand previously produced a muddy mid-grey `--primary` in dark
mode (clamped to L≈0.55 on a ~0.22 canvas) — technically neutral but it read
as washed-out, not branded. Now an achromatic brand (`C < 0.02`) inverts per
mode like a standard neutral theme:

- dark → near-white primary (L 0.92), crisp light-on-dark
- light → near-black primary (L 0.21), crisp dark-on-light

Foregrounds stay WCAG-contrast-derived (`readableForeground`), so the
inverted primary gets the right black/white text automatically. Chromatic
brands are unchanged (hue/chroma preserved, brightness clamped per mode).
