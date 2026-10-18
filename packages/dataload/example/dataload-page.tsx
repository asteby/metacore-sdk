/**
 * Integration example (not part of the build). A host page mounts the launcher
 * and the review queue with its HTTP client, its toasts, its locale and the
 * capabilities it derived from the person's role. The server enforces the same
 * rules: capabilities only shape the UI.
 */
import axios from 'axios'
import { toast } from 'sonner'
import {
  DataloadLauncher,
  DataloadProvider,
  OverridesEditor,
  ReviewQueue,
  createDataloadApi,
  useDataloadProfiles,
  type DataloadCapabilities,
} from '@asteby/metacore-dataload'

const http = axios.create({ baseURL: '/api', withCredentials: true })
const api = createDataloadApi(http)

type Role = 'owner' | 'admin' | 'catalog_editor' | 'viewer'

function capabilitiesFor(role: Role): Partial<DataloadCapabilities> {
  switch (role) {
    case 'owner':
    case 'admin':
      return { launch: true, cancel: true, approve: true, retryMedia: true, verifyMedia: true, editOverrides: true }
    case 'catalog_editor':
      return { launch: true, cancel: true, verifyMedia: true }
    default:
      return {} // can simulate and look, nothing else
  }
}

export function DataloadPage({ role, locale }: { role: Role; locale: 'es-MX' | 'en-US' }) {
  return (
    <DataloadProvider locale={locale} capabilities={capabilitiesFor(role)} notify={{ success: toast.success, error: toast.error }}>
      <main className='mx-auto flex max-w-5xl flex-col gap-4 p-4'>
        <DataloadLauncher
          api={api}
          defaultProfile='catalogo'
          // Files above 25 MB go up in parts of 8 MB, up to 1 GB.
          chunkedUpload={{ maxBytes: 1024 * 1024 * 1024, upload: { chunkSize: 8 * 1024 * 1024 } }}
          onFinished={(run) => console.info('dataload finished', run.id, run.state)}
        />
      </main>
    </DataloadProvider>
  )
}

/** A dedicated review screen, e.g. linked from a notification "N rows to review". */
export function ReviewPage({ role }: { role: Role }) {
  return (
    <DataloadProvider capabilities={capabilitiesFor(role)} notify={{ success: toast.success, error: toast.error }}>
      <ReviewQueue api={api} entity='product' className='m-4' />
    </DataloadProvider>
  )
}

/** Settings screen: edit and save one organization's overrides of a profile. */
export function OverridesPage({ name }: { name: string }) {
  const profiles = useDataloadProfiles(api)
  const stored = profiles.data?.find((p) => p.profile.name === name)
  if (!stored) return null
  return <OverridesEditor key={name} api={api} profile={stored.profile} value={stored.overrides} />
}

// Plugging an existing i18n (e.g. i18next) instead of the built-in catalogs:
//   <DataloadProvider t={(key, fallback) => i18n.t(key, { defaultValue: fallback })}>
// or a few keys over a built-in catalog:
//   <DataloadProvider locale='en-US' messages={{ 'dataload.title': 'Catalog import' }}>
