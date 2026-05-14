-- {{ADDON_KEY}} addon — initial schema.
--
-- Tables declared in `manifest.json#model_definitions` are auto-migrated by
-- the kernel's dynamic migration runner. This file is for anything the
-- declarative schema can't express: enums, partial indexes, materialized
-- views, etc. Applied once at install time, inside the addon's schema
-- (search_path = addon_{{ADDON_KEY}}, public).

-- Example: a partial index for the common "list pending" query.
CREATE INDEX IF NOT EXISTS idx_{{ADDON_KEY}}_items_pending
  ON {{ADDON_KEY}}_items (created_at DESC)
  WHERE status = 'pending';
