// Composable, brand-agnostic blocks for building auth showcases — and any
// other hero zone in an app (dashboards, empty states, marketing surfaces).
//
// Apps build their own showcase by composing these. The SDK does not ship
// product-specific showcases (chat mockups, marketplace tiles, etc) — those
// live in each app's `features/auth/showcase/`, since they encode the app's
// narrative and copy.
export { HeroPanel, type HeroPanelProps } from './hero-panel'
export { TileGrid, type Tile, type TileGridProps } from './tile-grid'
export {
  FeatureList,
  type Feature,
  type FeatureListProps,
} from './feature-list'
export { StatRow, type Stat, type StatRowProps } from './stat-row'
