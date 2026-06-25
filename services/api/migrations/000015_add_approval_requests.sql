CREATE TYPE approval_status AS ENUM ('pending', 'approved', 'rejected');

CREATE TABLE approval_requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    agent_id UUID NOT NULL REFERENCES ai_agents(id) ON DELETE CASCADE,
    conversation_id UUID NOT NULL,
    requested_action TEXT NOT NULL,
    action_details JSONB NOT NULL DEFAULT '{}'::jsonb,
    status approval_status NOT NULL DEFAULT 'pending',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    resolved_at TIMESTAMPTZ,
    resolved_by UUID REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX idx_approval_requests_project_status ON approval_requests(project_id, status);
