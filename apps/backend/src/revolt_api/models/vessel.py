"""The VesselState table model: a single point-in-time snapshot of vessel telemetry."""

import enum
import uuid
from datetime import datetime
from typing import Any

from geoalchemy2 import Geometry
from sqlalchemy import UUID, Boolean, DateTime, Float
from sqlalchemy import Enum as SAEnum
from sqlalchemy.orm import Mapped, mapped_column

from revolt_api.models.base import Base, TimestampMixin, new_uuid


class ControlMode(enum.StrEnum):
	"""Mirrors the /control_mode ROS2 topic's values."""

	manual = "manual"
	manual_assisted = "manual_assisted"
	autonomous = "autonomous"
	miscommunication = "miscommunication"


class VesselState(Base, TimestampMixin):
	"""A single point-in-time snapshot of vessel position, heading, and status."""

	__tablename__ = "vessel_state"

	id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=new_uuid)
	timestamp: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
	position: Mapped[Any] = mapped_column(
		Geometry("POINT", srid=4326, spatial_index=False), nullable=False
	)
	heading: Mapped[float] = mapped_column(Float, nullable=False)
	speed_over_ground: Mapped[float] = mapped_column(Float, nullable=False)
	battery_voltage: Mapped[float] = mapped_column(Float, nullable=False)
	control_mode: Mapped[ControlMode] = mapped_column(
		SAEnum(ControlMode, name="control_mode"), nullable=False
	)
	emergency_stop_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
