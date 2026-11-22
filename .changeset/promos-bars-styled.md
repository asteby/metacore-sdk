---
"@asteby/storefront-react": minor
"@asteby/storefront": minor
---

New default stylesheet `@asteby/storefront-react/promos.css` for the tiered-discount and free-shipping bars (`CartProgressBars` / `PromoProgressBar`): a card per bar with an icon (price tag / truck / seal), the remaining amount highlighted, a rounded animated track, tier milestones on the track with their `5 %` label and `$500` threshold (check when reached, edge-anchored so they never overflow) and calm `next|upgrade|max|suppressed` / `progress|reached|always` states. It only uses the store's tokens (`--card`, `--border`, `--foreground`, `--muted-foreground`, `--primary`, `--success`, `--radius`; override with `--sf-promo-accent` / `--sf-promo-success`), so dark mode follows the theme. `PromoProgressBar` gains inline decorative icons, an `aria-hidden` dot per milestone, `data-edge` on milestones and a `remainingText` prop (the amount is wrapped in `<strong data-sf-promo-amount>`); the existing data attributes and ARIA are unchanged. `promoProgressView` adds `remainingText` to both bars.
