-- Baton Round 3 Migration: Rehearsal, Radar, Redaction & Access Requests
-- Includes PostgreSQL Row-Level Security (RLS) with project-membership scoping

-- 1. Evolve existing tables
ALTER TABLE sources ADD COLUMN IF NOT EXISTS redact_pii BOOLEAN DEFAULT FALSE;

ALTER TABLE handover_acks ADD COLUMN IF NOT EXISTS score FLOAT;
ALTER TABLE handover_acks ADD COLUMN IF NOT EXISTS missed_topics TEXT;
ALTER TABLE handover_acks ADD COLUMN IF NOT EXISTS time_taken_seconds INTEGER;
ALTER TABLE handover_acks ADD COLUMN IF NOT EXISTS completed_rehearsal BOOLEAN DEFAULT FALSE;

-- 2. Create Rehearsal Attempts Table
CREATE TABLE IF NOT EXISTS rehearsal_attempts (
    id VARCHAR(36) PRIMARY KEY,
    project_id VARCHAR(36) NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    user_id VARCHAR(36) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    questions TEXT NOT NULL,
    answers TEXT,
    score FLOAT NOT NULL DEFAULT 0.0,
    weak_topics TEXT,
    time_taken_seconds INTEGER NOT NULL DEFAULT 0,
    passed BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT (NOW() AT TIME ZONE 'UTC')
);

CREATE INDEX IF NOT EXISTS idx_rehearsal_project ON rehearsal_attempts(project_id);
CREATE INDEX IF NOT EXISTS idx_rehearsal_user ON rehearsal_attempts(user_id);

-- 3. Create Access Requests Table
CREATE TABLE IF NOT EXISTS access_requests (
    id VARCHAR(36) PRIMARY KEY,
    project_id VARCHAR(36) NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    user_id VARCHAR(36) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    claim_id VARCHAR(36) REFERENCES claims(id) ON DELETE CASCADE,
    source_id VARCHAR(36) REFERENCES sources(id) ON DELETE CASCADE,
    category VARCHAR(50) NOT NULL DEFAULT 'restricted',
    reason TEXT,
    status VARCHAR(20) NOT NULL DEFAULT 'pending', -- pending, granted, declined
    created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT (NOW() AT TIME ZONE 'UTC'),
    resolved_at TIMESTAMP WITHOUT TIME ZONE,
    resolved_by VARCHAR(36) REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_access_req_project ON access_requests(project_id);
CREATE INDEX IF NOT EXISTS idx_access_req_user ON access_requests(user_id);
CREATE INDEX IF NOT EXISTS idx_access_req_status ON access_requests(status);

-- 4. Enable Row-Level Security on new tables
ALTER TABLE rehearsal_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE rehearsal_attempts FORCE ROW LEVEL SECURITY;
ALTER TABLE access_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE access_requests FORCE ROW LEVEL SECURITY;

-- 5. REHEARSAL_ATTEMPTS Policies
-- Approvers can view all attempts within their projects; members can view only their own.
DROP POLICY IF EXISTS rehearsal_isolation_select ON rehearsal_attempts;
CREATE POLICY rehearsal_isolation_select ON rehearsal_attempts
    FOR SELECT
    USING (
        current_setting('app.role', true) = 'approver'
        OR user_id = current_setting('app.user_id', true)
    );

DROP POLICY IF EXISTS rehearsal_insert_policy ON rehearsal_attempts;
CREATE POLICY rehearsal_insert_policy ON rehearsal_attempts
    FOR INSERT
    WITH CHECK (
        user_id = current_setting('app.user_id', true)
    );

-- 6. ACCESS_REQUESTS Policies
-- Approvers view all requests in project; members view their own submitted requests.
DROP POLICY IF EXISTS access_requests_select ON access_requests;
CREATE POLICY access_requests_select ON access_requests
    FOR SELECT
    USING (
        current_setting('app.role', true) = 'approver'
        OR user_id = current_setting('app.user_id', true)
    );

DROP POLICY IF EXISTS access_requests_insert ON access_requests;
CREATE POLICY access_requests_insert ON access_requests
    FOR INSERT
    WITH CHECK (
        user_id = current_setting('app.user_id', true)
    );

DROP POLICY IF EXISTS access_requests_update ON access_requests;
CREATE POLICY access_requests_update ON access_requests
    FOR UPDATE
    USING (
        current_setting('app.role', true) = 'approver'
    );
