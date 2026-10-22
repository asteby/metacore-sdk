import { createContext, useContext, useMemo, type ReactNode } from 'react'

const es = {
  stepsLabel: 'Pasos',
  stepPending: 'Pendiente',
  stepRunning: 'En curso',
  stepOk: 'Completado',
  stepError: 'Con error',
  back: 'Atrás',
  next: 'Continuar',
  finish: 'Finalizar',
  retry: 'Reintentar',
  start: 'Comenzar',
  checking: 'Verificando…',
  checkNow: 'Verificar ahora',
  lastChecked: 'Última verificación',
  attempt: 'Intento',
  gaveUp: 'La verificación no se completó a tiempo. Puedes reintentar.',
  statusIdle: 'Sin verificar',
  statusChecking: 'Verificando',
  statusOk: 'Correcto',
  statusError: 'Error',
  statusMissing: 'No encontrado',
  statusWrongValue: 'Valor distinto',
  statusPropagating: 'Propagando',
  copy: 'Copiar',
  copied: 'Copiado',
  copyFailed: 'No se pudo copiar',
  type: 'Tipo',
  name: 'Nombre',
  value: 'Valor',
  found: 'Valor actual',
  ttl: 'TTL',
  priority: 'Prioridad',
  diagnostic: 'Diagnóstico',
  domainTitle: 'Configura tu dominio',
  methodTitle: 'Método',
  methodBody: 'Elige cómo quieres publicar los registros DNS.',
  methodManual: 'Copiar y pegar',
  methodManualBody: 'Crea los registros en el panel de tu proveedor de DNS.',
  apply: 'Aplicar',
  applying: 'Aplicando…',
  recordsTitle: 'Registros DNS',
  recordsBody: 'Agrega estos registros en tu proveedor de DNS. La verificación se actualiza sola.',
  recordsProgress: 'registros correctos',
  doneTitle: 'Dominio verificado',
  doneBody: 'Todos los registros están correctos.',
  required: 'Requerido',
  optional: 'Opcional',
} as const

export type WizardLabels = { [K in keyof typeof es]: string }

const en: WizardLabels = {
  stepsLabel: 'Steps',
  stepPending: 'Pending',
  stepRunning: 'In progress',
  stepOk: 'Completed',
  stepError: 'Failed',
  back: 'Back',
  next: 'Continue',
  finish: 'Finish',
  retry: 'Retry',
  start: 'Start',
  checking: 'Checking…',
  checkNow: 'Check now',
  lastChecked: 'Last checked',
  attempt: 'Attempt',
  gaveUp: 'Verification did not complete in time. You can retry.',
  statusIdle: 'Not checked',
  statusChecking: 'Checking',
  statusOk: 'Correct',
  statusError: 'Error',
  statusMissing: 'Not found',
  statusWrongValue: 'Different value',
  statusPropagating: 'Propagating',
  copy: 'Copy',
  copied: 'Copied',
  copyFailed: 'Could not copy',
  type: 'Type',
  name: 'Name',
  value: 'Value',
  found: 'Current value',
  ttl: 'TTL',
  priority: 'Priority',
  diagnostic: 'Diagnostic',
  domainTitle: 'Set up your domain',
  methodTitle: 'Method',
  methodBody: 'Choose how to publish the DNS records.',
  methodManual: 'Copy and paste',
  methodManualBody: 'Create the records in your DNS provider’s dashboard.',
  apply: 'Apply',
  applying: 'Applying…',
  recordsTitle: 'DNS records',
  recordsBody: 'Add these records at your DNS provider. Verification updates on its own.',
  recordsProgress: 'records correct',
  doneTitle: 'Domain verified',
  doneBody: 'All records are correct.',
  required: 'Required',
  optional: 'Optional',
}

export const WIZARD_LABELS: Record<'es' | 'en', WizardLabels> = { es, en }

const Ctx = createContext<WizardLabels>(es)

export function SetupWizardProvider({ locale, labels, children }: { locale?: string; labels?: Partial<WizardLabels>; children: ReactNode }) {
  const base = WIZARD_LABELS[locale && locale.toLowerCase().startsWith('en') ? 'en' : 'es']
  const value = useMemo(() => ({ ...base, ...labels }), [base, labels])
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useWizardLabels(override?: Partial<WizardLabels>): WizardLabels {
  const ctx = useContext(Ctx)
  return useMemo(() => (override ? { ...ctx, ...override } : ctx), [ctx, override])
}
