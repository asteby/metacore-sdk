/**
 * Textos del blindaje de licencia, en español e inglés. Son el copy exacto de
 * cada estado: dicen QUÉ pasó y QUÉ sigue, sin repetir lo que ya dicen las
 * etiquetas y botones de la pantalla (nada de "pega tu clave" junto a un campo
 * que ya se llama "Clave…").
 *
 * Cada componente los pide con `t(key, { defaultValue })`: un host con i18n
 * puede sobrescribir cualquier clave en su bundle; sin i18n sale este texto.
 * `registerLicenseMessages(i18n)` los siembra en un i18next sin pisar lo del host.
 *
 * El SDK es genérico: aquí no hay marca, vertical ni vendedor concreto. El
 * contacto del vendedor llega en el propio estado de la licencia.
 */
export type LicenseLang = 'es' | 'en'

export function licenseLang(language?: string): LicenseLang {
    return (language ?? '').toLowerCase().startsWith('en') ? 'en' : 'es'
}

export const LICENSE_MESSAGES: Record<LicenseLang, Record<string, string>> = {
    es: {
        // Insignias
        'license.status.valid': 'Activa',
        'license.status.stale': 'Sin verificar',
        'license.status.grace': 'En gracia',
        'license.status.expired': 'Vencida',
        'license.status.missing': 'Sin licencia',
        'license.status.invalid': 'Inválida',
        'license.status.revoked': 'Desactivada',

        // Modal bloqueante
        'license.gate.instance': 'Esta instancia',
        'license.gate.title': 'Activa tu licencia',
        'license.gate.missing_description': 'Esta instancia todavía no tiene una licencia activa.',
        'license.gate.invalid_description': 'No pudimos validar la licencia de esta instancia.',
        'license.gate.expired_title': 'Tu licencia venció',
        'license.gate.expired_description': 'Tu licencia venció el {{date}} y el periodo de gracia terminó.',
        'license.gate.expired_description_nodate': 'Tu licencia venció y el periodo de gracia terminó.',
        'license.gate.trial_title': 'Tu prueba gratuita terminó',
        'license.gate.trial_description': 'La prueba gratuita de esta instancia terminó.',
        'license.gate.revoked_title': 'Licencia desactivada',
        'license.gate.revoked_description': '{{who}} desactivó la licencia de esta instancia.',
        'license.gate.read_only': 'Contacta al administrador de la plataforma para activar la licencia.',
        'license.gate.code_label': 'Clave o token de licencia',
        'license.gate.code_label_link': 'Enlace, código o clave de licencia',
        'license.gate.code_placeholder': 'lic_… o pega el token firmado',
        'license.gate.code_placeholder_link': 'https://…/a/acs_…, acs_… o lic_…',
        'license.gate.activate': 'Activar licencia',
        'license.gate.activating': 'Activando…',
        'license.gate.activate_error': 'No se pudo activar la licencia.',
        'license.gate.export': 'Exportar mis datos',
        'license.gate.provider': 'Tu proveedor',
        'license.gate.contact_label': 'Contacto',

        // Errores de un enlace o código de activación (código estable del hub)
        'license.link.activation_not_found': 'No reconocemos ese enlace o código. Revisa que esté completo o pide uno nuevo a tu proveedor.',
        'license.link.activation_used': 'Este enlace ya se usó en otro servidor. Pide uno nuevo a tu proveedor.',
        'license.link.activation_conflict': 'Esta licencia ya funciona en otro servidor. Si lo reinstalaste, pide a tu proveedor que la libere.',
        'license.link.activation_expired': 'El enlace venció. Tu proveedor puede generarte otro en un minuto.',
        'license.link.activation_revoked': 'Tu proveedor revocó este enlace. Contáctalo para recibir uno nuevo.',
        'license.link.license_revoked': 'Tu proveedor desactivó esta licencia. Contáctalo para reactivarla.',
        'license.link.license_expired': 'La licencia de este enlace ya venció. Tu proveedor puede renovarla.',
        'license.link.rate_limited': 'Demasiados intentos. Espera unos minutos y vuelve a probar.',

        // Banner
        'license.banner.upcoming': 'Tu licencia vence en {{days}} días.',
        'license.banner.upcoming_one': 'Tu licencia vence mañana.',
        'license.banner.upcoming_today': 'Tu licencia vence hoy.',
        'license.banner.grace': 'Tu licencia venció el {{date}}. Tienes {{days}} días para renovarla antes de que se bloqueen los cambios.',
        'license.banner.grace_nodate': 'Tu licencia venció. Tienes {{days}} días para renovarla antes de que se bloqueen los cambios.',
        'license.banner.expired_read_only': 'Tu licencia venció el {{date}}. Tu información sigue disponible para consultar y exportar; renueva para volver a registrar cambios.',
        'license.banner.expired_read_only_nodate': 'Tu licencia venció. Tu información sigue disponible para consultar y exportar; renueva para volver a registrar cambios.',
        'license.banner.expired': 'Tu licencia venció. Algunas acciones están bloqueadas.',
        'license.banner.revoked': '{{who}} desactivó esta licencia. Tu información sigue disponible para consultar y exportar hasta el {{date}}.',
        'license.banner.revoked_nodate': '{{who}} desactivó esta licencia. Tu información sigue disponible para consultar y exportar.',
        'license.banner.stale': 'No pudimos contactar al servidor de licencias desde el {{date}}. Seguimos funcionando.',
        'license.banner.stale_nodate': 'No pudimos contactar al servidor de licencias. Seguimos funcionando.',
        'license.banner.cloned': 'Detectamos esta licencia activa en otro servidor. Si no fue a propósito, avisa a {{who}}.',
        'license.banner.manage': 'Gestionar licencia',
        'license.banner.renew': 'Renovar',
        'license.banner.export': 'Exportar mis datos',
        'license.banner.dismiss': 'Descartar',
        'license.banner.contact': 'Contacto: {{contact}}',
        'license.banner.provider': 'tu proveedor',
    },
    en: {
        'license.status.valid': 'Active',
        'license.status.stale': 'Not verified',
        'license.status.grace': 'In grace period',
        'license.status.expired': 'Expired',
        'license.status.missing': 'No license',
        'license.status.invalid': 'Invalid',
        'license.status.revoked': 'Deactivated',

        'license.gate.instance': 'This instance',
        'license.gate.title': 'Activate your license',
        'license.gate.missing_description': "This instance doesn't have an active license yet.",
        'license.gate.invalid_description': "We couldn't validate this instance's license.",
        'license.gate.expired_title': 'Your license has expired',
        'license.gate.expired_description': 'Your license expired on {{date}} and the grace period has ended.',
        'license.gate.expired_description_nodate': 'Your license expired and the grace period has ended.',
        'license.gate.trial_title': 'Your free trial has ended',
        'license.gate.trial_description': "This instance's free trial has ended.",
        'license.gate.revoked_title': 'License deactivated',
        'license.gate.revoked_description': '{{who}} deactivated this instance\'s license.',
        'license.gate.read_only': 'Contact the platform administrator to activate the license.',
        'license.gate.code_label': 'License key or token',
        'license.gate.code_label_link': 'Activation link, code or license key',
        'license.gate.code_placeholder': 'lic_… or the signed token',
        'license.gate.code_placeholder_link': 'https://…/a/acs_…, acs_… or lic_…',
        'license.gate.activate': 'Activate license',
        'license.gate.activating': 'Activating…',
        'license.gate.activate_error': "The license couldn't be activated.",
        'license.gate.export': 'Export my data',
        'license.gate.provider': 'Your provider',
        'license.gate.contact_label': 'Contact',

        'license.link.activation_not_found': "We don't recognize that link or code. Check that it's complete, or ask your provider for a new one.",
        'license.link.activation_used': 'This link was already used on another server. Ask your provider for a new one.',
        'license.link.activation_conflict': 'This license already runs on another server. If you reinstalled, ask your provider to release it.',
        'license.link.activation_expired': 'The link has expired. Your provider can generate another in a minute.',
        'license.link.activation_revoked': 'Your provider revoked this link. Contact them to get a new one.',
        'license.link.license_revoked': 'Your provider deactivated this license. Contact them to reactivate it.',
        'license.link.license_expired': "This link's license has already expired. Your provider can renew it.",
        'license.link.rate_limited': 'Too many attempts. Wait a few minutes and try again.',

        'license.banner.upcoming': 'Your license expires in {{days}} days.',
        'license.banner.upcoming_one': 'Your license expires tomorrow.',
        'license.banner.upcoming_today': 'Your license expires today.',
        'license.banner.grace': 'Your license expired on {{date}}. You have {{days}} days to renew it before changes are blocked.',
        'license.banner.grace_nodate': 'Your license expired. You have {{days}} days to renew it before changes are blocked.',
        'license.banner.expired_read_only': 'Your license expired on {{date}}. Your data is still available to view and export; renew to record changes again.',
        'license.banner.expired_read_only_nodate': 'Your license expired. Your data is still available to view and export; renew to record changes again.',
        'license.banner.expired': 'Your license expired. Some actions are blocked.',
        'license.banner.revoked': '{{who}} deactivated this license. Your data stays available to view and export until {{date}}.',
        'license.banner.revoked_nodate': '{{who}} deactivated this license. Your data stays available to view and export.',
        'license.banner.stale': "We couldn't reach the license server since {{date}}. Everything keeps working.",
        'license.banner.stale_nodate': "We couldn't reach the license server. Everything keeps working.",
        'license.banner.cloned': "We detected this license active on another server. If that wasn't intended, let {{who}} know.",
        'license.banner.manage': 'Manage license',
        'license.banner.renew': 'Renew',
        'license.banner.export': 'Export my data',
        'license.banner.dismiss': 'Dismiss',
        'license.banner.contact': 'Contact: {{contact}}',
        'license.banner.provider': 'your provider',
    },
}

/** Fecha corta y estable (UTC) para los textos de licencia. */
export function formatLicenseDate(iso: string | undefined, lang: LicenseLang): string | undefined {
    if (!iso) return undefined
    const d = new Date(iso)
    if (Number.isNaN(d.getTime())) return undefined
    return d.toLocaleDateString(lang === 'en' ? 'en-US' : 'es-MX', {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
        timeZone: 'UTC',
    })
}

/** Minimal i18next surface needed to seed the bundles. */
interface I18nLike {
    addResourceBundle?: (lng: string, ns: string, res: object, deep?: boolean, overwrite?: boolean) => unknown
}

/**
 * Siembra es/en en el i18next del host SIN pisar lo que ya tenga (overwrite=false):
 * el host manda, el SDK solo rellena lo que falta.
 */
export function registerLicenseMessages(i18n: I18nLike | undefined, ns = 'translation'): void {
    if (!i18n?.addResourceBundle) return
    for (const lang of ['es', 'en'] as const) {
        const nested: Record<string, unknown> = {}
        for (const [key, value] of Object.entries(LICENSE_MESSAGES[lang])) {
            const parts = key.split('.')
            let cur = nested
            parts.slice(0, -1).forEach((p) => {
                cur = (cur[p] ??= {}) as Record<string, unknown>
            })
            cur[parts[parts.length - 1]] = value
        }
        i18n.addResourceBundle(lang, ns, nested, true, false)
    }
}
