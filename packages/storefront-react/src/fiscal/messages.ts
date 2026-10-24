/** Texts of the fiscal components. Spanish (es-MX) by default, English with `en*`, any locale with `messages`. */
import type { FiscalReadError } from './types.js'

export type DeepPartial<T> = { [K in keyof T]?: T[K] extends Record<string, unknown> ? DeepPartial<T[K]> : T[K] }

export type FiscalMessages = {
  fields: {
    legend: string
    taxId: string
    taxIdHint: string
    legalName: string
    /** Used when the region publishes no help for the legal name. */
    legalNameHint: string
    postalCode: string
    postalCodeHint: string
    regime: string
    regimeHint: string
    regimeChoose: string
    regimeFromDocument: string
    use: string
    useHint: string
    useChoose: string
    /** `{document}` = the document's name. */
    fromDocument: string
    errors: {
      required: string
      taxIdFormat: string
      postalFormat: string
      unknown: string
      personType: string
      useNotAllowed: string
    }
  }
  reader: {
    /** `{document}`. */
    title: string
    dropHint: string
    dropActive: string
    choose: string
    obtain: string
    privacyBrowser: string
    privacyServer: string
    uploadServer: string
    manual: string
    reading: string
    cancel: string
    done: string
    reviewTitle: string
    reviewHint: string
    confirm: string
    changeFile: string
    saveToAccount: string
    saveConsent: string
    warnings: { qrMismatch: string; stale: string; regimeMissing: string; fieldsMissing: string }
    errors: Record<FiscalReadError, string>
    summaryTitleOne: string
    summaryTitleMany: string
  }
  toggle: {
    label: string
    payDefault: string
    payAndInvoice: string
    profileTitle: string
    change: string
    useOther: string
    useSaved: string
    manualTitle: string
    unavailable: string
    privacy: string
    fieldsOf: { taxId: string; legalName: string; postalCode: string; regime: string; use: string }
  }
  status: {
    title: string
    request: string
    requestHelp: string
    awaitingTitle: string
    awaitingBody: string
    processingTitle: string
    processingBody: string
    processingSlow: string
    refresh: string
    issuedTitle: string
    issuedBody: string
    folio: string
    pdf: string
    xml: string
    needsDataTitle: string
    needsDataBody: string
    correct: string
    reviewTitle: string
    reviewBody: string
    contact: string
    contactBy: string
    windowTitle: string
    windowBody: string
    unavailableTitle: string
    unavailableBody: string
    cancelledTitle: string
    cancelledBody: string
    /** `reason_code` -> cause for the buyer. `default` when unknown. */
    reasons: Record<string, string>
  }
  server: { errors: Record<string, string> }
}

const ES: FiscalMessages = {
  fields: {
    legend: 'Datos fiscales',
    taxId: 'RFC',
    taxIdHint: 'Se escribe en mayúsculas y sin espacios.',
    legalName: 'Nombre o razón social',
    legalNameHint: 'Escríbelo tal como aparece en tu registro fiscal.',
    postalCode: 'Código postal fiscal',
    postalCodeHint: 'El de tu domicilio fiscal, que puede ser distinto al de entrega.',
    regime: 'Régimen fiscal',
    regimeHint: 'Solo mostramos los que aplican a tu tipo de persona.',
    regimeChoose: 'Elige tu régimen',
    regimeFromDocument: 'Tu documento menciona más de un régimen. Elige el que usarás para esta factura.',
    use: 'Uso de la factura',
    useHint: 'Solo mostramos los usos que admite tu régimen.',
    useChoose: 'Elige el uso',
    fromDocument: 'De tu {document}',
    errors: {
      required: 'Completa este campo.',
      taxIdFormat: 'Revisa el formato: {kind} no válido.',
      postalFormat: 'Escribe un código postal válido, por ejemplo {example}.',
      unknown: 'Elige una opción de la lista.',
      personType: 'Este régimen no corresponde a tu tipo de persona.',
      useNotAllowed: 'Este uso no está disponible con el régimen elegido.',
    },
  },
  reader: {
    title: 'Sube tu {document}',
    dropHint: 'Arrastra el PDF aquí o toca para elegirlo',
    dropActive: 'Suelta el archivo para leerlo',
    choose: 'Elegir archivo',
    obtain: 'Descárgala aquí',
    privacyBrowser: 'La leemos en tu dispositivo. No guardamos el archivo, solo los datos que confirmes.',
    privacyServer: 'La procesamos y la descartamos al terminar. Solo guardamos los datos que confirmes.',
    uploadServer: 'Leer mi archivo',
    manual: 'Captura tus datos a mano',
    reading: 'Leyendo tu {document}…',
    cancel: 'Cancelar',
    done: 'Listo. Revisa tus datos.',
    reviewTitle: 'Revisa tus datos',
    reviewHint: 'Puedes corregir cualquier campo antes de continuar.',
    confirm: 'Usar estos datos',
    changeFile: 'Subir otro archivo',
    saveToAccount: 'Guardar en mi cuenta para la próxima',
    saveConsent: 'Guardaremos estos datos en tu cuenta para facturar más rápido. Puedes borrarlos cuando quieras.',
    warnings: {
      qrMismatch: 'El código QR de tu documento no coincide con los datos leídos. Revisa con calma tu RFC y tu nombre.',
      stale: 'Tu documento tiene {days} días de emitido. Si algo cambió en tu registro, descarga uno nuevo.',
      regimeMissing: 'No pudimos detectar tu régimen. Elígelo de la lista.',
      fieldsMissing: 'No encontramos algunos datos en el documento. Complétalos para continuar.',
    },
    errors: {
      not_pdf: 'Ese archivo no es un PDF. Sube el PDF que descargaste o captura tus datos a mano.',
      too_large: 'El archivo pesa más de {size}. Sube el PDF original o captura tus datos a mano.',
      no_text: 'Este PDF parece una imagen escaneada y no podemos leerlo. Captura tus datos a mano.',
      password: 'Este PDF tiene contraseña y no podemos abrirlo. Descárgalo de nuevo sin contraseña o captura tus datos a mano.',
      unreadable: 'No pudimos leer este archivo. Inténtalo con otro o captura tus datos a mano.',
    },
    summaryTitleOne: 'Revisa 1 campo para continuar',
    summaryTitleMany: 'Revisa {n} campos para continuar',
  },
  toggle: {
    label: 'Necesito factura (CFDI)',
    payDefault: 'Pagar',
    payAndInvoice: 'Pagar y facturar',
    profileTitle: 'Facturaremos con estos datos',
    change: 'Cambiar',
    useOther: 'Usar otros datos',
    useSaved: 'Usar mis datos guardados',
    manualTitle: 'Datos de facturación',
    unavailable: 'Esta tienda todavía no factura en línea.',
    privacy: 'Usamos estos datos solo para emitir tu factura.',
    fieldsOf: { taxId: 'RFC', legalName: 'Nombre o razón social', postalCode: 'Código postal fiscal', regime: 'Régimen', use: 'Uso' },
  },
  status: {
    title: 'Factura',
    request: 'Solicitar factura',
    requestHelp: '¿Necesitas factura de este pedido?',
    awaitingTitle: 'Esperando tu pago',
    awaitingBody: 'Cuando se acredite tu pago emitimos la factura. Con OXXO o transferencia puede tardar un poco.',
    processingTitle: 'Estamos generando tu factura',
    processingBody: 'Suele tardar menos de un minuto. Esta página se actualiza sola.',
    processingSlow: 'Sigue en proceso. Puedes cerrar esta página: tu factura aparecerá aquí cuando esté lista.',
    refresh: 'Actualizar',
    issuedTitle: 'Tu factura está lista',
    issuedBody: 'Descárgala cuando la necesites. Los enlaces vencen en 15 minutos; vuelve a abrir esta página para generar nuevos.',
    folio: 'Folio fiscal',
    pdf: 'Descargar PDF',
    xml: 'Descargar XML',
    needsDataTitle: 'Faltan datos para tu factura',
    needsDataBody: 'No pudimos emitirla con los datos que nos diste.',
    correct: 'Corregir y reintentar',
    reviewTitle: 'La tienda está revisando tu factura',
    reviewBody: 'Necesita una revisión del negocio. No tienes que hacer nada más; si tarda, escríbenos.',
    contact: 'Contactar a la tienda',
    contactBy: 'Escríbenos a {contact} con tu número de pedido.',
    windowTitle: 'Ya pasó el plazo para facturar',
    windowBody: 'Este pedido está fuera del plazo para pedir factura. Si necesitas ayuda, contacta a la tienda.',
    unavailableTitle: 'Factura no disponible',
    unavailableBody: 'Esta tienda no emite factura de este pedido. Si la necesitas, contáctala.',
    cancelledTitle: 'Factura cancelada',
    cancelledBody: 'Esta factura fue cancelada. Si necesitas una nueva, contacta a la tienda.',
    reasons: {
      'invoice.tax_id': 'El RFC no es válido.',
      'invoice.legal_name': 'El nombre o la razón social no coincide con tu registro.',
      'invoice.tax_regime': 'El régimen fiscal no es válido para tus datos.',
      'invoice.postal_code': 'El código postal fiscal no es válido.',
      'invoice.use': 'El uso de la factura no es válido con tu régimen.',
      default: 'Revisa tus datos fiscales y vuelve a intentarlo.',
    },
  },
  server: {
    errors: {
      validation: 'Revisa este campo.',
      required: 'Completa este campo.',
      invalid: 'El valor no es válido.',
    },
  },
}

const EN: FiscalMessages = {
  fields: {
    legend: 'Tax details',
    taxId: 'Tax ID',
    taxIdHint: 'Uppercase, without spaces.',
    legalName: 'Legal name',
    legalNameHint: 'Write it as it appears in your tax registration.',
    postalCode: 'Tax postal code',
    postalCodeHint: 'The one of your tax address, which can differ from the delivery address.',
    regime: 'Tax regime',
    regimeHint: 'We only list the ones that apply to your kind of taxpayer.',
    regimeChoose: 'Choose your regime',
    regimeFromDocument: 'Your document lists more than one regime. Choose the one for this invoice.',
    use: 'Invoice use',
    useHint: 'We only list the uses your regime admits.',
    useChoose: 'Choose the use',
    fromDocument: 'From your {document}',
    errors: {
      required: 'Fill in this field.',
      taxIdFormat: 'Check the format: not a valid {kind}.',
      postalFormat: 'Enter a valid postal code, like {example}.',
      unknown: 'Choose an option from the list.',
      personType: 'This regime does not match your kind of taxpayer.',
      useNotAllowed: 'This use is not available with the chosen regime.',
    },
  },
  reader: {
    title: 'Upload your {document}',
    dropHint: 'Drag the PDF here or tap to choose it',
    dropActive: 'Drop the file to read it',
    choose: 'Choose file',
    obtain: 'Get it here',
    privacyBrowser: 'We read it on your device. We do not keep the file, only the details you confirm.',
    privacyServer: 'We process it and discard it when done. We only keep the details you confirm.',
    uploadServer: 'Read my file',
    manual: 'Enter your details by hand',
    reading: 'Reading your {document}…',
    cancel: 'Cancel',
    done: 'Done. Review your details.',
    reviewTitle: 'Review your details',
    reviewHint: 'You can fix any field before continuing.',
    confirm: 'Use these details',
    changeFile: 'Upload another file',
    saveToAccount: 'Save to my account for next time',
    saveConsent: 'We will save these details to your account to invoice faster. You can delete them any time.',
    warnings: {
      qrMismatch: 'The QR code of your document does not match what we read. Check your tax ID and name carefully.',
      stale: 'Your document was issued {days} days ago. If something changed in your registration, download a new one.',
      regimeMissing: 'We could not detect your regime. Choose it from the list.',
      fieldsMissing: 'We did not find some details in the document. Fill them in to continue.',
    },
    errors: {
      not_pdf: 'That file is not a PDF. Upload the PDF you downloaded or enter your details by hand.',
      too_large: 'The file is larger than {size}. Upload the original PDF or enter your details by hand.',
      no_text: 'This PDF looks like a scanned image and we cannot read it. Enter your details by hand.',
      password: 'This PDF is password protected and we cannot open it. Download it again without a password or enter your details by hand.',
      unreadable: 'We could not read this file. Try another one or enter your details by hand.',
    },
    summaryTitleOne: 'Check 1 field to continue',
    summaryTitleMany: 'Check {n} fields to continue',
  },
  toggle: {
    label: 'I need an invoice',
    payDefault: 'Pay',
    payAndInvoice: 'Pay and invoice',
    profileTitle: 'We will invoice with these details',
    change: 'Change',
    useOther: 'Use other details',
    useSaved: 'Use my saved details',
    manualTitle: 'Invoice details',
    unavailable: 'This store does not invoice online yet.',
    privacy: 'We only use these details to issue your invoice.',
    fieldsOf: { taxId: 'Tax ID', legalName: 'Legal name', postalCode: 'Tax postal code', regime: 'Regime', use: 'Use' },
  },
  status: {
    title: 'Invoice',
    request: 'Request invoice',
    requestHelp: 'Do you need an invoice for this order?',
    awaitingTitle: 'Waiting for your payment',
    awaitingBody: 'We issue the invoice once your payment clears. Cash and bank transfers can take a while.',
    processingTitle: 'We are generating your invoice',
    processingBody: 'It usually takes under a minute. This page updates by itself.',
    processingSlow: 'Still in progress. You can close this page: your invoice will show up here when it is ready.',
    refresh: 'Refresh',
    issuedTitle: 'Your invoice is ready',
    issuedBody: 'Download it whenever you need. The links expire in 15 minutes; reopen this page for new ones.',
    folio: 'Tax folio',
    pdf: 'Download PDF',
    xml: 'Download XML',
    needsDataTitle: 'Your invoice needs more details',
    needsDataBody: 'We could not issue it with the details you gave us.',
    correct: 'Fix and retry',
    reviewTitle: 'The store is reviewing your invoice',
    reviewBody: 'It needs a review by the business. You do not need to do anything else; if it takes long, write to us.',
    contact: 'Contact the store',
    contactBy: 'Write to {contact} with your order number.',
    windowTitle: 'The invoicing period has ended',
    windowBody: 'This order is outside the period to request an invoice. If you need help, contact the store.',
    unavailableTitle: 'Invoice not available',
    unavailableBody: 'This store does not issue an invoice for this order. If you need one, contact them.',
    cancelledTitle: 'Invoice cancelled',
    cancelledBody: 'This invoice was cancelled. If you need a new one, contact the store.',
    reasons: {
      'invoice.tax_id': 'The tax ID is not valid.',
      'invoice.legal_name': 'The legal name does not match your registration.',
      'invoice.tax_regime': 'The tax regime is not valid for your details.',
      'invoice.postal_code': 'The tax postal code is not valid.',
      'invoice.use': 'The invoice use is not valid with your regime.',
      default: 'Check your tax details and try again.',
    },
  },
  server: {
    errors: {
      validation: 'Check this field.',
      required: 'Fill in this field.',
      invalid: 'The value is not valid.',
    },
  },
}

const merge = <T extends Record<string, unknown>>(base: T, over: DeepPartial<T> | undefined): T => {
  if (!over) return base
  const out: Record<string, unknown> = { ...base }
  for (const [k, v] of Object.entries(over)) {
    if (v === undefined) continue
    const b = base[k]
    out[k] = typeof v === 'object' && v !== null && !Array.isArray(v) && typeof b === 'object' && b !== null ? merge(b as Record<string, unknown>, v as DeepPartial<Record<string, unknown>>) : v
  }
  return out as T
}

/** Messages for a locale (`es*` default, `en*`), with optional overrides (merged level by level). */
export function fiscalMessages(locale?: string | null, overrides?: DeepPartial<FiscalMessages> | null): FiscalMessages {
  const base = (locale ?? 'es-MX').toLowerCase().startsWith('en') ? EN : ES
  return overrides ? merge(base, overrides) : base
}

/** `{name}` placeholders. */
export function fill(template: string, vars: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? String(vars[k]) : m))
}
