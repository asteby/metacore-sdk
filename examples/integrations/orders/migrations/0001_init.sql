-- Initial schema for addon "orders".
-- Host installs this under the isolated schema addon_orders (schema-per-tenant).
CREATE TABLE IF NOT EXISTS orders (
  id                uuid PRIMARY KEY,
  org_id            uuid NOT NULL,
  customer_id       uuid,
  status            varchar(24) NOT NULL DEFAULT 'pending',
  payment_status    varchar(24) DEFAULT 'pending',
  total             numeric(14,2) NOT NULL DEFAULT 0,
  shipping_cost     numeric(14,2) DEFAULT 0,
  currency          varchar(3) DEFAULT 'MXN',
  delivery_type     varchar(16) DEFAULT 'pickup',
  shipping_address  varchar(512),
  tracking_number   varchar(128),
  carrier           varchar(64),
  fulfilled_at      timestamptz,
  cancelled_at      timestamptz,
  cancel_reason     varchar(255),
  items             jsonb,
  notes             text,
  deleted_at        timestamptz,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS orders_customer_idx      ON orders (customer_id);
CREATE INDEX IF NOT EXISTS orders_status_idx        ON orders (status);
CREATE INDEX IF NOT EXISTS orders_payment_status_idx ON orders (payment_status);
