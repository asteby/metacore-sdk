/**
 * Texts of the account settings screens (`SessionsList`, and the other sections). Spanish (es-MX) by default,
 * English with `en*`, anything with `messages`. Server errors are codes (`SettingsErrorCode`); the words are here.
 */
import { fill } from '../fiscal/messages.js'

export { fill }

const ES = {
  // shared
  'settings.saved': 'Listo, guardamos tus cambios.',
  'settings.error.session_expired': 'Tu sesión venció. Inicia sesión de nuevo para continuar.',
  'settings.error.invalid_credential': 'No pudimos verificarte. Revisa tu contraseña o el código e inténtalo de nuevo.',
  'settings.error.reauth_required': 'Por seguridad, confirma tu contraseña o un código antes de continuar.',
  'settings.error.rate_limited': 'Demasiados intentos. Espera unos minutos e inténtalo de nuevo.',
  'settings.error.rate_limited_in': 'Demasiados intentos. Inténtalo de nuevo en {minutes} min.',
  'settings.error.validation': 'Revisa los datos e inténtalo de nuevo.',
  'settings.error.blocked_orders': 'Tienes un pedido en camino. Podrás hacerlo cuando llegue.',
  'settings.error.blocked_pending_payments': 'Tienes un pago pendiente. Págalo o espera a que venza para continuar.',
  'settings.error.unsupported': 'Esta tienda no ofrece esta opción por ahora.',
  'settings.error.unavailable': 'No pudimos completar la acción. Inténtalo de nuevo en un momento.',
  // sessions
  'sessions.title': 'Dispositivos con sesión abierta',
  'sessions.intro': 'Estos son los dispositivos donde tu cuenta tiene la sesión abierta. Si no reconoces alguno, ciérralo.',
  'sessions.current': 'Este dispositivo',
  'sessions.lastUsed': 'Último uso: {date}',
  'sessions.signedIn': 'Inicio de sesión: {date}',
  'sessions.method.email': 'Con código por correo',
  'sessions.method.phone': 'Con código por mensaje',
  'sessions.method.password': 'Con contraseña',
  'sessions.method.unknown': 'Inicio de sesión',
  'sessions.revoke': 'Cerrar sesión',
  'sessions.revokeLabel': 'Cerrar la sesión de {device}',
  'sessions.revokeOthers': 'Cerrar las demás sesiones',
  'sessions.revoked': 'Cerramos la sesión.',
  'sessions.revokedOthers': 'Cerramos las demás sesiones.',
  'sessions.none': 'No hay otras sesiones abiertas.',
  'sessions.error': 'No pudimos cargar tus dispositivos. Inténtalo de nuevo más tarde.',
  'sessions.loading': 'Cargando tus dispositivos',
  'sessions.listLabel': 'Dispositivos con sesión abierta',
}

export type SettingsMessageKey = keyof typeof ES
export type SettingsMessages = Record<SettingsMessageKey, string>

const EN: SettingsMessages = {
  'settings.saved': 'Done, your changes are saved.',
  'settings.error.session_expired': 'Your session expired. Sign in again to continue.',
  'settings.error.invalid_credential': 'We could not verify you. Check your password or the code and try again.',
  'settings.error.reauth_required': 'For your security, confirm your password or a code before continuing.',
  'settings.error.rate_limited': 'Too many attempts. Wait a few minutes and try again.',
  'settings.error.rate_limited_in': 'Too many attempts. Try again in {minutes} min.',
  'settings.error.validation': 'Check the details and try again.',
  'settings.error.blocked_orders': 'You have an order on its way. You will be able to do this once it arrives.',
  'settings.error.blocked_pending_payments': 'You have a pending payment. Pay it or wait for it to expire to continue.',
  'settings.error.unsupported': 'This store does not offer this option right now.',
  'settings.error.unavailable': 'We could not complete that. Try again in a moment.',
  'sessions.title': 'Devices signed in',
  'sessions.intro': 'These are the devices where your account is signed in. If you do not recognize one, sign it out.',
  'sessions.current': 'This device',
  'sessions.lastUsed': 'Last used: {date}',
  'sessions.signedIn': 'Signed in: {date}',
  'sessions.method.email': 'With an email code',
  'sessions.method.phone': 'With a text code',
  'sessions.method.password': 'With a password',
  'sessions.method.unknown': 'Sign-in',
  'sessions.revoke': 'Sign out',
  'sessions.revokeLabel': 'Sign out {device}',
  'sessions.revokeOthers': 'Sign out of all other devices',
  'sessions.revoked': 'We signed that device out.',
  'sessions.revokedOthers': 'We signed out the other devices.',
  'sessions.none': 'There are no other signed-in devices.',
  'sessions.error': 'We could not load your devices. Try again later.',
  'sessions.loading': 'Loading your devices',
  'sessions.listLabel': 'Devices signed in',
}

/** Messages for a locale (`es*` default, `en*`), with optional per-key overrides. */
export function settingsMessages(locale?: string | null, overrides?: Partial<SettingsMessages> | null): SettingsMessages {
  const base: SettingsMessages = (locale ?? 'es-MX').toLowerCase().startsWith('en') ? EN : ES
  return overrides ? { ...base, ...overrides } : base
}

/** The text of an open enum (`<group>.<value>`), else `<group>.unknown`. Never the raw value. */
export function settingsEnumText(m: SettingsMessages, group: string, value: unknown): string {
  const key = `${group}.${typeof value === 'string' ? value : ''}` as SettingsMessageKey
  return Object.prototype.hasOwnProperty.call(m, key) ? m[key] : m[`${group}.unknown` as SettingsMessageKey]
}
