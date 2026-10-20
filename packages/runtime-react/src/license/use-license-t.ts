import { useTranslation } from 'react-i18next'
import { LICENSE_MESSAGES, licenseLang, type LicenseLang } from './messages'

/**
 * `t` de licencia: pide la clave a i18next y, si el host no la define, cae al
 * texto es/en del SDK según el idioma activo (español por omisión). Un host con
 * su propio bundle gana siempre.
 */
export function useLicenseT(): {
    t: (key: string, vars?: Record<string, unknown>) => string
    lang: LicenseLang
} {
    const { t, i18n } = useTranslation()
    const lang = licenseLang(i18n?.language)
    return {
        lang,
        t: (key, vars) =>
            t(key, {
                defaultValue: LICENSE_MESSAGES[lang][key] ?? LICENSE_MESSAGES.es[key] ?? key,
                ...vars,
            }) as string,
    }
}
