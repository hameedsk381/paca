-- Composite index for cursor-based keyset pagination on tasks.
-- The query pattern is:
--   WHERE project_id = ? AND (created_at, id) > (?, ?)
--   ORDER BY created_at ASC, id ASC LIMIT n
-- The leading project_id column filters down to a single project before
-- the keyset comparison, avoiding a full-table scan.
CREATE INDEX IF NOT EXISTS idx_tasks_cursor_pagination
    ON tasks (project_id, created_at ASC, id ASC)
    WHERE deleted_at IS NULL;
