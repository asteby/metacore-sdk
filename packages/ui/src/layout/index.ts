export { AuthenticatedLayout } from './authenticated-layout'
export { AppSidebar, OrganizationCard } from './app-sidebar'
export { Header } from './header'
export { HeaderActions, type HeaderActionsProps } from './header-actions'
export { NavUser } from './nav-user'
export { NavGroup, type NavLinkComponent, type NavGroupProps } from './nav-group'
export {
  checkIsActive,
  splitHref,
  declaredFiltersMatch,
  VIEW_PARAMS,
  type SplitHref,
} from './nav-active'
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
