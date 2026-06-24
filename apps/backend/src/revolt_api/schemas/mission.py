import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field

from revolt_api.models.mission import MissionStatus
from revolt_api.schemas.vessel import Position


class WaypointCreate(BaseModel):
	sequence_number: int = Field(ge=0)
	latitude: float
	longitude: float
	target_speed: float = Field(ge=0)


class WaypointRead(BaseModel):
	model_config = ConfigDict(from_attributes=True)

	id: uuid.UUID
	mission_id: uuid.UUID
	sequence_number: int
	position: Position
	target_speed: float
	reached_at: datetime | None


class MissionCreate(BaseModel):
	name: str
	description: str | None = None
	waypoints: list[WaypointCreate] = Field(default_factory=list)


class MissionRead(BaseModel):
	model_config = ConfigDict(from_attributes=True)

	id: uuid.UUID
	name: str
	description: str | None
	status: MissionStatus
	waypoints: list[WaypointRead]
	started_at: datetime | None
	completed_at: datetime | None
	created_at: datetime
	updated_at: datetime
