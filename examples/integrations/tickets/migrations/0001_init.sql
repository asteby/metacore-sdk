-- Initial schema for addon "tickets".
CREATE TABLE IF NOT EXISTS tickets (
  id                uuid PRIMARY KEY,
  org_id            uuid NOT NULL,
  title             varchar(255) NOT NULL,
  description       text,
  status            varchar(24) NOT NULL DEFAULT 'open',
  priority          varchar(16) DEFAULT 'medium',
  category          varchar(32),
  assignee_id       uuid,
  contact_id        uuid,
  resolution_notes  text,
  resolved_at       timestamptz,
  tags              jsonb,
  deleted_at        timestamptz,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS tickets_title_idx     ON tickets (title);
CREATE INDEX IF NOT EXISTS tickets_status_idx    ON tickets (status);
CREATE INDEX IF NOT EXISTS tickets_priority_idx  ON tickets (priority);
CREATE INDEX IF NOT EXISTS tickets_assignee_idx  ON tickets (assignee_id);
CREATE INDEX IF NOT EXISTS tickets_contact_idx   ON tickets (contact_id);
