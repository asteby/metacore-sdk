-- Initial schema for addon "fiscal_mx".
-- Host installs this under the isolated schema addon_fiscal_mx (schema-per-tenant).
CREATE TABLE IF NOT EXISTS cfdi_invoices (
  id            uuid PRIMARY KEY,
  org_id        uuid NOT NULL,
  folio         varchar(32) NOT NULL UNIQUE,
  uuid_sat      varchar(36),
  rfc_emisor    varchar(13) NOT NULL,
  rfc_receptor  varchar(13) NOT NULL,
  total         numeric(14,2) NOT NULL,
  status        varchar(20) NOT NULL DEFAULT 'draft',
  uso_cfdi      varchar(10),
  xml           text,
  stamped_at    timestamptz,
  deleted_at    timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS cfdi_rfc_emisor_idx   ON cfdi_invoices (rfc_emisor);
CREATE INDEX IF NOT EXISTS cfdi_rfc_receptor_idx ON cfdi_invoices (rfc_receptor);
CREATE INDEX IF NOT EXISTS cfdi_status_idx       ON cfdi_invoices (status);
CREATE INDEX IF NOT EXISTS cfdi_uuid_sat_idx     ON cfdi_invoices (uuid_sat);
