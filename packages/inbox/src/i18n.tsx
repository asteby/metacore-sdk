import { createContext, useContext, useMemo, type ReactNode } from 'react'
import type { InboxLocale } from './types'

const es = {
  conversations: 'Conversaciones',
  emptyListTitle: 'Todo al día',
  emptyListBody: 'No hay conversaciones que mostrar.',
  emptyThreadTitle: 'Selecciona una conversación',
  emptyThreadBody: 'El contenido aparecerá aquí.',
  loading: 'Cargando…',
  loadingMore: 'Cargando más…',
  errorTitle: 'No se pudo cargar',
  errorBody: 'Revisa tu conexión e inténtalo de nuevo.',
  retry: 'Reintentar',
  noSubject: '(sin asunto)',
  unread: 'sin leer',
  starred: 'Destacada',
  withAttachments: 'Con adjuntos',
  you: 'Tú',
  showQuoted: 'Mostrar texto citado',
  hideQuoted: 'Ocultar texto citado',
  attachments: 'Adjuntos',
  download: 'Descargar',
  imagesBlocked: 'Se bloquearon las imágenes remotas para proteger tu privacidad.',
  loadImages: 'Cargar imágenes',
  htmlFrameTitle: 'Contenido del mensaje',
  statusSending: 'Enviando…',
  statusSent: 'Enviado',
  statusDelivered: 'Entregado',
  statusFailed: 'No se envió',
  compose: 'Redactar',
  placeholder: 'Escribe un mensaje…',
  send: 'Enviar',
  sending: 'Enviando…',
  attach: 'Adjuntar archivos',
  removeAttachment: 'Quitar adjunto',
  uploadFailed: 'No se pudo subir',
  bold: 'Negrita',
  italic: 'Cursiva',
  link: 'Enlace',
  list: 'Lista',
  quote: 'Cita',
  formatting: 'Formato',
  sendAs: 'Enviar como',
  subject: 'Asunto',
  draftSaving: 'Guardando borrador…',
  draftSaved: 'Borrador guardado',
  discard: 'Descartar',
  linkPrompt: 'Dirección del enlace',
  dropFiles: 'Suelta los archivos para adjuntarlos',
  proposal: 'Acción sugerida',
  confirm: 'Confirmar',
  confirming: 'Aplicando…',
  dismiss: 'Descartar',
  confirmed: 'Aplicada',
  dismissed: 'Descartada',
  riskLow: 'Riesgo bajo',
  riskMedium: 'Riesgo medio',
  riskHigh: 'Riesgo alto',
  shortcuts: 'Atajos de teclado',
  scNext: 'Siguiente',
  scPrev: 'Anterior',
  scArchive: 'Archivar',
  scReply: 'Responder',
  scReplyAll: 'Responder a todos',
  scDelete: 'Eliminar',
  scCompose: 'Redactar',
  scSearch: 'Buscar',
  scSend: 'Enviar',
  scHelp: 'Ver atajos',
} as const

export type InboxLabels = { [K in keyof typeof es]: string }

const en: InboxLabels = {
  conversations: 'Conversations',
  emptyListTitle: 'All caught up',
  emptyListBody: 'There are no conversations to show.',
  emptyThreadTitle: 'Select a conversation',
  emptyThreadBody: 'Its content will appear here.',
  loading: 'Loading…',
  loadingMore: 'Loading more…',
  errorTitle: 'Could not load',
  errorBody: 'Check your connection and try again.',
  retry: 'Retry',
  noSubject: '(no subject)',
  unread: 'unread',
  starred: 'Starred',
  withAttachments: 'Has attachments',
  you: 'You',
  showQuoted: 'Show quoted text',
  hideQuoted: 'Hide quoted text',
  attachments: 'Attachments',
  download: 'Download',
  imagesBlocked: 'Remote images were blocked to protect your privacy.',
  loadImages: 'Load images',
  htmlFrameTitle: 'Message content',
  statusSending: 'Sending…',
  statusSent: 'Sent',
  statusDelivered: 'Delivered',
  statusFailed: 'Not sent',
  compose: 'Compose',
  placeholder: 'Write a message…',
  send: 'Send',
  sending: 'Sending…',
  attach: 'Attach files',
  removeAttachment: 'Remove attachment',
  uploadFailed: 'Upload failed',
  bold: 'Bold',
  italic: 'Italic',
  link: 'Link',
  list: 'List',
  quote: 'Quote',
  formatting: 'Formatting',
  sendAs: 'Send as',
  subject: 'Subject',
  draftSaving: 'Saving draft…',
  draftSaved: 'Draft saved',
  discard: 'Discard',
  linkPrompt: 'Link address',
  dropFiles: 'Drop files to attach them',
  proposal: 'Suggested action',
  confirm: 'Confirm',
  confirming: 'Applying…',
  dismiss: 'Dismiss',
  confirmed: 'Applied',
  dismissed: 'Dismissed',
  riskLow: 'Low risk',
  riskMedium: 'Medium risk',
  riskHigh: 'High risk',
  shortcuts: 'Keyboard shortcuts',
  scNext: 'Next',
  scPrev: 'Previous',
  scArchive: 'Archive',
  scReply: 'Reply',
  scReplyAll: 'Reply all',
  scDelete: 'Delete',
  scCompose: 'Compose',
  scSearch: 'Search',
  scSend: 'Send',
  scHelp: 'Show shortcuts',
}

export const INBOX_LABELS: Record<InboxLocale, InboxLabels> = { es, en }

interface Ctx {
  locale: InboxLocale
  labels: InboxLabels
}
const InboxContext = createContext<Ctx>({ locale: 'es', labels: es })

export interface InboxProviderProps {
  /** Defaults to 'es', like the rest of the SDK. Pass the app's current language. */
  locale?: InboxLocale | string
  /** Partial overrides on top of the locale bundle. */
  labels?: Partial<InboxLabels>
  children: ReactNode
}

const normLocale = (l?: string): InboxLocale => (l && l.toLowerCase().startsWith('en') ? 'en' : 'es')

export function InboxProvider({ locale, labels, children }: InboxProviderProps) {
  const loc = normLocale(locale)
  const value = useMemo<Ctx>(() => ({ locale: loc, labels: { ...INBOX_LABELS[loc], ...labels } }), [loc, labels])
  return <InboxContext.Provider value={value}>{children}</InboxContext.Provider>
}

/** Resolves labels from the nearest provider plus an optional per-component override. */
export function useInboxLabels(override?: Partial<InboxLabels>): Ctx {
  const ctx = useContext(InboxContext)
  return useMemo(() => (override ? { locale: ctx.locale, labels: { ...ctx.labels, ...override } } : ctx), [ctx, override])
}
