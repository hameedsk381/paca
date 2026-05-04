-- 000004_add_plugins.sql
-- Adds the plugin registry and system-level extension point settings tables.
-- Idempotent: uses IF NOT EXISTS / ON CONFLICT DO NOTHING.

BEGIN;

-- -------------------------------------------------------------------------
-- PLUGINS
-- Core registry of installed plugins.  Each row represents one installed
-- plugin version.  The manifest JSONB column stores the full plugin.json
-- contents (routes, extension points, event subscriptions, etc.).
-- -------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS plugins (
    id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    name         TEXT        NOT NULL,
    version      TEXT        NOT NULL DEFAULT '0.0.0',
    manifest     JSONB       NOT NULL DEFAULT '{}'::jsonb,
    enabled      BOOLEAN     NOT NULL DEFAULT TRUE,
    installed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Human-readable plugin identifier must be globally unique.
CREATE UNIQUE INDEX IF NOT EXISTS uni_plugins_name ON plugins (name);

-- -------------------------------------------------------------------------
-- PLUGIN EXTENSION SETTINGS
-- System-wide, admin-managed ordering and visibility overrides for each
-- extension point registration.  There are no per-user overrides; the super
-- admin configures these settings and they apply to all users.
-- The settings JSONB stores { order, hidden } for a specific (plugin,
-- extension_point) pair.
-- -------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS plugin_extension_settings (
    id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    plugin_id       UUID        NOT NULL,
    extension_point TEXT        NOT NULL,
    settings        JSONB       NOT NULL DEFAULT '{}'::jsonb,
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT fk_pes_plugin_id
        FOREIGN KEY (plugin_id)
        REFERENCES plugins(id)
        ON DELETE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS uni_plugin_extension_settings
    ON plugin_extension_settings (plugin_id, extension_point);

COMMIT;
