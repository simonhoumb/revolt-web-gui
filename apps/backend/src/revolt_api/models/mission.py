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

	mission: Mapped["Mission"] = relationship("Mission", back_populates="waypoints")
