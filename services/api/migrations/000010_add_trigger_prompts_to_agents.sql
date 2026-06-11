-- Add per-trigger system prompt columns to the agents table.
-- The executor appends the matching column to the base system_prompt at runtime
-- depending on how the agent was invoked (task assignment / comment / chat).

ALTER TABLE agents
    ADD COLUMN IF NOT EXISTS task_trigger_prompt        TEXT NOT NULL DEFAULT '',
    ADD COLUMN IF NOT EXISTS doc_comment_trigger_prompt TEXT NOT NULL DEFAULT '',
    ADD COLUMN IF NOT EXISTS chat_trigger_prompt        TEXT NOT NULL DEFAULT '';
