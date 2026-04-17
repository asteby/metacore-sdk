import { Languages } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@asteby/metacore-ui/primitives'

export type LanguageOption = {
  /** BCP-47 language code (e.g. `"en"`, `"es"`, `"en-US"`). */
  code: string
  /** Human-readable label shown in the dropdown. */
  label: string
  /** Optional flag emoji or short prefix rendered before the label. */
  flag?: string
}

export type LanguageSwitcherProps = {
  /**
   * Languages to render. When omitted, defaults to English + Spanish which
   * matches the base resource bundles shipped with this package.
   */
  languages?: LanguageOption[]
  /** Alignment of the dropdown content. Defaults to `"end"`. */
  align?: 'start' | 'center' | 'end'
  /** Override the trigger button size. Defaults to `"icon"`. */
  size?: 'default' | 'sm' | 'lg' | 'icon'
  /** Override the trigger button variant. Defaults to `"ghost"`. */
  variant?:
    | 'default'
    | 'destructive'
    | 'outline'
    | 'secondary'
    | 'ghost'
    | 'link'
  /** Extra class names for the trigger button. */
  className?: string
  /**
   * Called after the language has been changed. Useful for re-fetching
   * server-side data or invalidating caches.
   */
  onChange?: (code: string) => void
}

const DEFAULT_LANGUAGES: LanguageOption[] = [
  { code: 'en', label: 'English' },
  { code: 'es', label: 'Español' },
]

/**
 * Layout-agnostic dropdown that swaps the active i18next language.
 *
 * Ships no app-specific styling beyond the shadcn primitives re-exported from
 * `@asteby/metacore-ui`. Apps can inject their own list of languages (with
 * optional flag emojis) via the `languages` prop.
 */
export function LanguageSwitcher({
  languages = DEFAULT_LANGUAGES,
  align = 'end',
  size = 'icon',
  variant = 'ghost',
  className,
  onChange,
}: LanguageSwitcherProps) {
  const { i18n, t } = useTranslation()

  const toggleLabel = t('language.toggle', { defaultValue: 'Toggle language' })

  const handleChange = (code: string) => {
    void i18n.changeLanguage(code).then(() => {
      onChange?.(code)
    })
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant={variant}
          size={size}
          className={className ?? 'h-9 w-9'}
          aria-label={toggleLabel}
        >
          <Languages className='h-[1.2rem] w-[1.2rem]' />
          <span className='sr-only'>{toggleLabel}</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align={align}>
        {languages.map((lang) => {
          const isActive = i18n.language === lang.code
          return (
            <DropdownMenuItem
              key={lang.code}
              onClick={() => handleChange(lang.code)}
            >
              {lang.flag ? <span className='mr-2'>{lang.flag}</span> : null}
              {lang.label}
              {isActive ? <span className='ml-2'>✓</span> : null}
            </DropdownMenuItem>
          )
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
