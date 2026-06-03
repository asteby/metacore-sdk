---
"@asteby/metacore-app-providers": patch
---

fix(branding): foreground by luminance threshold, not max WCAG contrast

`readableForeground` picked black on mid-tone saturated brands (indigo/purple
at Y≈0.22) because pure max-contrast favors black there — but those deep colors
expect white text and black-on-dark-purple read as broken. Now it uses a
perceptual luminance threshold (Y > 0.3 → dark text): deep colors (blue/purple/
red) keep white, bright surfaces (lime/yellow/cyan + the inverted near-white
grey primary) get black. Adapts to light/dark automatically since the resolved
primary lightness already differs per mode.
