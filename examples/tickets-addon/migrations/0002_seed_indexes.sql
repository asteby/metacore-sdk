-- Composite indexes for common query patterns.

-- Board views filter by (status, priority) and order by created_at.
CREATE INDEX IF NOT EXISTS tickets_board_idx
  ON tickets (org_id, status, priority, created_at DESC)
  WHERE deleted_at IS NULL;

-- "My queue" view: assignee + open/in_progress ordered by due date.
CREATE INDEX IF NOT EXISTS tickets_my_queue_idx
  ON tickets (org_id, assignee_id, status, due_at)
  WHERE deleted_at IS NULL;

-- Comment timeline per ticket.
CREATE INDEX IF NOT EXISTS ticket_comments_timeline_idx
  ON ticket_comments (ticket_id, created_at);
