/**
 * The whole settings page in one component, for stores that want the sections in the usual order and nothing else:
 * language, notices, devices, download my data, delete my account. Each section appears only when its capability is
 * there (`loadAccountSettings`), so a store on an older server, or one without a delivery connector, shows what works
 * and hides what does not; no section ever renders an error page. A store that wants another layout composes the
 * sections itself (`LanguagePreference`, `NotificationPreferences`, `SessionsList`, `DataExport`, `DeleteAccount`).
 */
import type { ComponentType, ReactNode } from 'react'
import type { AccountFormProps } from './account-auth.js'
import { DataExport, DeleteAccount, type DataExportClassNames, type DeleteAccountClassNames } from './privacy.js'
import { LanguagePreference, NotificationPreferences, type LanguagePreferenceClassNames, type NotificationPreferencesClassNames } from './preferences.js'
import { SessionsList, type SessionsListClassNames } from './sessions.js'
import type { AccountSettingsData } from './settings-server.js'
import type { AccountSettingsActionData } from './settings-types.js'
import type { SettingsTextProps } from './settings-ui.js'

export type AccountSettingsClassNames = {
  root?: string
  language?: LanguagePreferenceClassNames
  notifications?: NotificationPreferencesClassNames
  sessions?: SessionsListClassNames
  export?: DataExportClassNames
  delete?: DeleteAccountClassNames
}

export type AccountSettingsProps = SettingsTextProps & {
  /** From `loadAccountSettings`. A `null` customer (dead session) renders nothing: send the buyer to sign in. */
  settings: AccountSettingsData
  /** The store's languages (`shop.locales`). */
  locales?: ReadonlyArray<string | { value: string; label?: string }> | null
  /** What the settings action returned (`useActionData()`). */
  data?: AccountSettingsActionData | null
  pending?: boolean
  /** Form component for the sections that can use a router `Form` (not the download). Default: the HTML `<form>`. */
  form?: 'form' | ComponentType<AccountFormProps>
  action?: string
  classNames?: AccountSettingsClassNames
  children?: ReactNode
}

export function AccountSettings({ settings, locales, data, pending = false, form, action, classNames: cx = {}, children, ...text }: AccountSettingsProps) {
  const { customer, capabilities, sessions } = settings
  if (!customer) return null
  const shared = { ...text, ...(data ? { data } : {}), pending, ...(action ? { action } : {}) }
  const withForm = form ? { form } : {}
  return (
    <div className={cx.root} data-sf-settings>
      <LanguagePreference {...shared} {...withForm} locales={locales} value={customer.locale ?? null} classNames={cx.language ?? {}} />
      <NotificationPreferences {...shared} {...withForm} channels={capabilities?.notifications?.channels} preferences={customer.preferences ?? null} classNames={cx.notifications ?? {}} />
      <SessionsList {...shared} {...withForm} sessions={sessions} classNames={cx.sessions ?? {}} />
      {capabilities?.data_export ? <DataExport {...shared} classNames={cx.export ?? {}} /> : null}
      {capabilities?.account_delete ? <DeleteAccount {...shared} {...withForm} classNames={cx.delete ?? {}} /> : null}
      {children}
    </div>
  )
}
