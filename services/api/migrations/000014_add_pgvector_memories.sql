CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE agent_memories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    agent_id UUID NOT NULL REFERENCES ai_agents(id) ON DELETE CASCADE,
    content TEXT NOT NULL,
    embedding vector(1536),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX agent_memories_embedding_idx ON agent_memories USING hnsw (embedding vector_cosine_ops);
