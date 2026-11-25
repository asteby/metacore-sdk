# @asteby/metacore-support-embed

Support widget for a company's site (design: `DISENO-CANALES-SOPORTE.md` §3.4, §4, §5). Three pieces:

- **`loader.js`** (about 11 KB, 4.5 KB gzip, no dependencies): creates the iframe from the public channel id and presents it as a floating launcher, inline in the page or as a push panel.
- **in-code embed** (`SupportEmbed` / `mountSupportEmbed`): the same frame without an iframe, for sites that ship their own front end.
- **frame app** (`frame.js`): React app that runs inside the iframe, served by the Hub from its own origin. It is a
  composition: `SupportThread` (`@asteby/metacore-support-ui`) over `createSupportApi` with `createEmbedTransport`
  (`@asteby/metacore-sdk/support`), primitives from `@asteby/metacore-ui`, texts from `@asteby/metacore-i18n`
  (`supportThread.*`, es/en) and the tokens of `@asteby/metacore-theme`. No new visual component, no own CSS.

`pnpm build` runs `tsc` (library, `dist/*.js`) and `tsup` (`dist/embed/loader.js` IIFE and `dist/embed/frame.js`
ESM with everything bundled: the frame's CSP is `script-src 'self'`). The Hub copies them with
`scripts/sync-support-embed.mjs` and pins the version and the SHA-384 (WP-24).

## Snippet (what the company pastes)

Floating launcher (the default; no JavaScript needed, everything comes from `data-*`):

```html
<script async src="https://HUB/embed/support/v1/loader.js" integrity="sha384-…" crossorigin="anonymous"
        data-channel="sch_…" data-locale="es-MX"></script>
```

Embedded in the page (inline): put a container where the chat should live and point the loader at it.

```html
<div id="ayuda"></div>
<script async src="https://HUB/embed/support/v1/loader.js" integrity="sha384-…" crossorigin="anonymous"
        data-channel="sch_…" data-mode="inline" data-target="#ayuda" data-height="640"></script>
```

Push (an edge rail that slides a panel in and pushes the page aside): `data-mode="push"`.

Commands, before or after the script loads (calls made before it loads are queued and replayed in order):

```html
<script>
  window.MetacoreSupport = window.MetacoreSupport || function () {
    (window.MetacoreSupport.q = window.MetacoreSupport.q || []).push(arguments)
  }
  MetacoreSupport('init', { mode: 'push', width: 440, position: 'bottom-left' }) // overrides, optional
  MetacoreSupport('identify', { token: '<JWT signed by your server>' })          // optional: identified mode
  MetacoreSupport('on', 'unread', function (n) { /* badge */ })
</script>
```

### Display modes

| mode | what it does | settings it honours |
| --- | --- | --- |
| `floating` (default) | launcher in the corner + floating panel | `position`, `offset`, `width` (`panel_width`), `launcher_shape`, `launcher_label` |
| `inline` | the iframe is mounted INSIDE the element `target` resolves to; no launcher, no close button | `target` (`inline_target`, default `#metacore-support`), `height` (`inline_height`, 200-2000, default 600) |
| `push` | full-height rail on the edge; opening it slides the panel in and shifts `<body>` (its margin is restored on close/unmount) | `position` (edge), `width` (`panel_width`, 280-720, default 400), `launcher_label` (vertical label) |

If the target of `inline` is not in the DOM yet (the snippet sits in `<head>`, or the app renders it later) the loader
waits for it with a `MutationObserver` for 10 s; if it never appears the widget removes itself silently and the page is
untouched. The selector is only ever passed to `document.querySelector` inside a `try/catch`.

Where each value comes from, highest priority first: `MetacoreSupport('init'|'mount', …)` > `data-*` of the script >
the channel's validated public profile (`display_mode`, `inline_target`, `inline_height`, `panel_width`, `offset`,
`launcher_shape`, `launcher_label`, `position`; all optional, default `floating`) > built-in defaults. The client's
implementation wins. The loader only learns the profile's mode once the frame delivers it, so when the profile says
`inline` the iframe is first parked hidden and then moved into the target (which reloads it once). Set
`data-mode="inline"` to create it straight in the target and skip that extra load.

| `data-*` | `init` option | |
| --- | --- | --- |
| `data-channel` | `channel` | public channel id `sch_…` (required) |
| `data-mode` | `mode` | `floating` \| `inline` \| `push` |
| `data-target` | `target` | CSS selector, `inline` only |
| `data-height`, `data-width`, `data-offset` | `height`, `width`, `offset` | px |
| `data-position` | `position` | `bottom-right` \| `bottom-left` |
| `data-launcher-shape`, `data-launcher-label` | `launcherShape`, `launcherLabel` | `round` \| `rounded` \| `square`; text |
| `data-locale` | `locale` | `es-MX`, `en`… |
| `data-autostart="false"` | | do not mount until `MetacoreSupport('mount')` |

### Commands (`MetacoreSupport(name, …args)`)

`init(opts)` (before mounting it configures; once mounted it only re-lays-out), `mount(opts?)`, `unmount()`,
`identify({token})`, `open()`, `close()`, `toggle()` (`open/close/toggle` do nothing in `inline`), `setLanguage('en')`
(reloads the frame in that language; the identity is re-sent), `logout()` / `reset()` (deletes the visitor token and the
identity) and `on('unread', fn)`. The frame URL is derived from the loader's own `src` (`…/loader.js` ->
`…/frame?channel=…&locale=…`): there is no URL inside the package.

## In your own code (no loader)

If you ship your own front end you can mount the widget yourself. It is the same `SupportFrame`/`SupportThread` over the
same `createEmbedTransport` (same origin check and session), without an iframe. The page must load the SDK CSS
(`@asteby/metacore-theme` plus the Tailwind sources of `metacore-ui`/`support-ui`). The Hub endpoints are yours to
supply: nothing is fixed in the package.

React:

```tsx
import { SupportEmbed } from '@asteby/metacore-support-embed'

<SupportEmbed
  channel="sch_…"
  baseUrl="https://HUB"                       // omit for same origin
  sessionPath="/v1/support/embed/sessions"    // what your Hub serves
  apiBase="/v1/support/embed"
  mode="inline"                               // or "floating" | "push"; omit to use the channel profile
  height={640}
  identity={jwtFromYourServer}                // optional, see below
  onUnread={(n) => setBadge(n)}
/>
```

`floating`/`push` also accept `open`/`onOpenChange` to control the panel, and `width`, `offset`, `position`,
`launcherShape` and `launcherLabel`.

Without React:

```ts
import { mountSupportEmbed } from '@asteby/metacore-support-embed'

const embed = mountSupportEmbed(document.getElementById('ayuda')!, { channel: 'sch_…', sessionPath, apiBase, baseUrl, mode: 'inline' })
embed.identify(jwt)   // or null for anonymous
embed.update({ mode: 'push' })
embed.unmount()
```

Trade-off: in this form the page's own JavaScript shares a realm with the session token (it lives only in the transport's
closure: it is not written to the DOM, logged or returned). The loader keeps the widget in a sandboxed iframe on the
Hub's origin; prefer it when you do not control every script on the page.

## Identity: only the signed JWT verifies the visitor

Identified mode is **only** the JWT that the company's server signs (HS256, `iss` = channel, `aud` = `support.embed`,
`exp - iat <= 600 s`): the Hub verifies the signature and trusts nothing else. This differs from the `link` widget, whose
`Link('identify', { name, email, … })` forwards identity data that the page declares **without a signature**: that
verifies nobody (any script can claim any email). Here `identify` accepts only `{ token }` with a JWT shape; `name`,
`email` and identity `data-*` attributes are not read. If a visitor's name or email must count, put it in the signed
token.

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
