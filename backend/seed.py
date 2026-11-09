import os
import secrets
import string
from datetime import datetime, timezone
from sqlalchemy.orm import Session

from app.database import SessionLocal, Base, engine
from app.models import (
    User, Project, ProjectMember, Source, Snippet, Claim, ClaimCitation, ClaimHistory, Gap
)
from app.security import hash_password
from app.services.pipeline import run_claim_pipeline
from app.services.gaps import detect_project_gaps

def generate_random_password(length: int = 14) -> str:
    alphabet = string.ascii_letters + string.digits + "!@#$%^&*"
    return "".join(secrets.choice(alphabet) for _ in range(length))

def seed_orbit_robotics():
    Base.metadata.create_all(bind=engine)
    db: Session = SessionLocal()

    try:
        # Check if already seeded
        existing_proj = db.query(Project).filter(Project.name == "Orbit Robotics Core Platform").first()
        if existing_proj:
            print("[INFO] Orbit Robotics already seeded. Skipping.")
            return

        print("==================================================")
        print("SEEDING ORBIT ROBOTICS SYNTHETIC HANDOVER DATA")
        print("==================================================")

        # 1. Generate users with dynamic random credentials (never hardcoded)
        pwd_approver = os.getenv("SEED_APPROVER_PASSWORD") or generate_random_password()
        pwd_incoming = os.getenv("SEED_INCOMING_PASSWORD") or generate_random_password()
        pwd_restricted = os.getenv("SEED_RESTRICTED_PASSWORD") or generate_random_password()

        approver = User(
            email="departing.lead@orbitrobotics.io",
            hashed_password=hash_password(pwd_approver),
            role="approver",
            mfa_enabled=False,
            needs_password_reset=True
        )
        incoming = User(
            email="incoming.engineer@orbitrobotics.io",
            hashed_password=hash_password(pwd_incoming),
            role="incoming",
            mfa_enabled=False,
            needs_password_reset=True
        )
        restricted_viewer = User(
            email="contractor.auditor@orbitrobotics.io",
            hashed_password=hash_password(pwd_restricted),
            role="restricted",
            mfa_enabled=False,
            needs_password_reset=True
        )

        db.add_all([approver, incoming, restricted_viewer])
        db.flush()

        print("\n[SECURITY NOTICE] Generated initial accounts with force-reset flag:")
        print(f"Approver (Departing Lead): email={approver.email} password={pwd_approver} (MFA required)")
        print(f"Incoming (Successor):     email={incoming.email} password={pwd_incoming}")
        print(f"Restricted Viewer:        email={restricted_viewer.email} password={pwd_restricted}")
        print("Save these credentials securely. They will not be displayed again.\n")

        # 2. Create Project
        project = Project(
            name="Orbit Robotics Core Platform",
            description="Autonomous rover teleoperation, edge compute runtime, and sponsor telemetry gateway.",
            owner_id=approver.id
        )
        db.add(project)
        db.flush()

        # Memberships
        m1 = ProjectMember(project_id=project.id, user_id=approver.id, role="approver")
        m2 = ProjectMember(project_id=project.id, user_id=incoming.id, role="incoming")
        m3 = ProjectMember(project_id=project.id, user_id=restricted_viewer.id, role="restricted")
        db.add_all([m1, m2, m3])
        db.flush()

        # 3. Create Sources with planted traps
        # Source 1: Public Architecture RFC (Hosting Trap A + Build Failure Trap)
        source_rfc = Source(
            project_id=project.id,
            title="RFC-042: Core Control Runtime Architecture",
            file_path="uploads/rfc_042_core_control.md",
            access_level="public",
            author="Elena Vance",
            original_filename="rfc_042_core_control.md",
            file_type="md",
            size_bytes=1420
        )
        # Source 2: Team Slack / Standup Export (Hosting Trap B + Unreasoned Decision Trap)
        source_chat = Source(
            project_id=project.id,
            title="Engineering Slack Handover Excerpts (#dev-core)",
            file_path="uploads/dev_core_slack_handover.txt",
            access_level="team",
            author="Marcus Brody",
            original_filename="dev_core_slack_handover.txt",
            file_type="txt",
            size_bytes=2150
        )
        # Source 3: Team Sprint Backlog (Unfinished Task Trap)
        source_tasks = Source(
            project_id=project.id,
            title="Q3 Core Platform Backlog & Handoff Checklist",
            file_path="uploads/q3_backlog_handoff.md",
            access_level="team",
            author="Elena Vance",
            original_filename="q3_backlog_handoff.md",
            file_type="md",
            size_bytes=1840
        )
        # Source 4: Restricted Finance & Cloud Spend Sheet (Restricted Trap)
        source_finance = Source(
            project_id=project.id,
            title="Restricted Cloud Infrastructure Spend & Contractor Rates",
            file_path="uploads/restricted_finance_q3.csv",
            access_level="restricted",
            author="Finance Dept",
            original_filename="restricted_finance_q3.csv",
            file_type="csv",
            size_bytes=890
        )

        db.add_all([source_rfc, source_chat, source_tasks, source_finance])
        db.flush()

        # 4. Create Snippets
        snippets_to_add = [
            # TRAP 1 (A): Hosting decision 1 (bare-metal)
            Snippet(
                source_id=source_rfc.id,
                project_id=project.id,
                content="Orbit Robotics core control system runs on bare-metal Kubernetes in Frankfurt datacenter for ultra-low latency.",
                location="lines 12-15",
                author="Elena Vance",
                timestamp="2026-08-10 10:00 UTC",
                access_level="public"
            ),
            # TRAP 1 (B): Hosting decision 2 (AWS ECS conflict!)
            Snippet(
                source_id=source_chat.id,
                project_id=project.id,
                content="[2026-09-02 14:10] Marcus Brody: We decided to migrate core control system to AWS ECS clusters because Frankfurt bare-metal was too complex.",
                location="line 34",
                author="Marcus Brody",
                timestamp="2026-09-02 14:10 UTC",
                access_level="team"
            ),
            # TRAP 3: Recurring build failure
            Snippet(
                source_id=source_rfc.id,
                project_id=project.id,
                content="Hardware-in-the-loop CI runner suffers from recurring build failure and flaky race condition during camera packet simulation.",
                location="lines 45-48",
                author="Elena Vance",
                timestamp="2026-08-10 10:15 UTC",
                access_level="public"
            ),
            # TRAP 4: Decision with NO reason
            Snippet(
                source_id=source_chat.id,
                project_id=project.id,
                content="[2026-09-15 09:30] Elena Vance: Switched telemetry bus from NATS to ZeroMQ in branch feat-bus yesterday.",
                location="line 88",
                author="Elena Vance",
                timestamp="2026-09-15 09:30 UTC",
                access_level="team"
            ),
            # TRAP 2: Half-finished sponsor-portal task
            Snippet(
                source_id=source_tasks.id,
                project_id=project.id,
                content="Task: sponsor-portal OAuth token exchange is half-finished and currently in-progress with status unassigned.",
                location="lines 5-8",
                author="Elena Vance",
                timestamp="2026-09-20 16:00 UTC",
                access_level="team"
            ),
            # TRAP 5: Restricted finance sheet
            Snippet(
                source_id=source_finance.id,
                project_id=project.id,
                content="Vendor: AWS Cloud, Monthly Cost: $14,200 USD, Status: Active, Contract Owner: None",
                location="row 2",
                author="Finance Dept",
                timestamp="2026-09-30 08:00 UTC",
                access_level="restricted"
            ),
            Snippet(
                source_id=source_finance.id,
                project_id=project.id,
                content="Contractor: Sensor Calibration Lead, Rate: $185/hr, Total Q3: $42,000 USD",
                location="row 3",
                author="Finance Dept",
                timestamp="2026-09-30 08:00 UTC",
                access_level="restricted"
            ),
        ]
        db.add_all(snippets_to_add)
        db.flush()

        # 5. Run Claims Pipeline
        snippets_payload = [
            {
                "id": s.id,
                "content": s.content,
                "location": s.location,
                "author": s.author,
                "timestamp": s.timestamp,
                "access_level": s.access_level
            }
            for s in snippets_to_add
        ]
        claims_data = run_claim_pipeline(snippets_payload)

        for cdata in claims_data:
            claim = Claim(
                project_id=project.id,
                claim_text=cdata["claim_text"],
                status=cdata.get("status", "Verified"),
                category=cdata.get("category", "technical"),
                confidence=cdata.get("confidence", 0.95),
                created_by=approver.id,
                review_status="pending"
            )
            db.add(claim)
            db.flush()

            for cit in cdata.get("citations", []):
                citation = ClaimCitation(
                    claim_id=claim.id,
                    snippet_id=cit["snippet_id"],
                    quoted_text=cit["quoted_text"]
                )
                db.add(citation)

            hist = ClaimHistory(
                claim_id=claim.id,
                user_id=approver.id,
                action="create",
                previous_state=None,
                new_state=f'{{"claim_text": "{claim.claim_text}", "status": "{claim.status}"}}'
            )
            db.add(hist)

        # 6. Detect and Insert Gaps
        detected_gaps = detect_project_gaps(snippets_payload)
        for gd in detected_gaps:
            gap = Gap(
                project_id=project.id,
                gap_type=gd["gap_type"],
                title=gd["title"],
                description=gd["description"],
                entity_id=gd.get("entity_id")
            )
            db.add(gap)

        db.commit()
        print("[SUCCESS] Orbit Robotics seeded successfully with all 5 planted traps and pipeline claims.")

    finally:
        db.close()

if __name__ == "__main__":
    seed_orbit_robotics()

