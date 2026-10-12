/**
 * Older Aby replies (and the sidebar's last_message) can carry the backend's
 * raw tool fallback: a query result rendered key by key —
 *
 *   - **Count:** 1
 *   **Records:**
 *     - Almacén Uno · ALM001
 *   - **Model:** warehouses
 *
 * The backend now words it as prose; this keeps persisted history readable:
 * drop the internal keys (model key, bare count, "Records:" header) and keep
 * the record lines as a plain list.
 */
const DUMP_KEY_LINE = /^\s*(?:[-*]\s+)?\*\*(?:Count|Model|Records)\s*:?\s*\*\*\s*:?.*$/i

export function scrubToolDump(content: string): string {
  if (!content || !/\*\*(?:Count|Model|Records)\b/i.test(content)) return content
  const out: string[] = []
  for (const line of content.split('\n')) {
    if (DUMP_KEY_LINE.test(line)) continue
    // Record items were nested under "Records:" — lift them to the top level.
    out.push(line.replace(/^\s{2,}([-*]\s)/, '$1'))
  }
  return out
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}
