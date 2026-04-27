// Brand-neutral fallback showcase + composable building blocks.
// Apps that want a custom showcase compose the blocks (HeroPanel, TileGrid,
// FeatureList, StatRow) from `@asteby/metacore-auth/showcases/blocks`.
export { GenericShowcase, type GenericShowcaseProps } from './generic'
export {
  HeroPanel,
  TileGrid,
  FeatureList,
  StatRow,
  type HeroPanelProps,
  type TileGridProps,
  type Tile,
  type FeatureListProps,
  type Feature,
  type StatRowProps,
  type Stat,
} from './blocks'
