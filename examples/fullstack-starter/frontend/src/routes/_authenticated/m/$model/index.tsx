import { createFileRoute } from '@tanstack/react-router'
import { DynamicCRUDPage } from '@asteby/metacore-runtime-react'
import { useTranslation } from 'react-i18next'

export const Route = createFileRoute('/_authenticated/m/$model/')({
  component: DynamicModelPage,
})

function DynamicModelPage() {
  const { model } = Route.useParams()
  const { t } = useTranslation()
  return (
    <DynamicCRUDPage
      model={model}
      i18n={{
        refresh: t('common.refresh'),
        export: t('common.export'),
        import: t('common.import'),
        newPrefix: t('common.new'),
      }}
    />
  )
}
