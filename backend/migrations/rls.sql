-- Baton PostgreSQL Row-Level Security (RLS) Migration
-- Policies are keyed to session variables:
--   app.user_id: current authenticated user UUID
--   app.role: current user role ('approver', 'incoming', 'restricted')

-- 1. Enable RLS on tables
ALTER TABLE sources ENABLE ROW LEVEL SECURITY;
ALTER TABLE snippets ENABLE ROW LEVEL SECURITY;
ALTER TABLE claims ENABLE ROW LEVEL SECURITY;
ALTER TABLE claim_history ENABLE ROW LEVEL SECURITY;

-- 2. SOURCES Policies
DROP POLICY IF EXISTS sources_isolation_policy ON sources;
CREATE POLICY sources_isolation_policy ON sources
    FOR SELECT
    USING (
        current_setting('app.role', true) = 'approver'
        OR (
            current_setting('app.role', true) = 'incoming'
            AND access_level IN ('public', 'team')
        )
        OR (
            current_setting('app.role', true) = 'restricted'
            AND access_level = 'public'
        )
    );

DROP POLICY IF EXISTS sources_insert_policy ON sources;
CREATE POLICY sources_insert_policy ON sources
    FOR INSERT
    WITH CHECK (
        current_setting('app.role', true) = 'approver'
        OR (
            current_setting('app.role', true) = 'incoming'
            AND access_level IN ('public', 'team')
        )
    );

-- 3. SNIPPETS Policies
DROP POLICY IF EXISTS snippets_isolation_policy ON snippets;
CREATE POLICY snippets_isolation_policy ON snippets
    FOR SELECT
    USING (
        current_setting('app.role', true) = 'approver'
        OR (
            current_setting('app.role', true) = 'incoming'
            AND access_level IN ('public', 'team')
        )
        OR (
            current_setting('app.role', true) = 'restricted'
            AND access_level = 'public'
        )
    );

-- 4. CLAIMS Policies
-- A claim is visible only if the viewer may see ALL of its cited snippets.
DROP POLICY IF EXISTS claims_visibility_policy ON claims;
CREATE POLICY claims_visibility_policy ON claims
    FOR SELECT
    USING (
        current_setting('app.role', true) = 'approver'
        OR (
            current_setting('app.role', true) = 'incoming'
            AND NOT EXISTS (
                SELECT 1 FROM claim_citations cc
                JOIN snippets s ON cc.snippet_id = s.id
                WHERE cc.claim_id = claims.id AND s.access_level = 'restricted'
            )
        )
        OR (
            current_setting('app.role', true) = 'restricted'
            AND NOT EXISTS (
                SELECT 1 FROM claim_citations cc
                JOIN snippets s ON cc.snippet_id = s.id
                WHERE cc.claim_id = claims.id AND s.access_level IN ('team', 'restricted')
            )
        )
    );

-- 5. CLAIM HISTORY Policies
DROP POLICY IF EXISTS claim_history_isolation_policy ON claim_history;
CREATE POLICY claim_history_isolation_policy ON claim_history
    FOR SELECT
    USING (
        current_setting('app.role', true) = 'approver'
        OR EXISTS (
            SELECT 1 FROM claims c
            WHERE c.id = claim_history.claim_id
        )
    );

