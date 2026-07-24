"""Pydantic request/response schemas for SensorReading."""

import uuid
from datetime import datetime
from typing import Any

from pydantic import BaseModel, ConfigDict, Field

from revolt_api.models.sensor import SensorType


class SensorReadingCreate(BaseModel):
	"""Request body for recording a new sensor reading."""

	timestamp: datetime
	sensor_type: SensorType
	raw_data: dict[str, Any]
	quality: float | None = Field(default=None, ge=0, le=1)


class SensorReadingRead(BaseModel):
	"""Response body for a stored sensor reading."""

	model_config = ConfigDict(from_attributes=True)

	id: uuid.UUID
	timestamp: datetime
	sensor_type: SensorType
	raw_data: dict[str, Any]
	quality: float | None
	created_at: datetime
	updated_at: datetime
