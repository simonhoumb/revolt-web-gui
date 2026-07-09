import math
import uuid
from datetime import datetime
from typing import Any

from geoalchemy2.elements import WKTElement
from geoalchemy2.shape import to_shape
from pydantic import BaseModel, ConfigDict, Field, field_validator
from shapely.geometry import Point

from revolt_api.enc_validation import HazardHit, ValidationStatus
from revolt_api.models.mission import MissionStatus
from revolt_api.schemas.vessel import Position


def position_to_wkt(latitude: float, longitude: float) -> WKTElement:
	"""Build a PostGIS-ready WKT element from lat/lon. shapely.Point takes (x, y) i.e. (lon, lat)."""
	return WKTElement(Point(longitude, latitude).wkt, srid=4326)


class WaypointCreate(BaseModel):
	sequence_number: int = Field(ge=0)
	latitude: float
	longitude: float
	target_speed: float = Field(ge=0)
	switch_radius: float = Field(default=5.0, ge=0)
	heading_mode: int = Field(default=0, ge=0, le=2)
	heading_deg: float | None = Field(default=None, ge=0, le=360)


class WaypointUpdate(BaseModel):
	latitude: float | None = None
	longitude: float | None = None
	target_speed: float | None = Field(default=None, ge=0)
	switch_radius: float | None = Field(default=None, ge=0)
	heading_mode: int | None = Field(default=None, ge=0, le=2)
	heading_deg: float | None = Field(default=None, ge=0, le=360)


class WaypointReplace(BaseModel):
	latitude: float
	longitude: float
	target_speed: float = Field(ge=0)
	switch_radius: float = Field(default=5.0, ge=0)
	heading_mode: int = Field(default=0, ge=0, le=2)
	heading_deg: float | None = Field(default=None, ge=0, le=360)


class WaypointRead(BaseModel):
	model_config = ConfigDict(from_attributes=True)

	id: uuid.UUID
	mission_id: uuid.UUID
	sequence_number: int
	position: Position
	target_speed: float
	switch_radius: float
	heading_mode: int
	heading_deg: float | None = Field(validation_alias="heading_rad")
	validation_status: str | None
	reached_at: datetime | None

	@field_validator("position", mode="before")
	@classmethod
	def _wkb_to_position(cls, v: Any) -> Any:
		if isinstance(v, Position):
			return v
		point = to_shape(v)
		return Position(latitude=point.y, longitude=point.x)

	@field_validator("heading_deg", mode="before")
	@classmethod
	def _rad_to_deg(cls, v: Any) -> Any:
		return v if v is None else math.degrees(v)


class MissionCreate(BaseModel):
	name: str
	description: str | None = None
	waypoints: list[WaypointCreate] = Field(default_factory=list)


class MissionUpdate(BaseModel):
	name: str | None = None
	description: str | None = None
	status: MissionStatus | None = None


class MissionRead(BaseModel):
	model_config = ConfigDict(from_attributes=True)

	id: uuid.UUID
	name: str
	description: str | None
	status: MissionStatus
	waypoints: list[WaypointRead]
	started_at: datetime | None
	completed_at: datetime | None
	last_validated_at: datetime | None
	last_validation_status: str | None
	last_sent_at: datetime | None
	last_send_status: str | None
	created_at: datetime
	updated_at: datetime


class MissionSendResult(BaseModel):
	status: str
	waypoint_count: int
	checked_at: datetime
	# The Phase 2 check send_mission() always runs before publishing. "blocked" never reaches this
	# response (send_mission() raises 409 instead) -- these fields only ever carry "safe" or
	# "warning", so the frontend can surface a non-blocking warning instead of it being silently
	# persisted to Mission.last_validation_status with nothing in the UI ever showing it.
	validation_status: ValidationStatus
	hazards: list[HazardHit]


class MissionValidationResult(BaseModel):
	status: ValidationStatus
	hazards: list[HazardHit]
	checked_at: datetime
