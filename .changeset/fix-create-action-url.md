---
"@asteby/metacore-runtime-react": patch
---

Fix create-placement action submit hitting `/me/undefined/action/...` (400 Invalid record ID). `buildActionUrl` now omits the record segment when there is no record, posting to the collection route `/data/:model/me/action/:action`, so create modals declared as `placement:create` actions work.
