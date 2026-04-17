import { createFileRoute, Link } from '@tanstack/react-router'

export const Route = createFileRoute('/errors/500')({
  component: ServerErrorPage,
})

function ServerErrorPage() {
  return (
    <div className="min-h-svh flex flex-col items-center justify-center gap-4 p-6 text-center">
      <h1 className="text-4xl font-bold">500</h1>
      <p className="text-muted-foreground">Something went wrong on our side.</p>
      <Link to="/" className="text-primary underline">
        Back home
      </Link>
    </div>
  )
}
