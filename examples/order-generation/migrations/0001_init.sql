-- order-generation initial migration.
-- Host runs this inside the addon schema (addon_order_generation_<orgshort>)
-- because tenant_isolation is "schema-per-tenant". `SET search_path` is
-- applied automatically by kernel/dynamic.Apply before executing.

-- orders is already created by kernel/dynamic.CreateTable from
-- model_definitions. This file adds cross-column indexes and the
-- sequence used by the addon backend to generate order_number.

CREATE SEQUENCE IF NOT EXISTS order_number_seq START 1000;

CREATE INDEX IF NOT EXISTS idx_orders_created
  ON orders (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_orders_status_pending
  ON orders (created_at DESC)
  WHERE status = 'pending';
