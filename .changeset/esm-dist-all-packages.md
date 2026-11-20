---
'@asteby/metacore-agent-workspace': patch
'@asteby/metacore-ai-chat': patch
'@asteby/metacore-app-providers': patch
'@asteby/metacore-auth': patch
'@asteby/metacore-automations': patch
'@asteby/metacore-billing': patch
'@asteby/metacore-dataload': patch
'@asteby/metacore-i18n': patch
'@asteby/metacore-inbox': patch
'@asteby/metacore-integrations': patch
'@asteby/metacore-marketplace': patch
'@asteby/metacore-notifications': patch
'@asteby/metacore-org-ai': patch
'@asteby/metacore-permissions': patch
'@asteby/metacore-pwa': patch
'@asteby/metacore-setup-wizard': patch
'@asteby/metacore-starter-core': patch
'@asteby/metacore-starter-monaco': patch
'@asteby/metacore-theme': patch
'@asteby/metacore-tools': patch
'@asteby/metacore-webhooks': patch
'@asteby/metacore-websocket': patch
---

Postbuild fix-dist-esm-imports: los imports relativos de dist/ llevan extension (.js) para que Node ESM los resuelva; i18n importa sus JSON con `with { type: 'json' }`.
