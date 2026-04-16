-- Initial schema for addon "schedules".
CREATE TABLE IF NOT EXISTS schedule_events (
  id             uuid PRIMARY KEY,
  org_id         uuid NOT NULL,
  contact_id     uuid,
  title          varchar(255) NOT NULL,
  description    text,
  starts_at      timestamptz NOT NULL,
  ends_at        timestamptz NOT NULL,
  location       varchar(512),
  category       varchar(32) DEFAULT 'appointment',
  status         varchar(24) NOT NULL DEFAULT 'scheduled',
  confirmed_at   timestamptz,
  cancelled_at   timestamptz,
  cancel_reason  varchar(255),
  deleted_at     timestamptz,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS sched_contact_idx  ON schedule_events (contact_id);
CREATE INDEX IF NOT EXISTS sched_starts_idx   ON schedule_events (starts_at);
CREATE INDEX IF NOT EXISTS sched_status_idx   ON schedule_events (status);
