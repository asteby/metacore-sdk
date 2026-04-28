import { createFileRoute } from '@tanstack/react-router'
import { DynamicCRUDPage } from '@asteby/metacore-runtime-react'

export const Route = createFileRoute('/_authenticated/m/$model/')({
  component: DynamicModelPage,
})

function DynamicModelPage() {
  const { model } = Route.useParams()
  return (
    <DynamicCRUDPage
      model={model}
      i18n={{ refresh: 'Refrescar', export: 'Exportar', import: 'Importar', newPrefix: 'Nuevo' }}
    />
  )
}
