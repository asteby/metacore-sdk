-- Initial schema for addon "fiscal_mexico".
-- Host installs this under the isolated schema addon_fiscal_mexico (schema-per-tenant).
CREATE TABLE IF NOT EXISTS fiscal_documents (
  id               uuid PRIMARY KEY,
  org_id           uuid NOT NULL,
  invoice_id       uuid NOT NULL,
  fiscal_uuid      varchar(36),
  rfc_emisor       varchar(13) NOT NULL,
  rfc_receptor     varchar(13) NOT NULL,
  total            numeric(14,2) NOT NULL,
  status           varchar(20) NOT NULL DEFAULT 'draft',
  cfdi_usage       varchar(10),
  payment_form     varchar(4),
  payment_method   varchar(4),
  environment      varchar(16) DEFAULT 'sandbox',
  xml_url          varchar(512),
  pdf_url          varchar(512),
  xml              text,
  stamped_at       timestamptz,
  cancelled_at     timestamptz,
  cancel_reason    varchar(4),
  replacement_uuid varchar(36),
  provider_data    jsonb,
  deleted_at       timestamptz,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS fiscal_docs_invoice_idx     ON fiscal_documents (invoice_id);
CREATE INDEX IF NOT EXISTS fiscal_docs_uuid_idx        ON fiscal_documents (fiscal_uuid);
CREATE INDEX IF NOT EXISTS fiscal_docs_rfc_emisor_idx  ON fiscal_documents (rfc_emisor);
CREATE INDEX IF NOT EXISTS fiscal_docs_rfc_recep_idx   ON fiscal_documents (rfc_receptor);
CREATE INDEX IF NOT EXISTS fiscal_docs_status_idx      ON fiscal_documents (status);
