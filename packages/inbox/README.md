# @asteby/metacore-inbox

Channel-agnostic inbox components (email, WhatsApp, team chat). Everything
channel-specific arrives through props and adapters; nothing is hardcoded.
Dependencies: `react` and `lucide-react` only. The package is `sideEffects: false`
and every export is tree-shakeable.

```bash
pnpm add @asteby/metacore-inbox lucide-react
```

Tailwind v4 must scan the package (same as other metacore UI packages):

```css
@source "../node_modules/@asteby/metacore-inbox/dist/**/*.{js,mjs}";
```

Styling uses the semantic theme tokens (`bg-card`, `text-muted-foreground`,
`border-border`, `ring-ring`, `bg-primary`), so light/dark follows the host theme.

## Pieces

| Export | Purpose |
| --- | --- |
| `InboxProvider` | `locale` (`es` default, `en`) and partial `labels` overrides. Optional; every component also takes `labels`. |
| `ConversationList` | Virtualized listbox (fixed row height, thousands of rows). `items`, `selectedId`, `onSelect`, `onEndReached`, `loading`, `error`, `onRetry`. |
| `ThreadView` | Grouped messages, collapsible quotes, attachments, delivery status. `messages`, `title`, `actions`, `footer`, `onOpenAttachment`, `onRetrySend`. |
| `Composer` | Light rich text (markdown subset, outputs `text` + safe `html`), attachments, autosaved drafts, send-as identity. Ref handle: `focus()`, `clear()`. |
| `HtmlSandboxFrame` | Untrusted HTML in a script-less sandboxed iframe with strict CSP. Remote images blocked until the user clicks load. |
| `ProposalCard` | AI-suggested action with confirm / dismiss. |
| `useInboxShortcuts`, `ShortcutsHelp` | `j k e r a # c / cmd+enter ?`, remappable via `keymap`. |
| `EmptyState`, `ErrorState`, `ListSkeleton`, `ThreadSkeleton` | Polished states. |

## Example

```tsx
const [selected, setSelected] = useState<string | null>(null)
const composer = useRef<ComposerHandle>(null)

useInboxShortcuts({
  next: () => move(1),
  prev: () => move(-1),
  reply: () => composer.current?.focus(),
  archive: () => archive(selected),
})

<InboxProvider locale={i18n.language}>
  <ConversationList items={rows} selectedId={selected} onSelect={setSelected} onEndReached={loadMore} />
  <ThreadView messages={messages} title={subject} footer={
    <Composer ref={composer} draftKey={selected ?? undefined} identities={identities}
      onSend={({ text, html, identityId, attachments }) => api.send(...)} />
  } />
</InboxProvider>
```

## Security model of `HtmlSandboxFrame`

- `sandbox="allow-same-origin allow-popups allow-popups-to-escape-sandbox"`: no
  `allow-scripts`, so nothing executes. `allow-same-origin` exists only to
  measure the document height from the host; without scripts it cannot be
  abused, and the CSP also sets `default-src 'none'`.
- CSP in the document: no scripts, no network except images; `img-src` is
  `data: blob: cid:` until the user opts in (then `https:`/`http:`, optionally
  rewritten through `rewriteImageUrl` for an image proxy).
- The HTML is also sanitized with DOMParser (scripts, iframes, forms, `on*`
  attributes, `javascript:` links removed). The iframe boundary is the real
  defence; the sanitizer is a second layer.
- `cid:` images resolve through `message.inlineResources`.
- Styles never leak in or out: the document is isolated.

## Drafts, attachments, adapters

`draftStore` (`load/save/remove`) defaults to localStorage; swap it for an API.
`uploadAttachment(file)` uploads on pick and returns a server reference; without
it, `onSend` receives the raw `File` objects.

## Borradores y sandbox HTML

- `createLocalDraftStore(prefix)` guarda el texto de los borradores en
  localStorage. Usa un prefijo por usuario/tenant
  (`metacore.inbox.draft:${userId}:`) y llama a `store.clear()` al cerrar
  sesión o cambiar de cuenta.
- El iframe del HTML recibido NUNCA debe combinar `allow-scripts` con
  `allow-same-origin`. El sanitizador es propio (el repo no depende de
  DOMPurify); la frontera real es el sandbox del iframe más la CSP. Con
  `rewriteImageUrl`, la CSP limita `img-src` al origen del proxy.
