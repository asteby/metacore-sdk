# @asteby/metacore-support-embed

Support widget for a company's site (design: `DISENO-CANALES-SOPORTE.md` §3.4, §4, §5). Two artifacts:

- **`loader.js`** (about 4 KB, no dependencies): creates the iframe and the launcher button from the public channel id.
- **frame app** (`frame.js`): React app that runs inside the iframe, served by the Hub from its own origin. It is a
  composition: `SupportThread` (`@asteby/metacore-support-ui`) over `createSupportApi` with `createEmbedTransport`
  (`@asteby/metacore-sdk/support`), primitives from `@asteby/metacore-ui`, texts from `@asteby/metacore-i18n`
  (`supportThread.*`, es/en) and the tokens of `@asteby/metacore-theme`. No new visual component, no own CSS.

`pnpm build` runs `tsc` (library, `dist/*.js`) and `tsup` (`dist/embed/loader.js` IIFE and `dist/embed/frame.js`
ESM with everything bundled: the frame's CSP is `script-src 'self'`). The Hub copies them with
`scripts/sync-support-embed.mjs` and pins the version and the SHA-384 (WP-24).

## Snippet (what the company pastes)

```html
<script async src="https://HUB/embed/support/v1/loader.js" integrity="sha384-…" crossorigin="anonymous"
        data-channel="sch_…" data-locale="es-MX"></script>
<script>
  window.MetacoreSupport = window.MetacoreSupport || function () {
    (window.MetacoreSupport.q = window.MetacoreSupport.q || []).push(arguments)
  }
  MetacoreSupport('identify', { token: '<JWT signed by your server>' }) // optional: identified mode
</script>
```

API: `identify({token})`, `open()`, `close()`, `logout()` (deletes the visitor token) and `on('unread', fn)`.
The frame URL is derived from the loader's own `src` (`…/loader.js` -> `…/frame?channel=…&locale=…`): there is no
URL inside the package.

## What the Hub must serve in the frame HTML

Everything environmental is injected, nothing is fixed in the package:

```html
<meta name="mc-support-session-path" content="/v1/support/embed/sessions">
<meta name="mc-support-api-base" content="/v1/support/embed">
<!-- optional --> <meta name="mc-support-base-url" content="">  <meta name="mc-support-allow-reopen" content="1">
<link rel="stylesheet" href="frame.css">  <!-- Tailwind v4 build of the SDK packages (see below) -->
<div id="root"></div>
<script type="module" src="frame.js"></script>
```

CSP of the frame: `default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self' https: data:;
connect-src 'self'; frame-ancestors <allowed_origins>`. The package is compatible: no `eval`, no inline script or
style attribute in markup (theme tokens are set through CSSOM), no external fonts or CDNs.

`frame.css` is not produced by this package: it is the Tailwind v4 output the Hub builds with the same `@source`
rules as any host of `@asteby/metacore-ui`/`inbox`/`support-ui` and `@asteby/metacore-theme/index.css` (pending in WP-24).

## Session and security

1. The loader sends `hello` to the iframe with `targetOrigin` = the Hub origin (never `*`) and accepts messages only
   from that iframe's window **and** that origin. Anything else, and anything that does not parse against the strict
   protocol (`src/protocol.ts`), is ignored.
2. The frame takes the parent origin from the first valid `hello` (`event.origin`, only from `window.parent`; it must
   equal `location.ancestorOrigins[0]` when the browser exposes it) and from then on accepts and sends only to that
   origin. That origin is the `parent_origin` the Hub validates against the channel's `allowed_origins`.
3. `createEmbedTransport` opens the session (`POST …/sessions`), renews it at 80 % of the TTL and retries once on
   `session_expired`. The session token lives only in its closure: it is not returned, logged nor posted to the page.
   The host site only ever sees the profile-derived launcher data (`profile` message).
4. Anonymous mode: no `identify`. Identified mode: the company's server signs a JWT (HS256, `iss` = channel,
   `aud` = `support.embed`, `exp - iat <= 600 s`, see §3.5); the loader hands it to the frame, which sends it as
   `identity` when opening and renewing sessions. The frame only checks the JWT shape; the Hub verifies it.
5. The visitor token is kept in the iframe's `localStorage` (partitioned by top-level site); if storage is blocked the
   visitor is ephemeral.
6. The public profile is validated again in the frame (`sanitizeProfile`, same limits as the contract): an invalid
   color, a non-https logo or contact link, or overlong text is dropped, never applied. The brand color becomes
   `--primary`/`--primary-foreground` (text via `onColor`, contrast raised in dark mode). Messages are rendered by
   `SupportThread` (text only, links `http(s)` with `rel="noopener noreferrer nofollow"`).

Language: `data-locale` -> `navigator.language` -> profile `default_locale` -> `es-MX`. Channel texts (launcher,
greeting, offline) are data from the profile; fixed thread texts are `supportThread.*` (es/en).

Attachments: the frame passes no `uploadAttachment`, so `SupportThread` shows no attach button (design §4.6).
Reopen is hidden unless the Hub marks `mc-support-allow-reopen` (channel `embed_policy.reopen`).

## Notes for WP-20 / WP-24

- The SSE of a case (`GET …/cases/{id}/events`) is read as `data: <json>` lines carrying callback-event shaped objects
  (`desk_message`, `ai_action`, `desk_resolved`, ...), so the thread reuses `applySupportEvent`. If the Hub streams
  `MessageView` instead, adapt it there or extend `projectSupportEvent`.
- `409 already_resolved` is mapped to the UI code `case_resolved`.
- Polling fallback (§4.3, every 5 s) is not implemented: when SSE fails the transport reconnects with backoff.
