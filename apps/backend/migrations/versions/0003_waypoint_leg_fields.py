"""Waypoint leg fields and mission validation/send status

Revision ID: 0003
Revises: 0002
Create Date: 2026-07-08

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0003"
down_revision: str | None = "0002"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
	op.add_column(
		"waypoint",
		sa.Column("switch_radius", sa.Float(), server_default=sa.text("5.0"), nullable=False),
	)
	op.add_column(
		"waypoint",
		sa.Column("heading_mode", sa.Integer(), server_default=sa.text("0"), nullable=False),
	)
	op.add_column("waypoint", sa.Column("heading_rad", sa.Float(), nullable=True))
	op.add_column("waypoint", sa.Column("validation_status", sa.String(), nullable=True))

	op.add_column(
		"mission", sa.Column("last_validated_at", sa.DateTime(timezone=True), nullable=True)
	)
	op.add_column("mission", sa.Column("last_validation_status", sa.String(), nullable=True))
	op.add_column("mission", sa.Column("last_sent_at", sa.DateTime(timezone=True), nullable=True))
	op.add_column("mission", sa.Column("last_send_status", sa.String(), nullable=True))


def downgrade() -> None:
	op.drop_column("mission", "last_send_status")
	op.drop_column("mission", "last_sent_at")
	op.drop_column("mission", "last_validation_status")
	op.drop_column("mission", "last_validated_at")

	op.drop_column("waypoint", "validation_status")
	op.drop_column("waypoint", "heading_rad")
	op.drop_column("waypoint", "heading_mode")
	op.drop_column("waypoint", "switch_radius")
