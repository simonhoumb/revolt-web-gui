"""Audit log table

Revision ID: 0002
Revises: 0001
Create Date: 2026-06-24

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0002"
down_revision: str | None = "0001"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
	op.create_table(
		"audit_log",
		sa.Column(
			"id",
			sa.UUID(),
			server_default=sa.text("gen_random_uuid()"),
			nullable=False,
		),
		sa.Column(
			"timestamp",
			sa.DateTime(timezone=True),
			server_default=sa.text("now()"),
			nullable=False,
		),
		sa.Column("session_id", sa.Text(), nullable=False),
		sa.Column("user_id", sa.Text(), nullable=True),
		sa.Column("action", sa.Text(), nullable=False),
		sa.Column("severity", sa.Text(), server_default=sa.text("'info'"), nullable=False),
		sa.Column("params", sa.dialects.postgresql.JSONB(), nullable=True),
		sa.Column("vessel_snapshot", sa.dialects.postgresql.JSONB(), nullable=True),
		sa.PrimaryKeyConstraint("id"),
	)
	op.create_index("idx_audit_log_timestamp", "audit_log", ["timestamp"])
	op.create_index("idx_audit_log_session_id", "audit_log", ["session_id"])
	op.create_index("idx_audit_log_action", "audit_log", ["action"])


def downgrade() -> None:
	op.drop_index("idx_audit_log_action", table_name="audit_log")
	op.drop_index("idx_audit_log_session_id", table_name="audit_log")
	op.drop_index("idx_audit_log_timestamp", table_name="audit_log")
	op.drop_table("audit_log")
