// Optional sub-path entry. Apps that want to import multiple showcases at
// once can `import { WhatsAppShowcase, MarketplaceShowcase } from
// '@asteby/metacore-auth/showcases'`. For tree-shaking-friendly single
// imports, prefer the deep paths (`/showcases/whatsapp` etc).
export { WhatsAppShowcase, ChatMockup, type WhatsAppShowcaseProps } from './whatsapp'
export { MarketplaceShowcase, type MarketplaceShowcaseProps } from './marketplace'
export { GenericShowcase, type GenericShowcaseProps } from './generic'
