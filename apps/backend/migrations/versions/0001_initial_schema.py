"""Initial schema

Revision ID: 0001
Revises:
Create Date: 2026-06-24

"""

from collections.abc import Sequence

import geoalchemy2
import sqlalchemy as sa
from alembic import op

revision: str = "0001"
down_revision: str | None = None
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
	op.create_table(
		"vessel_state",
		sa.Column("id", sa.UUID(), nullable=False),
		sa.Column("timestamp", sa.DateTime(timezone=True), nullable=False),
		sa.Column(
			"position",
			geoalchemy2.types.Geometry("POINT", srid=4326, spatial_index=False),
			nullable=False,
		),
		sa.Column("heading", sa.Float(), nullable=False),
		sa.Column("speed_over_ground", sa.Float(), nullable=False),
		sa.Column("battery_voltage", sa.Float(), nullable=False),
		sa.Column(
			"control_mode",
			sa.Enum(
				"manual",
				"manual_assisted",
				"autonomous",
				"miscommunication",
				name="control_mode",
			),
			nullable=False,
		),
		sa.Column("emergency_stop_active", sa.Boolean(), nullable=False),
		sa.Column(
			"created_at",
			sa.DateTime(timezone=True),
			server_default=sa.text("now()"),
			nullable=False,
		),
		sa.Column(
			"updated_at",
			sa.DateTime(timezone=True),
			server_default=sa.text("now()"),
			nullable=False,
		),
		sa.PrimaryKeyConstraint("id"),
	)
	op.create_index(
		"idx_vessel_state_position",
		"vessel_state",
		["position"],
		postgresql_using="gist",
	)
	op.create_index(
		"idx_vessel_state_timestamp",
		"vessel_state",
		["timestamp"],
	)

	op.create_table(
		"sensor_reading",
		sa.Column("id", sa.UUID(), nullable=False),
		sa.Column("timestamp", sa.DateTime(timezone=True), nullable=False),
		sa.Column(
			"sensor_type",
			sa.Enum(
				"gnss",
				"imu",
				"thruster_stern_port",
				"thruster_stern_starboard",
				"thruster_bow",
				"battery",
				"environmental_stern",
				"environmental_bow",
				"camera",
				"lidar",
				"radar",
				name="sensor_type",
			),
			nullable=False,
		),
		sa.Column("raw_data", sa.dialects.postgresql.JSONB(), nullable=False),
		sa.Column("quality", sa.Float(), nullable=True),
		sa.Column(
			"created_at",
			sa.DateTime(timezone=True),
			server_default=sa.text("now()"),
			nullable=False,
		),
		sa.Column(
			"updated_at",
			sa.DateTime(timezone=True),
			server_default=sa.text("now()"),
			nullable=False,
		),
		sa.PrimaryKeyConstraint("id"),
	)
	op.create_index(
		"idx_sensor_reading_type_timestamp",
		"sensor_reading",
		["sensor_type", "timestamp"],
	)

	op.create_table(
		"mission",
		sa.Column("id", sa.UUID(), nullable=False),
		sa.Column("name", sa.String(), nullable=False),
		sa.Column("description", sa.String(), nullable=True),
		sa.Column(
			"status",
			sa.Enum(
				"draft",
				"active",
				"paused",
				"completed",
				"aborted",
				name="mission_status",
			),
			nullable=False,
		),
		sa.Column("started_at", sa.DateTime(timezone=True), nullable=True),
		sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
		sa.Column(
			"created_at",
			sa.DateTime(timezone=True),
			server_default=sa.text("now()"),
			nullable=False,
		),
		sa.Column(
			"updated_at",
			sa.DateTime(timezone=True),
			server_default=sa.text("now()"),
			nullable=False,
		),
		sa.PrimaryKeyConstraint("id"),
	)

	op.create_table(
		"waypoint",
		sa.Column("id", sa.UUID(), nullable=False),
		sa.Column("mission_id", sa.UUID(), nullable=False),
		sa.Column("sequence_number", sa.Integer(), nullable=False),
		sa.Column(
			"position",
			geoalchemy2.types.Geometry("POINT", srid=4326, spatial_index=False),
			nullable=False,
		),
		sa.Column("target_speed", sa.Float(), nullable=False),
		sa.Column("reached_at", sa.DateTime(timezone=True), nullable=True),
		sa.ForeignKeyConstraint(["mission_id"], ["mission.id"], ondelete="CASCADE"),
		sa.PrimaryKeyConstraint("id"),
	)
	op.create_index(
		"idx_waypoint_position",
		"waypoint",
		["position"],
		postgresql_using="gist",
	)
	op.create_index(
		"idx_waypoint_mission_seq",
		"waypoint",
		["mission_id", "sequence_number"],
	)


def downgrade() -> None:
	op.drop_index("idx_waypoint_mission_seq", table_name="waypoint")
	op.drop_index("idx_waypoint_position", table_name="waypoint")
	op.drop_table("waypoint")

	op.drop_table("mission")

	op.drop_index("idx_sensor_reading_type_timestamp", table_name="sensor_reading")
	op.drop_table("sensor_reading")

	op.drop_index("idx_vessel_state_timestamp", table_name="vessel_state")
	op.drop_index("idx_vessel_state_position", table_name="vessel_state")
	op.drop_table("vessel_state")

	sa.Enum(name="mission_status").drop(op.get_bind())
	sa.Enum(name="sensor_type").drop(op.get_bind())
	sa.Enum(name="control_mode").drop(op.get_bind())
