-- 000003_add_project_is_public.sql
-- Adds the is_public flag to projects, enabling anonymous read access
-- to project data when the flag is set to true.

BEGIN;

ALTER TABLE projects
    ADD COLUMN IF NOT EXISTS is_public BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_projects_is_public ON projects (is_public) WHERE is_public = true;

COMMIT;
