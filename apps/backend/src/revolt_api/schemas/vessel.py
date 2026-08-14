"""Pydantic request/response schemas for VesselState."""

import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field

from revolt_api.models.vessel import ControlMode


class Position(BaseModel):
	"""A WGS84 lat/lon pair, the API's wire format for any geometry column."""

	latitude: float
	longitude: float


class VesselStateCreate(BaseModel):
	"""Request body for recording a new VesselState snapshot."""

	timestamp: datetime
	latitude: float
	longitude: float
	heading: float = Field(ge=0, le=360)
	speed_over_ground: float = Field(ge=0)
	battery_voltage: float = Field(ge=0)
	control_mode: ControlMode
	emergency_stop_active: bool = False


class VesselStateRead(BaseModel):
	"""Response body for a stored VesselState row."""

	model_config = ConfigDict(from_attributes=True)

	id: uuid.UUID
	timestamp: datetime
	position: Position
	heading: float
	speed_over_ground: float
	battery_voltage: float
	control_mode: ControlMode
	emergency_stop_active: bool
	created_at: datetime
	updated_at: datetime
