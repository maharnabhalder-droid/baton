#!/usr/bin/env python3
"""
Baton Automated Database Migration Runner
Idempotent SQL migration runner for Baton PostgreSQL deployments.
- Inspects and tracks applied migrations in the 'schema_migrations' table.
- Executes backend/migrations/*.sql in deterministic order.
- Safe to run repeatedly (fully idempotent).
- Gracefully skips execution when running against SQLite (local development/testing).
"""

import os
import glob
import logging
from typing import Dict, Any, List
from sqlalchemy import text, create_engine

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger("baton.migrate")

RLS_PROTECTED_TABLES = [
    "sources",
    "snippets",
    "claims",
    "claim_history",
    "rehearsal_attempts",
    "access_requests",
]

def get_engine(target_engine=None):
    if target_engine is not None:
        return target_engine
    from app.database import engine
    return engine

def migration_sort_key(file_path: str) -> str:
    """Ensure natural ordering: rls.sql (001), 002, 003, etc."""
    base = os.path.basename(file_path)
    if base == "rls.sql":
        return "001_rls.sql"
    return base

def run_migrations(target_engine=None, migrations_dir=None) -> Dict[str, Any]:
    """
    Applies all unapplied SQL migrations in order.
    Returns migration execution summary.
    """
    eng = get_engine(target_engine)
    dialect_name = eng.dialect.name

    if dialect_name == "sqlite":
        logger.info("[MIGRATE] SQLite detected. Skipping PostgreSQL raw SQL migrations (SQLAlchemy metadata manages SQLite schema).")
        return {
            "skipped": True,
            "dialect": "sqlite",
            "applied": [],
            "message": "SQLite in use. PostgreSQL raw migrations skipped."
        }

    if migrations_dir is None:
        current_dir = os.path.dirname(os.path.abspath(__file__))
        migrations_dir = os.path.join(current_dir, "migrations")

    sql_files = glob.glob(os.path.join(migrations_dir, "*.sql"))
    sql_files = sorted(sql_files, key=migration_sort_key)

    applied_now: List[str] = []

    # Acquire PostgreSQL session-level advisory lock to serialize concurrent deployment workers
    with eng.connect() as lock_conn:
        lock_conn.execute(text("SELECT pg_advisory_lock(847291);"))
        try:
            with eng.begin() as conn:
                # Create schema_migrations tracker table if not exists
                conn.execute(text("""
                    CREATE TABLE IF NOT EXISTS schema_migrations (
                        filename VARCHAR(255) PRIMARY KEY,
                        applied_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT (NOW() AT TIME ZONE 'UTC')
                    );
                """))

                # Fetch already applied migrations
                res = conn.execute(text("SELECT filename FROM schema_migrations;"))
                applied_set = {row[0] for row in res.fetchall()}

                for fpath in sql_files:
                    fname = os.path.basename(fpath)
                    if fname in applied_set:
                        logger.info(f"[MIGRATE] Already applied: {fname} (skipping)")
                        continue

                    logger.info(f"[MIGRATE] Applying migration: {fname}...")
                    with open(fpath, "r", encoding="utf-8") as f:
                        sql_content = f.read()

                    # Execute via underlying DBAPI driver to support multi-statement files with DO $$ blocks
                    conn.exec_driver_sql(sql_content)

                    conn.execute(
                        text("INSERT INTO schema_migrations (filename) VALUES (:filename);"),
                        {"filename": fname}
                    )
                    applied_now.append(fname)
                    logger.info(f"[MIGRATE] Successfully applied: {fname}")
        finally:
            lock_conn.execute(text("SELECT pg_advisory_unlock(847291);"))

    return {
        "skipped": False,
        "dialect": dialect_name,
        "applied": applied_now,
        "message": f"Applied {len(applied_now)} new migration(s)."
    }

def check_rls_status(target_engine=None) -> Dict[str, Any]:
    """
    Verifies Row-Level Security (RLS) activation on all sensitive multi-tenant tables.
    Returns status dictionary for health checks and startup logging.
    """
    eng = get_engine(target_engine)
    dialect_name = eng.dialect.name

    if dialect_name == "sqlite":
        return {
            "dialect": "sqlite",
            "all_enabled": False,
            "engine_rls_supported": False,
            "tables": {t: False for t in RLS_PROTECTED_TABLES},
            "note": "SQLite development mode: multi-tenant isolation enforced in application logic."
        }

    table_status = {}
    try:
        with eng.connect() as conn:
            query = text("""
                SELECT c.relname, c.relrowsecurity
                FROM pg_class c
                JOIN pg_namespace n ON n.oid = c.relnamespace
                WHERE n.nspname = 'public'
                  AND c.relname IN :table_list;
            """)
            result = conn.execute(query, {"table_list": tuple(RLS_PROTECTED_TABLES)})
            for row in result.fetchall():
                table_status[row[0]] = bool(row[1])

        all_enabled = len(table_status) == len(RLS_PROTECTED_TABLES) and all(table_status.values())
        return {
            "dialect": dialect_name,
            "all_enabled": all_enabled,
            "engine_rls_supported": True,
            "tables": table_status,
            "note": "All protected tables verified with PostgreSQL Row-Level Security." if all_enabled else "One or more tables lack RLS."
        }
    except Exception as e:
        logger.warning(f"[RLS_CHECK] Failed to query PostgreSQL RLS status: {e}")
        return {
            "dialect": dialect_name,
            "all_enabled": False,
            "engine_rls_supported": True,
            "error": "Unable to verify PostgreSQL RLS status due to internal query error.",
            "tables": {}
        }

if __name__ == "__main__":
    import sys
    try:
        result = run_migrations()
        print(f"[MIGRATE RESULT] {result}")
        rls = check_rls_status()
        print(f"[RLS STATUS] {rls}")
    except Exception as exc:
        logger.error(f"[MIGRATE FATAL] Database migration failed: {exc}", exc_info=True)
        sys.exit(1)
