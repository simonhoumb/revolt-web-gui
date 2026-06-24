import enum
import uuid
from datetime import datetime

from sqlalchemy import UUID, DateTime, Float
from sqlalchemy import Enum as SAEnum
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from revolt_api.models.base import Base, TimestampMixin, new_uuid


class SensorType(enum.StrEnum):
	gnss = "gnss"
	imu = "imu"
	thruster_stern_port = "thruster_stern_port"
	thruster_stern_starboard = "thruster_stern_starboard"
	thruster_bow = "thruster_bow"
	battery = "battery"
	environmental_stern = "environmental_stern"
	environmental_bow = "environmental_bow"
	camera = "camera"
	lidar = "lidar"
	radar = "radar"


class SensorReading(Base, TimestampMixin):
	__tablename__ = "sensor_reading"

	id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=new_uuid)
	timestamp: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
	sensor_type: Mapped[SensorType] = mapped_column(
		SAEnum(SensorType, name="sensor_type"), nullable=False
	)
	raw_data: Mapped[dict] = mapped_column(JSONB, nullable=False)
	quality: Mapped[float | None] = mapped_column(Float, nullable=True)
