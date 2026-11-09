-- Baton Database Migration 002: Foreign Keys, Token Versioning & Lookup Indexes
-- Safe for execution on Neon PostgreSQL without altering RLS policies

-- 1. Add token_version column to users for server-side session revocation
ALTER TABLE users ADD COLUMN IF NOT EXISTS token_version INTEGER DEFAULT 1 NOT NULL;

-- 2. Foreign Key Constraint on audit_logs.user_id -> users(id)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'fk_audit_logs_user_id'
    ) THEN
        ALTER TABLE audit_logs
            ADD CONSTRAINT fk_audit_logs_user_id
            FOREIGN KEY (user_id)
            REFERENCES users(id)
            ON DELETE CASCADE;
    END IF;
END $$;

-- 3. Lookup Performance Indexes (Idempotent)
CREATE INDEX IF NOT EXISTS idx_audit_logs_user_id ON audit_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_project_id ON audit_logs(project_id);

-- Composite index for fast membership and role resolution (dependencies.py:75)
CREATE INDEX IF NOT EXISTS idx_project_members_project_user ON project_members(project_id, user_id);

-- Foreign key lookup indexes across core project relations
CREATE INDEX IF NOT EXISTS idx_sources_project_id ON sources(project_id);
CREATE INDEX IF NOT EXISTS idx_snippets_project_id ON snippets(project_id);
CREATE INDEX IF NOT EXISTS idx_claims_project_id ON claims(project_id);
CREATE INDEX IF NOT EXISTS idx_gaps_project_id ON gaps(project_id);
CREATE INDEX IF NOT EXISTS idx_handover_acks_project_id ON handover_acks(project_id);
CREATE INDEX IF NOT EXISTS idx_project_invites_project_id ON project_invites(project_id);

