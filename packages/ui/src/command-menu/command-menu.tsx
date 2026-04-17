import * as React from 'react'
import { useTranslation } from 'react-i18next'
import { ArrowRight, ChevronRight, Laptop, Moon, Sun } from 'lucide-react'
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from '@/primitives/command'
import { ScrollArea } from '@/primitives/scroll-area'

export interface CommandMenuNavItem {
  title: string
  url?: string
  items?: CommandMenuNavItem[]
}

export interface CommandMenuNavGroup {
  title: string
  items: CommandMenuNavItem[]
}

export type CommandMenuTheme = 'light' | 'dark' | 'system'

export interface CommandMenuProps {
  /** Whether the dialog is open. */
  open: boolean
  /** Toggle the dialog. */
  onOpenChange: (open: boolean) => void
  /** Navigation groups to render. Translation keys are passed through `t()`. */
  navGroups: CommandMenuNavGroup[]
  /**
   * Navigation callback invoked when a nav item is selected.
   * Consumers usually wire this to their router (tanstack `useNavigate`, `next/link`, etc.).
   */
  onNavigate: (url: string) => void
  /** Optional theme switcher callback. If omitted, theme group is hidden. */
  onThemeChange?: (theme: CommandMenuTheme) => void
}

/**
 * Keyboard-driven command palette. Framework-agnostic: consumer injects nav groups
 * and a navigation callback (e.g. a wrapper around a router). The theme section is
 * optional and collapses when `onThemeChange` is not provided.
 */
export function CommandMenu({
  open,
  onOpenChange,
  navGroups,
  onNavigate,
  onThemeChange,
}: CommandMenuProps) {
  const { t } = useTranslation()

  const runCommand = React.useCallback(
    (command: () => unknown) => {
      onOpenChange(false)
      command()
    },
    [onOpenChange]
  )

  return (
    <CommandDialog modal open={open} onOpenChange={onOpenChange}>
      <CommandInput placeholder={t('common.search_command')} />
      <CommandList>
        <ScrollArea type='hover' className='h-72 pe-1'>
          <CommandEmpty>{t('common.no_results')}</CommandEmpty>
          {navGroups.map((group) => (
            <CommandGroup key={group.title} heading={t(group.title)}>
              {group.items.map((navItem, i) => {
                if (navItem.url) {
                  const url = navItem.url
                  return (
                    <CommandItem
                      key={`${navItem.url}-${i}`}
                      value={t(navItem.title)}
                      onSelect={() => {
                        runCommand(() => onNavigate(url))
                      }}
                    >
                      <div className='flex size-4 items-center justify-center'>
                        <ArrowRight className='text-muted-foreground/80 size-2' />
                      </div>
                      {t(navItem.title)}
                    </CommandItem>
                  )
                }

                return navItem.items?.map((subItem, j) => {
                  const subUrl = subItem.url ?? ''
                  return (
                    <CommandItem
                      key={`${navItem.title}-${subUrl}-${j}`}
                      value={`${t(navItem.title)}-${subUrl}`}
                      onSelect={() => {
                        if (subUrl) runCommand(() => onNavigate(subUrl))
                      }}
                    >
                      <div className='flex size-4 items-center justify-center'>
                        <ArrowRight className='text-muted-foreground/80 size-2' />
                      </div>
                      {t(navItem.title)} <ChevronRight /> {t(subItem.title)}
                    </CommandItem>
                  )
                })
              })}
            </CommandGroup>
          ))}
          {onThemeChange && (
            <>
              <CommandSeparator />
              <CommandGroup heading={t('common.theme')}>
                <CommandItem
                  onSelect={() => runCommand(() => onThemeChange('light'))}
                >
                  <Sun /> <span>{t('common.theme_light')}</span>
                </CommandItem>
                <CommandItem
                  onSelect={() => runCommand(() => onThemeChange('dark'))}
                >
                  <Moon className='scale-90' />
                  <span>{t('common.theme_dark')}</span>
                </CommandItem>
                <CommandItem
                  onSelect={() => runCommand(() => onThemeChange('system'))}
                >
                  <Laptop />
                  <span>{t('common.theme_system')}</span>
                </CommandItem>
              </CommandGroup>
            </>
          )}
        </ScrollArea>
      </CommandList>
    </CommandDialog>
  )
}
