-- {{ADDON_KEY}} addon — initial schema extras.
--
-- The `Item` model in manifest.json is migrated by the kernel. This file is
-- for what the declarative schema cannot express. Applied once at install
-- time inside the addon schema (search_path = addon_{{ADDON_KEY}}, public).

CREATE INDEX IF NOT EXISTS idx_{{ADDON_KEY}}_items_open
  ON {{ADDON_KEY}}_items (due_at)
  WHERE status = 'open';
