# @asteby/metacore-support-ui

`SupportThread`: the support-case thread of the unified support flow. It lists person,
agent and AI messages, shows the case status, renders attachments (thumbnail, viewer with
download, expired-link notice) and has a composer for text and attachments. It does not know
the instance, the Hub or any URL: the host injects the transport.

It is a composition, not new UI: the thread and composer come from `@asteby/metacore-inbox`
and everything else (badge, alert, dialog, button) from `@asteby/metacore-ui/primitives`.
Strings live in `@asteby/metacore-i18n` under `supportThread.*` (es/en) and follow the host
language; colors are the theme tokens, so light/dark follows the host.

```bash
pnpm add @asteby/metacore-support-ui @asteby/metacore-sdk @asteby/metacore-inbox @asteby/metacore-ui @asteby/metacore-i18n
```

Tailwind v4 must scan the packages like the other metacore UI packages:

```css
@source "../node_modules/@asteby/metacore-support-ui/dist/**/*.{js,mjs}";
@source "../node_modules/@asteby/metacore-inbox/dist/**/*.{js,mjs}";
```

## Usage

```tsx
import { createSupportApi } from '@asteby/metacore-sdk/support'
import { SupportThread } from '@asteby/metacore-support-ui'

// The host owns fetch/auth/realtime. Nothing about endpoints is baked into the component.
const api = createSupportApi((req) => hostFetchJson(req.path, { method: req.method, body: req.body, signal: req.signal }), {
  basePath: '/api/support',
  events: (folio, onEvent) => hostRealtime.subscribe(`support:${folio}`, onEvent), // optional
})

<SupportThread
  api={api}
  folio="OPS-000123"
  authorName="Ana"
  uploadAttachment={(file) => hostUpload(file)} // returns { name, url, content_type, size, expires_at? }
  onReopen={() => reopenCase('OPS-000123')}     // optional: shows "Reopen" on resolved cases
/>
```

`api` only needs `getCase`, `sendMessage` and `subscribe`, so any stand-in works in tests or
demos (see `src/support-thread.test.tsx`).

States: loading, error with retry, empty (the composer stays), open, resolved (solution plus
optional reopen) and closed (no messages accepted). A failed send keeps the message in the
thread marked as not sent, with a retry button that reuses the same idempotency key.
Attachments whose link expired (`expired` or a past `expires_at`) are never linked: they show
an "attachment expired" notice and the viewer explains instead of offering a dead download.

## Contract types and how to sync them

The wire types of the support contract (`SupportCallbackEvent`, `SupportMessageRequest`, ...)
are generated, never copied by hand, from the golden fixtures of the kernel
(`metacore-kernel/support/contract/testdata`):

```bash
node scripts/gen-support-types.mjs --src <path-to>/support/contract/testdata          # regenerates packages/sdk/src/generated/support-contract.ts
node scripts/gen-support-types.mjs --src <path-to>/support/contract/testdata --check  # fails if it drifted (CI)
SUPPORT_CONTRACT_TESTDATA=<path> node --test scripts/gen-support-types.test.mjs       # also checks the committed file
```

Types are inferred from the fixtures: a field missing in any fixture of its family is optional,
and enum-like fields become the observed values plus `string` (receivers must tolerate unknown
values). Run the script whenever the kernel fixtures change and commit the diff; the header of
the generated file carries a hash of the fixtures it came from.
