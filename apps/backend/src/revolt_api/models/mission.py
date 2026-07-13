import enum
import uuid
from datetime import datetime
from typing import Any

from geoalchemy2 import Geometry
from sqlalchemy import UUID, DateTime, Float, ForeignKey, Integer, String
from sqlalchemy import Enum as SAEnum
from sqlalchemy.orm import Mapped, mapped_column, relationship

from revolt_api.models.base import Base, TimestampMixin, new_uuid


class MissionStatus(enum.StrEnum):
	draft = "draft"
	active = "active"
	paused = "paused"
	completed = "completed"
	aborted = "aborted"


class Mission(Base, TimestampMixin):
	__tablename__ = "mission"

	id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=new_uuid)
	name: Mapped[str] = mapped_column(String, nullable=False)
	description: Mapped[str | None] = mapped_column(String, nullable=True)
	status: Mapped[MissionStatus] = mapped_column(
		SAEnum(MissionStatus, name="mission_status"),
		nullable=False,
		default=MissionStatus.draft,
	)
	started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
	completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

	# Populated by the send flow (ROS2 ack/echo) and the ENC validation endpoint. Plain nullable
	# strings rather than enums since the value set is expected to grow as those flows mature.
	last_validated_at: Mapped[datetime | None] = mapped_column(
		DateTime(timezone=True), nullable=True
	)
	last_validation_status: Mapped[str | None] = mapped_column(String, nullable=True)
	last_sent_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
	last_send_status: Mapped[str | None] = mapped_column(String, nullable=True)

	waypoints: Mapped[list["Waypoint"]] = relationship(
		"Waypoint",
		back_populates="mission",
		order_by="Waypoint.sequence_number",
		cascade="all, delete-orphan",
	)


class Waypoint(Base):
	__tablename__ = "waypoint"

	id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=new_uuid)
	mission_id: Mapped[uuid.UUID] = mapped_column(
		UUID(as_uuid=True),
		ForeignKey("mission.id", ondelete="CASCADE"),
		nullable=False,
	)
	sequence_number: Mapped[int] = mapped_column(Integer, nullable=False)
	position: Mapped[Any] = mapped_column(
		Geometry("POINT", srid=4326, spatial_index=False), nullable=False
	)
	target_speed: Mapped[float] = mapped_column(Float, nullable=False)
	reached_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

	# Mirror custom_msgs/Waypoint.msg fields not otherwise covered: switch_radius is the
	# arrival/turn radius in metres, heading_mode is 0=NONE/1=TANGENT/2=ABSOLUTE, heading_rad is
	# only meaningful when heading_mode is ABSOLUTE. Defaults match "follow the path direction".
	switch_radius: Mapped[float] = mapped_column(Float, nullable=False, default=5.0)
	heading_mode: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
	heading_rad: Mapped[float | None] = mapped_column(Float, nullable=True)
	validation_status: Mapped[str | None] = mapped_column(String, nullable=True)

	mission: Mapped["Mission"] = relationship("Mission", back_populates="waypoints")
