-- Initial schema for addon "tickets".
-- Host installs these tables under the isolated schema addon_tickets.

CREATE TABLE IF NOT EXISTS tickets (
  id          uuid PRIMARY KEY,
  org_id      uuid NOT NULL,
  number      varchar(32)  NOT NULL,
  title       varchar(255) NOT NULL,
  description text,
  status      varchar(20)  NOT NULL DEFAULT 'open',
  priority    varchar(10)  NOT NULL DEFAULT 'normal',
  assignee_id uuid,
  reporter_id uuid NOT NULL,
  due_at      timestamptz,
  resolved_at timestamptz,
  tags        jsonb,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  deleted_at  timestamptz,
  CONSTRAINT  tickets_number_unique UNIQUE (org_id, number)
);

CREATE INDEX IF NOT EXISTS tickets_status_idx      ON tickets (status);
CREATE INDEX IF NOT EXISTS tickets_priority_idx    ON tickets (priority);
CREATE INDEX IF NOT EXISTS tickets_assignee_idx    ON tickets (assignee_id);
CREATE INDEX IF NOT EXISTS tickets_reporter_idx    ON tickets (reporter_id);

CREATE TABLE IF NOT EXISTS ticket_comments (
  id         uuid PRIMARY KEY,
  org_id     uuid NOT NULL,
  ticket_id  uuid NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
  author_id  uuid NOT NULL,
  body       text NOT NULL,
  mentions   jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ticket_comments_ticket_idx ON ticket_comments (ticket_id);
