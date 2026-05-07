-- 000006_add_plugin_view_type.sql
-- Extends the sprint_views.view_type CHECK constraint to allow 'plugin' as a valid view type.
-- Plugin views store their plugin_id and plugin_component inside the config JSONB column.

BEGIN;

ALTER TABLE sprint_views
    DROP CONSTRAINT IF EXISTS sprint_views_view_type_check;

ALTER TABLE sprint_views
    ADD CONSTRAINT sprint_views_view_type_check
    CHECK (view_type IN ('table', 'board', 'roadmap', 'plugin'));

COMMIT;
