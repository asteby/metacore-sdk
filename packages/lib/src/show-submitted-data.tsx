import { toast } from 'sonner'

/**
 * Render a sonner toast that pretty-prints the submitted form payload as
 * JSON. Convenience helper used by demo / showcase forms; production flows
 * should issue a real success toast rather than dumping the data.
 *
 * Requires `sonner` to be installed in the consuming app (it's an optional
 * peer dependency of `@asteby/metacore-lib`).
 */
export function showSubmittedData(
  data: unknown,
  title: string = 'You submitted the following values:'
) {
  toast.message(title, {
    description: (
      <pre className='mt-2 w-full overflow-x-auto rounded-md bg-slate-950 p-4'>
        <code className='text-white'>{JSON.stringify(data, null, 2)}</code>
      </pre>
    ),
  })
}
