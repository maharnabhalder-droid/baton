import pytest
from migrate import run_migrations, check_rls_status
from app.database import engine

def test_migration_runner_skips_on_sqlite():
    """Migration runner safely skips raw PostgreSQL DDL scripts when running on SQLite."""
    res = run_migrations(engine)
    assert res["skipped"] is True
    assert res["dialect"] == "sqlite"
    assert res["applied"] == []

def test_migration_runner_idempotence():
    """Running migrations repeatedly is safe and idempotent."""
    res1 = run_migrations(engine)
    res2 = run_migrations(engine)
    assert res1["skipped"] == res2["skipped"]
    assert res2["applied"] == []

def test_check_rls_status_structure():
    """RLS check returns structured status dictionary with dialect and table information."""
    rls = check_rls_status(engine)
    assert "dialect" in rls
    assert "all_enabled" in rls
    assert "tables" in rls
    assert "sources" in rls["tables"]
    assert "snippets" in rls["tables"]

def test_healthz_endpoint_sanitized_for_public(client):
    """Public /healthz returns only service status without leaking internal database or RLS table maps."""
    resp = client.get("/healthz")
    assert resp.status_code == 200
    data = resp.json()
    assert data == {"status": "healthy"}
    assert "database" not in data
    assert "rls" not in data
    assert "tables" not in data


def test_admin_health_endpoint_restricted_to_approvers(client, approver_user, incoming_user):
    """Approvers can inspect RLS status via /api/admin/health; unauthorized callers are blocked."""
    from tests.conftest import create_auth_headers_and_cookies
    app_cookies, app_headers = create_auth_headers_and_cookies(approver_user)
    inc_cookies, inc_headers = create_auth_headers_and_cookies(incoming_user)

    # 1. Unauthenticated -> 401
    unauth_resp = client.get("/api/admin/health")
    assert unauth_resp.status_code == 401

    # 2. Incoming role -> 403
    inc_resp = client.get("/api/admin/health", cookies=inc_cookies, headers=inc_headers)
    assert inc_resp.status_code == 403

    # 3. Approver role -> 200 with full RLS breakdown
    app_resp = client.get("/api/admin/health", cookies=app_cookies, headers=app_headers)
    assert app_resp.status_code == 200
    data = app_resp.json()
    assert data["status"] == "healthy"
    assert "database" in data
    assert "rls" in data
    assert "tables" in data["rls"]


def test_migration_sql_ast_and_syntax_conformance():
    """
    Parses all .sql files in backend/migrations/ to assert defensive DDL standards:
    - Every CREATE POLICY is preceded by a DROP POLICY IF EXISTS for that policy
    - Every ALTER TABLE ADD COLUMN includes IF NOT EXISTS
    - Every table with ENABLE ROW LEVEL SECURITY also has FORCE ROW LEVEL SECURITY
    """
    import os, re, glob
    migrations_dir = os.path.join(os.path.dirname(os.path.dirname(__file__)), "migrations")
    sql_files = glob.glob(os.path.join(migrations_dir, "*.sql"))
    assert len(sql_files) >= 3, f"Expected at least 3 migration files, found {len(sql_files)}"

    for fpath in sql_files:
        with open(fpath, "r", encoding="utf-8") as f:
            content = f.read()

        # Check ALTER TABLE ... ADD COLUMN has IF NOT EXISTS
        add_column_matches = re.findall(r"ALTER\s+TABLE\s+\w+\s+ADD\s+COLUMN\s+(.+?);", content, re.IGNORECASE)
        for col_def in add_column_matches:
            assert "IF NOT EXISTS" in col_def.upper(), f"Missing IF NOT EXISTS in {os.path.basename(fpath)}: {col_def}"

        # Check each CREATE POLICY has a preceding DROP POLICY IF EXISTS
        create_policies = re.findall(r"CREATE\s+POLICY\s+(\w+)\s+ON\s+(\w+)", content, re.IGNORECASE)
        for policy_name, table_name in create_policies:
            drop_pattern = rf"DROP\s+POLICY\s+IF\s+EXISTS\s+{policy_name}\s+ON\s+{table_name}"
            assert re.search(drop_pattern, content, re.IGNORECASE), (
                f"Policy {policy_name} on {table_name} in {os.path.basename(fpath)} lacks preceding DROP POLICY IF EXISTS"
            )

        # Check tables with ENABLE RLS also have FORCE RLS
        enable_rls_tables = re.findall(r"ALTER\s+TABLE\s+(\w+)\s+ENABLE\s+ROW\s+LEVEL\s+SECURITY", content, re.IGNORECASE)
        force_rls_tables = re.findall(r"ALTER\s+TABLE\s+(\w+)\s+FORCE\s+ROW\s+LEVEL\s+SECURITY", content, re.IGNORECASE)
        for tbl in enable_rls_tables:
            assert tbl in force_rls_tables, f"Table {tbl} in {os.path.basename(fpath)} has ENABLE RLS but lacks FORCE RLS"


def test_postgres_live_migration_integration_and_idempotence():
    """
    Live integration test against PostgreSQL when TEST_DATABASE_URL is provided.
    Skipped cleanly when running without a PostgreSQL instance.
    Asserts:
    1. First migration run applies cleanly and enables relrowsecurity and relforcerowsecurity on all 6 tables.
    2. Second migration run is completely idempotent (applied list empty).
    """
    import os
    from sqlalchemy import create_engine, text
    pg_url = os.getenv("TEST_DATABASE_URL")
    if not pg_url or not pg_url.startswith("postgres"):
        pytest.skip("TEST_DATABASE_URL not set or not PostgreSQL; skipping live Postgres integration test.")

    pg_engine = create_engine(pg_url)
    res1 = run_migrations(pg_engine)
    assert res1["skipped"] is False
    assert res1["dialect"] == "postgresql"

    # Verify RLS and Force RLS status on all 6 tables
    with pg_engine.connect() as conn:
        q = text("""
            SELECT c.relname, c.relrowsecurity, c.relforcerowsecurity
            FROM pg_class c
            JOIN pg_namespace n ON n.oid = c.relnamespace
            WHERE n.nspname = 'public'
              AND c.relname IN ('sources', 'snippets', 'claims', 'claim_history', 'rehearsal_attempts', 'access_requests');
        """)
        rows = conn.execute(q).fetchall()
        assert len(rows) == 6, f"Expected 6 protected tables, got {len(rows)}"
        for name, rls_enabled, rls_forced in rows:
            assert rls_enabled is True, f"Table {name} relrowsecurity is not True"
            assert rls_forced is True, f"Table {name} relforcerowsecurity is not True"

    # Run 2 (Idempotence)
    res2 = run_migrations(pg_engine)
    assert res2["skipped"] is False
    assert len(res2["applied"]) == 0
