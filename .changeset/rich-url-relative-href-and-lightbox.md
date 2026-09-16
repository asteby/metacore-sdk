---
"@asteby/metacore-runtime-react": minor
---

Fix `ensureHref` mangling every root-relative asset URL (the platform's own
convention for locally-served files — uploads, hub-generated images,
printable documents) into a broken `https:///storage/…` link (scheme + empty
host). Root-relative paths (`/storage/…`), protocol-relative (`//…`) and
fully-qualified URLs now pass through unchanged; only a bare host like
`github.com/x` still gets `https://` prefixed.

Also: clicking an image thumbnail (table cell, detail dialog, linkified free
text — anywhere `ImageThumbnail`/`MediaValue` renders) now opens a full-size
**preview dialog** instead of navigating to the raw file in a new tab. This
is the platform-wide click-to-zoom behavior; no caller builds its own
lightbox.
