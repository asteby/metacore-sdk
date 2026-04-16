-- Initial schema for addon "catalog".
CREATE TABLE IF NOT EXISTS products (
  id           uuid PRIMARY KEY,
  org_id       uuid NOT NULL,
  sku          varchar(64) NOT NULL,
  name         varchar(255) NOT NULL,
  description  text,
  price        numeric(14,2) NOT NULL DEFAULT 0,
  currency     varchar(3) DEFAULT 'MXN',
  stock        integer DEFAULT 0,
  published    boolean DEFAULT false,
  category     varchar(64),
  brand        varchar(64),
  images       jsonb,
  attributes   jsonb,
  deleted_at   timestamptz,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS products_org_sku_uniq ON products (org_id, sku) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS products_sku_idx       ON products (sku);
CREATE INDEX IF NOT EXISTS products_name_idx      ON products (name);
CREATE INDEX IF NOT EXISTS products_category_idx  ON products (category);
CREATE INDEX IF NOT EXISTS products_published_idx ON products (published);
