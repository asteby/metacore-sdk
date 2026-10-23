/**
 * SYNTHETIC constancia texts for the tests: invented people and ids that follow the format only. Nothing here
 * belongs to a real person or company.
 */
export const CURP_FISICA = 'PEPJ800101HDFRRN09'
export const RFC_FISICA = 'PEPJ800101AB3'
export const RFC_MORAL = 'ABC150301XY1'
export const ID_CIF_FISICA = '21030123456'
export const ID_CIF_MORAL = '21030987654'

export const QR_URL_FISICA = `https://siat.sat.gob.mx/app/qr/faces/pages/mobile/validadorqr.jsf?D1=10&D2=1&D3=${ID_CIF_FISICA}_${RFC_FISICA}`
export const QR_URL_OTRO = `https://siat.sat.gob.mx/app/qr/faces/pages/mobile/validadorqr.jsf?D1=10&D2=1&D3=${ID_CIF_FISICA}_ZZZ010101AA1`

/** Persona física with TWO regimes; the activity mentions "arrendamiento" (not a regime) and the street is sensitive data. */
export const CSF_FISICA_LINES = [
  'REGISTRO FEDERAL DE CONTRIBUYENTES',
  'CONSTANCIA DE SITUACIÓN FISCAL',
  'Lugar y Fecha de Emisión',
  'CIUDAD DE MEXICO , CIUDAD DE MEXICO A 15 DE SEPTIEMBRE DE 2026',
  'Datos de Identificación del Contribuyente:',
  `RFC: ${RFC_FISICA}`,
  `CURP: ${CURP_FISICA}`,
  'Nombre (s): JUAN',
  'Primer Apellido: PEREZ',
  'Segundo Apellido: PEREZ',
  'Fecha inicio de operaciones: 01 DE ENERO DE 2020',
  'Estatus en el padrón: ACTIVO',
  'Fecha de último cambio de estado: 01 DE ENERO DE 2020',
  'Nombre Comercial:',
  'Datos del domicilio registrado',
  'Código Postal: 06600',
  'Tipo de Vialidad: CALLE',
  'Nombre de Vialidad: REFORMA PRUEBA',
  'Número Exterior: 100',
  'Número Interior:',
  'Nombre de la Colonia: JUAREZ',
  'Nombre de la Localidad: CIUDAD DE MEXICO',
  'Nombre del Municipio o Demarcación Territorial: CUAUHTEMOC',
  'Nombre de la Entidad Federativa: CIUDAD DE MEXICO',
  'Actividades Económicas:',
  'Orden Actividad Económica Porcentaje Fecha Inicio',
  '1 Servicios de arrendamiento de inmuebles y consultoría 100 01/01/2020',
  'Regímenes:',
  'Régimen Fecha Inicio Fecha Fin',
  'Régimen de las Personas Físicas con Actividades Empresariales y Profesionales 01/01/2020',
  'Régimen de Sueldos y Salarios e Ingresos Asimilados a Salarios 01/01/2018',
  'Obligaciones:',
  'Descripción de la Obligación Vencimiento',
  'Presentar declaración anual de ISR 30 DE ABRIL',
  `Sello Digital idCIF: ${ID_CIF_FISICA}`,
]

export const CSF_MORAL_LINES = [
  'REGISTRO FEDERAL DE CONTRIBUYENTES',
  'CONSTANCIA DE SITUACIÓN FISCAL',
  'Lugar y Fecha de Emisión',
  'GUADALAJARA , JALISCO A 3 DE OCTUBRE DE 2026',
  `RFC: ${RFC_MORAL}`,
  'Denominación/Razón Social: EMPRESA DE PRUEBA SA DE CV',
  'Régimen de capital: SOCIEDAD ANONIMA DE CAPITAL VARIABLE',
  'Fecha de constitución: 01 DE MARZO DE 2015',
  'Estatus en el padrón: ACTIVO',
  'Datos del domicilio registrado',
  'Código Postal: 44100',
  'Tipo de Vialidad: AVENIDA',
  'Nombre de Vialidad: PRUEBA',
  'Actividades Económicas:',
  '1 Comercio al por menor de partes y refacciones 100 01/03/2015',
  'Regímenes:',
  'Régimen Fecha Inicio Fecha Fin',
  'Régimen General de Ley Personas Morales 01/03/2015',
  'Obligaciones:',
  `idCIF: ${ID_CIF_MORAL}`,
]

export const CSF_FISICA = CSF_FISICA_LINES.join('\n')
export const CSF_MORAL = CSF_MORAL_LINES.join('\n')

/** The same document as one long line, the way some PDFs come out of pdf.js. */
export const CSF_FISICA_ONE_LINE = CSF_FISICA_LINES.join(' ')

/** A PDF protected with a user password (made with Ghostscript from a one-page text PDF). */
export const LOCKED_PDF_BASE64 = 'JVBERi0xLjcKJcfsj6IKJSVJbnZvY2F0aW9uOiBncyAtcSAtZE5PUEFVU0UgLWRCQVRDSCAtc0RFVklDRT1wZGZ3cml0ZSAtc093bmVyUGFzc3dvcmQ9PyAtc1VzZXJQYXNzd29yZD0/IC1kRW5jcnlwdGlvblI9MyAtZEtleUxlbmd0aD0xMjggLXNPdXRwdXRGaWxlPT8gPwo1IDAgb2JqCjw8L0xlbmd0aCA2IDAgUi9GaWx0ZXIgL0ZsYXRlRGVjb2RlPj4Kc3RyZWFtCszZIb6VI6MRknR6V25sO4W60pVLo/2x2Fn05RGwRh025oZAva0nYrx42OJ9V7Yif4IHdX/8rUYFer/MxbRLOp7AE6i8S8YQ2RdZXaa0pYHkFpi22uRdyDRP6RlobACbDhJ90JgeMi6hisxCqkoMAyheIzYlurfBJ1plfgfX4r1x9vlWdGA9/k0Nc3joxOLYnGVuZHN0cmVhbQplbmRvYmoKNiAwIG9iagoxNDQKZW5kb2JqCjQgMCBvYmoKPDwvVHlwZS9QYWdlL01lZGlhQm94IFswIDAgNTk1IDg0Ml0KL1JvdGF0ZSAwL1BhcmVudCAzIDAgUgovUmVzb3VyY2VzPDwvUHJvY1NldFsvUERGIC9UZXh0XQovRm9udCA4IDAgUgo+PgovQ29udGVudHMgNSAwIFIKPj4KZW5kb2JqCjMgMCBvYmoKPDwgL1R5cGUgL1BhZ2VzIC9LaWRzIFsKNCAwIFIKXSAvQ291bnQgMQo+PgplbmRvYmoKMSAwIG9iago8PC9UeXBlIC9DYXRhbG9nIC9QYWdlcyAzIDAgUgovTWV0YWRhdGEgOSAwIFIKPj4KZW5kb2JqCjggMCBvYmoKPDwvUjcKNyAwIFI+PgplbmRvYmoKNyAwIG9iago8PC9CYXNlRm9udC9IZWx2ZXRpY2EvVHlwZS9Gb250Ci9FbmNvZGluZy9XaW5BbnNpRW5jb2RpbmcvU3VidHlwZS9UeXBlMT4+CmVuZG9iago5IDAgb2JqCjw8L1R5cGUvTWV0YWRhdGEKL1N1YnR5cGUvWE1ML0xlbmd0aCAxMTgzPj5zdHJlYW0KPD94cGFja2V0IGJlZ2luPSfvu78nIGlkPSdXNU0wTXBDZWhpSHpyZVN6TlRjemtjOWQnPz4KPD9hZG9iZS14YXAtZmlsdGVycyBlc2M9IkNSTEYiPz4KPHg6eG1wbWV0YSB4bWxuczp4PSdhZG9iZTpuczptZXRhLycgeDp4bXB0az0nWE1QIHRvb2xraXQgMi45LjEtMTMsIGZyYW1ld29yayAxLjYnPgo8cmRmOlJERiB4bWxuczpyZGY9J2h0dHA6Ly93d3cudzMub3JnLzE5OTkvMDIvMjItcmRmLXN5bnRheC1ucyMnIHhtbG5zOmlYPSdodHRwOi8vbnMuYWRvYmUuY29tL2lYLzEuMC8nPgo8cmRmOkRlc2NyaXB0aW9uIHJkZjphYm91dD0iIiB4bWxuczpwZGY9J2h0dHA6Ly9ucy5hZG9iZS5jb20vcGRmLzEuMy8nIHBkZjpQcm9kdWNlcj0nR1BMIEdob3N0c2NyaXB0IDEwLjAyLjEnLz4KPHJkZjpEZXNjcmlwdGlvbiByZGY6YWJvdXQ9IiIgeG1sbnM6eG1wPSdodHRwOi8vbnMuYWRvYmUuY29tL3hhcC8xLjAvJz48eG1wOk1vZGlmeURhdGU+MjAyNi0xMC0yM1QxNToyOTo0NC0wNTowMDwveG1wOk1vZGlmeURhdGU+Cjx4bXA6Q3JlYXRlRGF0ZT4yMDI2LTEwLTIzVDE1OjI5OjQ0LTA1OjAwPC94bXA6Q3JlYXRlRGF0ZT4KPHhtcDpDcmVhdG9yVG9vbD5Vbmtub3duQXBwbGljYXRpb248L3htcDpDcmVhdG9yVG9vbD48L3JkZjpEZXNjcmlwdGlvbj4KPHJkZjpEZXNjcmlwdGlvbiByZGY6YWJvdXQ9IiIgeG1sbnM6eGFwTU09J2h0dHA6Ly9ucy5hZG9iZS5jb20veGFwLzEuMC9tbS8nIHhhcE1NOkRvY3VtZW50SUQ9J3V1aWQ6MDgzNmJhYzEtMDczZC0xMWZkLTAwMDAtY2E1YTVlZmZhNjczJy8+CjxyZGY6RGVzY3JpcHRpb24gcmRmOmFib3V0PSIiIHhtbG5zOmRjPSdodHRwOi8vcHVybC5vcmcvZGMvZWxlbWVudHMvMS4xLycgZGM6Zm9ybWF0PSdhcHBsaWNhdGlvbi9wZGYnPjxkYzp0aXRsZT48cmRmOkFsdD48cmRmOmxpIHhtbDpsYW5nPSd4LWRlZmF1bHQnPlVudGl0bGVkPC9yZGY6bGk+PC9yZGY6QWx0PjwvZGM6dGl0bGU+PC9yZGY6RGVzY3JpcHRpb24+CjwvcmRmOlJERj4KPC94OnhtcG1ldGE+CiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIAogICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAKPD94cGFja2V0IGVuZD0ndyc/PgplbmRzdHJlYW0KZW5kb2JqCjIgMCBvYmoKPDwvUHJvZHVjZXIoNFtcMjAxXDAwNiIzM1wyNDNafFwwMjVEXDMzNlwzNzZcMDMzXDI1NVwzNTQ5WSFcMzUyXDIzMEApCi9DcmVhdGlvbkRhdGUoNzFcMzc3XDAyNldtbVwzNDBcMDM0PEdcMDAzXDIwNVwyNjdbXDI3MVwzNjA5QjZcMzUwXDIwNlYpCi9Nb2REYXRlKDcxXDM3N1wwMjZXbW1cMzQwXDAzNDxHXDAwM1wyMDVcMjY3W1wyNzFcMzYwOUI2XDM1MFwyMDZWKT4+ZW5kb2JqCjEwIDAgb2JqCjw8L0ZpbHRlciAvU3RhbmRhcmQgL1YgMiAvTGVuZ3RoIDEyOCAvUiAzIC9QIC00IC9PIChotfW88DZK/Fg+vy2FAnl5flgFQnEbJmaKd15DmR+hDykKL1UgKH9JwRdNHWaqhq6R6wwT8k1cKL9OXk51ikFkAE5W//oBCCk+PgplbmRvYmoKeHJlZgowIDExCjAwMDAwMDAwMDAgNjU1MzUgZiAKMDAwMDAwMDU4OCAwMDAwMCBuIAowMDAwMDAyMDI5IDAwMDAwIG4gCjAwMDAwMDA1MjkgMDAwMDAgbiAKMDAwMDAwMDM4OCAwMDAwMCBuIAowMDAwMDAwMTU1IDAwMDAwIG4gCjAwMDAwMDAzNjkgMDAwMDAgbiAKMDAwMDAwMDY4MSAwMDAwMCBuIAowMDAwMDAwNjUyIDAwMDAwIG4gCjAwMDAwMDA3NzAgMDAwMDAgbiAKMDAwMDAwMjI1NCAwMDAwMCBuIAp0cmFpbGVyCjw8IC9TaXplIDExIC9Sb290IDEgMCBSIC9JbmZvIDIgMCBSCi9JRCBbPDhFQ0NCNDU0MjRFRkExN0JBMUI2QzY1QTdGQzlDMERDPjw4RUNDQjQ1NDI0RUZBMTdCQTFCNkM2NUE3RkM5QzBEQz5dCi9FbmNyeXB0IDEwIDAgUiA+PgpzdGFydHhyZWYKMjM5NwolJUVPRgo='
