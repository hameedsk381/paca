-- Add description_write trigger prompt column and extend trigger_type constraint.

ALTER TABLE agents
    ADD COLUMN IF NOT EXISTS description_write_trigger_prompt TEXT NOT NULL DEFAULT '';

-- Extend the trigger_type check constraint to include 'description_write'.
ALTER TABLE agent_conversations
    DROP CONSTRAINT IF EXISTS agent_conversations_trigger_type_check;

ALTER TABLE agent_conversations
    ADD CONSTRAINT agent_conversations_trigger_type_check
    CHECK (trigger_type IN ('task_assigned', 'comment_mention', 'chat_message', 'description_write'));
