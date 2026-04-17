import { createFileRoute } from '@tanstack/react-router'
import { DynamicTable } from '@asteby/metacore-runtime-react'

export const Route = createFileRoute('/_authenticated/m/$model/')({
  component: DynamicModelPage,
})

function DynamicModelPage() {
  const { model } = Route.useParams()
  return (
    <div data-layout='fixed' className='flex flex-col h-full overflow-hidden'>
      <div className='flex flex-col flex-1 p-6 gap-4 overflow-hidden'>
        <div className='flex-1 min-h-0'>
          <DynamicTable model={model} endpoint={`/dynamic/${model}`} />
        </div>
      </div>
    </div>
  )
}
