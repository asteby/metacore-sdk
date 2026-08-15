#!/usr/bin/env node
// Copies docs/*.md from this repo (source of truth) into the metacore
// front-door site's docs/sdk/ mirror, applying the site's link/asset
// conventions. Run from the repo root with the target metacore checkout
// path as the only argument.
//
// The docs/es/sdk/ mirror is a real translation, not a copy — it is never
// touched by this script. If EN content changes meaningfully, a human
// (or an agent) needs to update the Spanish translation separately.

import { readFileSync, writeFileSync, mkdirSync, readdirSync, copyFileSync } from 'node:fs'
import { join, basename } from 'node:path'

const target = process.argv[2]
if (!target) {
  console.error('usage: sync-docs-to-metacore.mjs <path-to-metacore-checkout>')
  process.exit(1)
}

// source filename -> destination filename. Every doc mirrored on the
// front-door site must be listed here. index.md is hand-authored on the
// site (VitePress front matter + curated quick links) and is
// intentionally NOT in this map — never overwritten by this script.
const FILE_MAP = {
  'quickstart.md': 'quickstart.md',
  'dynamic-ui.md': 'dynamic-ui.md',
  'addon-cookbook.md': 'addon-cookbook.md',
  'manifest-spec.md': 'manifest-spec.md',
  'capabilities.md': 'capabilities.md',
  'CONSUMER_GUIDE.md': 'consumer-guide.md',
  'PUBLISHING.md': 'publishing.md',
  'internal-setup.md': 'internal-setup.md',
  'addon-publishing.md': 'addon-publishing.md',
  'wasm-abi.md': 'wasm-abi.md',
  'federation.md': 'federation.md',
  'full-page-federation.md': 'full-page-federation.md',
  'modals.md': 'modals.md',
  'bridge-api.md': 'bridge-api.md',
  'slot-priority.md': 'slot-priority.md',
}

// Link-path rewrites applied to every synced file, source basename -> dest
// basename (without extension), so a link to another mirrored doc still
// resolves under the site's extensionless routing convention.
const LINK_RENAMES = Object.fromEntries(
  Object.entries(FILE_MAP).map(([src, dst]) => [src.replace(/\.md$/, ''), dst.replace(/\.md$/, '')]),
)

const SRC_DOCS = join(process.cwd(), 'docs')
const DST_DOCS = join(target, 'docs', 'sdk')

function transform(content) {
  let out = content
  // Repo README-style logo path -> site's static asset path.
  out = out.replace(/src="\.\/assets\/metacore\.svg"/g, 'src="/logo.svg"')
  // Strip .md extension and normalise case on internal doc links:
  // ](./Foo.md) -> ](./foo), ](./Foo.md#anchor) -> ](./foo#anchor)
  for (const [from, to] of Object.entries(LINK_RENAMES)) {
    const re = new RegExp(`\\]\\(\\./${from}\\.md(#[^)]*)?\\)`, 'g')
    out = out.replace(re, (_, anchor = '') => `](./${to}${anchor ?? ''})`)
  }
  // Any remaining bare .md link stripping for files not in the rename map
  // (e.g. a doc linking to itself by a slightly different relative form).
  out = out.replace(/\]\(\.\/([a-zA-Z0-9_-]+)\.md(#[^)]*)?\)/g, (_, name, anchor = '') => `](./${name}${anchor ?? ''})`)
  return out
}

let changed = 0
for (const [src, dst] of Object.entries(FILE_MAP)) {
  const srcPath = join(SRC_DOCS, src)
  const dstPath = join(DST_DOCS, dst)
  const content = transform(readFileSync(srcPath, 'utf8'))
  writeFileSync(dstPath, content)
  changed++
}

// audits/ is copied verbatim — internal design-rationale docs, no link
// rewriting needed (they don't cross-link the mirrored files above).
const srcAudits = join(SRC_DOCS, 'audits')
const dstAudits = join(DST_DOCS, 'audits')
mkdirSync(dstAudits, { recursive: true })
for (const f of readdirSync(srcAudits)) {
  if (f.endsWith('.md')) copyFileSync(join(srcAudits, f), join(dstAudits, f))
}

console.log(`synced ${changed} docs + audits/ into ${DST_DOCS}`)
