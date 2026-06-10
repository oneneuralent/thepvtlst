-- Memory blocks table for Letta-style in-context memory management
-- Allows agents to maintain editable memory blocks that stay in context

CREATE TABLE IF NOT EXISTS memory_blocks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  label TEXT NOT NULL, -- e.g., "user_preferences", "agent_persona", "current_objectives"
  description TEXT NOT NULL, -- What this block stores
  value TEXT NOT NULL, -- The actual content (tokens placed in context)
  char_limit INTEGER DEFAULT 2000, -- Max characters for this block
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- Ensure each workspace has unique labels
  UNIQUE(workspace_id, label)
);

-- Index for quick lookup by workspace
CREATE INDEX idx_memory_blocks_workspace ON memory_blocks(workspace_id);

-- Updated at trigger
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_memory_blocks_updated_at
  BEFORE UPDATE ON memory_blocks
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Enable RLS
ALTER TABLE memory_blocks ENABLE ROW LEVEL SECURITY;

-- Policies: workspace members can read/write their memory blocks
CREATE POLICY "Users can read memory blocks in their workspaces"
  ON memory_blocks FOR SELECT
  USING (workspace_id IN (
    SELECT id FROM workspaces WHERE owner_id = auth.uid()
  ));

CREATE POLICY "Users can insert memory blocks in their workspaces"
  ON memory_blocks FOR INSERT
  WITH CHECK (workspace_id IN (
    SELECT id FROM workspaces WHERE owner_id = auth.uid()
  ));

CREATE POLICY "Users can update memory blocks in their workspaces"
  ON memory_blocks FOR UPDATE
  USING (workspace_id IN (
    SELECT id FROM workspaces WHERE owner_id = auth.uid()
  ));

CREATE POLICY "Users can delete memory blocks in their workspaces"
  ON memory_blocks FOR DELETE
  USING (workspace_id IN (
    SELECT id FROM workspaces WHERE owner_id = auth.uid()
  ));

-- Default memory blocks for new workspaces
-- These will be created via application logic, not triggers
