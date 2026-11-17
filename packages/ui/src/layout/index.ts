export { AuthenticatedLayout } from './authenticated-layout'
export { AppSidebar, OrganizationCard } from './app-sidebar'
export { Header } from './header'
export {
  HeaderActions,
  HeaderActionsItem,
  type HeaderActionsProps,
  type HeaderActionsItemProps,
} from './header-actions'
export { NavUser } from './nav-user'
export { NavGroup, type NavLinkComponent, type NavGroupProps } from './nav-group'
export {
  checkIsActive,
  splitHref,
  declaredFiltersMatch,
  flattenNavLeaves,
  resolveActiveItemUrls,
  VIEW_PARAMS,
  type SplitHref,
} from './nav-active'
export { filterNavGroups, filterNavItems } from './filter-nav'
export { TeamSwitcher } from './team-switcher'
export { ProfileDropdown } from './profile-dropdown'
export {
  resolveIconName,
  humanizeNavKey,
  translateNavTitle,
  addonGroupToCollapsibleItem,
  FALLBACK_GROUP_ICON,
  FALLBACK_ITEM_ICON,
  type AddonNavItemLike,
  type AddonNavGroupLike,
} from './addon-nav'
export type {
  NavItem,
  NavLinkItem,
  NavCollapsibleItem,
  NavGroupData,
  LayoutUser,
} from './types'
export { NavBadge, BADGE_TONE_CLASS, type NavBadgeProps } from './nav-badge'
export {
  formatBadgeCount,
  maxSeverity,
  isSeverity,
  isNavBadgeValue,
  hasNavBadge,
  formatTabTitle,
  stripTabTitleCount,
  aggregateBadges,
  SEVERITIES,
  DEFAULT_BADGE_MAX,
  type Severity,
  type NavBadgeValue,
} from './badge-model'
