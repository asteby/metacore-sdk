export { PromoPopup } from './promo-popup.js'
export type { PromoPopupEvent, PromoPopupProps } from './promo-popup.js'

export { CartProgressBars, PromoProgressBar } from './cart-progress-bars.js'
export type { CartProgressBarsProps, ProgressBarProps } from './cart-progress-bars.js'

export { CrossSellModal } from './cross-sell-modal.js'
export type { CrossSellAddResult, CrossSellModalProps } from './cross-sell-modal.js'

export { OrderNote } from './order-note.js'
export type { OrderNoteProps, OrderNoteStatus } from './order-note.js'

export {
  DEFAULT_PROMO_EXCLUDED_PATHS,
  DEFAULT_PROMO_TRIGGER,
  PROMO_COOKIE,
  browserSeenStore,
  frequencyAllows,
  isCrawler,
  isExcludedPath,
  memorySeenStore,
  parseSeen,
  resolveTrigger,
  safeInternalPath,
  scrollDepthPercent,
  serializeSeen,
  stripMarketPrefix,
  withinWindow,
} from './promo-logic.js'
export type { FrequencyInput, PathPattern, PromoFrequency, PromoSeenStore, PromoTrigger, PromoWindow, SeenRecord } from './promo-logic.js'

export { CheckoutDiscountCode, DiscountCodeForm } from './discount-code.js'
export type { CheckoutDiscountCodeProps, DiscountCodeFormProps } from './discount-code.js'
