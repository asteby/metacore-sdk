# Facturación Electrónica México (CFDI 4.0)

Addon metacore **portable** — backend Go + frontend federado + migrations — para timbrar y cancelar CFDI ante el SAT vía PAC (factura.com).

## Estructura

```
fiscal_mexico/
├── manifest.json                     # contrato — key=fiscal_mexico
├── migrations/0001_init.sql          # tabla fiscal_documents
├── backend/                          # binario Go (webhook target)
│   ├── go.mod, main.go
│   ├── verify.go   (HMAC + nonce)
│   ├── handlers.go (stamp_fiscal, cancel_fiscal)
│   └── pac.go      (cliente factura.com — stub con firma válida)
├── frontend/                         # bundle federado (React + Vite)
│   ├── vite.config.ts (name=metacore_fiscal_mexico)
│   └── src/
│       ├── plugin.tsx
│       └── modals/
│           ├── StampFiscalModal.tsx
│           └── CancelFiscalModal.tsx
└── build.sh
```

## Qué declara el manifest

| Pieza | Detalle |
|---|---|
| `model_definitions` | `fiscal_documents` (invoice_id, fiscal_uuid, rfc_emisor, rfc_receptor, total, status, xml, etc.) |
| `actions.fiscal_documents[]` | `stamp_fiscal` (modal `fiscal_mexico.stamp_fiscal`), `cancel_fiscal` (modal `fiscal_mexico.cancel_fiscal`) |
| `tools[]` | LLM-facing: `stamp_fiscal` y `cancel_fiscal` con `trigger_keywords` e `input_schema` |
| `hooks` | `fiscal_documents::stamp_fiscal` → `/webhooks/stamp_fiscal`, idem cancel |
| `capabilities` | `http:fetch *.factura.com`, `http:fetch *.sat.gob.mx`, `event:emit fiscal.*` |

## El contrato de "key" en acción

```
manifest.actions[].key = "stamp_fiscal"
    │
    ├─► manifest.hooks["fiscal_documents::stamp_fiscal"] = /webhooks/stamp_fiscal
    │        │
    │        ▼
    │   backend/main.go ─ mux.HandleFunc("POST /webhooks/stamp_fiscal", makeStampHandler(...))
    │        │
    │        ▼
    │   backend/handlers.go ─ branch en X-Metacore-Invocation ("action" UI | "tool" LLM)
    │
    ├─► manifest.actions[].modal = "fiscal_mexico.stamp_fiscal"
    │        │
    │        ▼
    │   frontend/src/plugin.tsx ─ api.registry.registerModal({ slug: "fiscal_mexico.stamp_fiscal", ... })
    │
    └─► manifest.tools[].id = "stamp_fiscal" (mismo key → mismo endpoint)
             │
             ▼
         host expone al LLM con extraction_hints; invoca /webhooks/stamp_fiscal con X-Metacore-Invocation: tool
```

El CLI `metacore build --strict` aplica **5 gates** que garantizan esta alineación:

1. **ValidateContract** — `action.modal = <addon_key>.<action.key>`, hook presente, tool/action endpoints coinciden
2. **scanGo** — cada `hooks[*]` tiene su `HandleFunc(".../<action>", ...)`
3. **scanTS** — cada `action.modal` tiene su `registerModal({slug: ...})`
4. **scanSQL** — migrations no traen `DROP ROLE`, `COPY FROM PROGRAM`, etc.
5. **capabilities lint** — `http:fetch` rechaza `*`, `*.*`, TLD-only

## Build y publicación

```bash
# 1. CLI
(cd metacore && go build -o $HOME/.local/bin/metacore ./cli/)

# 2. Keypair del dev (una vez)
metacore keygen --out ~/.metacore/asteby

# 3. Build + firma del bundle
export METACORE_DEV_KEY=~/.metacore/asteby.pem
./build.sh   # produce fiscal_mexico-1.0.0.tar.gz + .sig

# 4. Publicar al hub
curl -X POST https://hub.asteby.com/v1/addons \
  -H "X-Developer-Key: $MARKETPLACE_DEV_KEY" \
  -F bundle=@fiscal_mexico-1.0.0.tar.gz \
  -F signature=@fiscal_mexico-1.0.0.tar.gz.sig \
  -F developer_id=$DEV_ID
```

## Runtime

- Deploy `backend/` en tu infra (`fiscal.asteby.com:7103`) — el host lo invoca vía webhook firmado; nunca ejecuta tu código Go.
- El host instala el bundle → aplica migration → carga `remoteEntry.js` → registra modals → tool queda disponible (LLM tool, botón en DynamicTable, etc., según el host).
- Cada webhook outbound lleva `X-Metacore-{Host,Tenant,Installation-ID,Invocation,Timestamp,Nonce,Signature}` — replay protection y sandbox por instalación incluidos.

## Environment variables

| Var | Efecto |
|---|---|
| `METACORE_ADDON_SECRET` | Hex del HMAC secret por instalación. Sin él: DEV mode (firma no verificada) |
| `FACTURA_COM_API_KEY`   | Credencial del PAC |
| `FACTURA_COM_ENV`       | `sandbox` (default) o `live` |
