import { serializeJsonLd, type JsonLdObject } from './seo.js'

export type JsonLdProps = { data: JsonLdObject | JsonLdObject[] | null | undefined; nonce?: string }

/** Renders `<script type="application/ld+json">` safely (works in SSR). */
export function JsonLd({ data, nonce }: JsonLdProps) {
  if (!data || (Array.isArray(data) && data.length === 0)) return null
  return <script type="application/ld+json" nonce={nonce} dangerouslySetInnerHTML={{ __html: serializeJsonLd(data) }} />
}
