"""Mission/waypoint CRUD plus the validate/send/start/pause/terminate command endpoints.

A thin HTTP boundary only: each command endpoint just fetches the mission (404 boundary) and
delegates to services/mission_service.py, which owns the actual orchestration.
"""

import math
import uuid
from collections.abc import Sequence

from fastapi import APIRouter, Depends, Header, HTTPException
from sqlalchemy import delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from revolt_api.audit import log_action
from revolt_api.bridge import RosBridgeClient, get_bridge
from revolt_api.database import get_db
from revolt_api.models.mission import Mission, MissionStatus, Waypoint
from revolt_api.schemas.mission import (
	MissionCreate,
	MissionExecutionResult,
	MissionRead,
	MissionSendResult,
	MissionUpdate,
	MissionValidationResult,
	WaypointCreate,
	WaypointRead,
	WaypointReplace,
	WaypointUpdate,
	position_to_wkt,
)
from revolt_api.services import mission_service

router = APIRouter(prefix="/api")


async def _session_id(x_session_id: str | None = Header(default=None)) -> str:
	return x_session_id or "unknown"


async def _get_mission_or_404(db: AsyncSession, mission_id: uuid.UUID) -> Mission:
	result = await db.execute(
		select(Mission).where(Mission.id == mission_id).options(selectinload(Mission.waypoints))
	)
	mission = result.scalar_one_or_none()
	if mission is None:
		raise HTTPException(status_code=404, detail="Mission not found")
	return mission


async def _get_waypoint_or_404(
	db: AsyncSession, mission_id: uuid.UUID, waypoint_id: uuid.UUID
) -> Waypoint:
	waypoint = await db.get(Waypoint, waypoint_id)
	if waypoint is None or waypoint.mission_id != mission_id:
		raise HTTPException(status_code=404, detail="Waypoint not found")
	return waypoint


def _heading_rad(heading_deg: float | None) -> float | None:
	"""Convert the API's degrees to the radians Waypoint.heading_rad is stored in."""
	return None if heading_deg is None else math.radians(heading_deg)


def _new_waypoint(sequence_number: int, body: WaypointCreate | WaypointReplace) -> Waypoint:
	return Waypoint(
		sequence_number=sequence_number,
		position=position_to_wkt(body.latitude, body.longitude),
		target_speed=body.target_speed,
		switch_radius=body.switch_radius,
		heading_mode=body.heading_mode,
		heading_rad=_heading_rad(body.heading_deg),
	)


@router.get("/missions", response_model=list[MissionRead])
async def list_missions(
	status: MissionStatus | None = None,
	db: AsyncSession = Depends(get_db),  # noqa: B008
) -> Sequence[Mission]:
	"""List missions, newest first, optionally filtered by status."""
	stmt = (
		select(Mission).options(selectinload(Mission.waypoints)).order_by(Mission.created_at.desc())
	)
	if status is not None:
		stmt = stmt.where(Mission.status == status)
	result = await db.execute(stmt)
	return result.scalars().all()


@router.post("/missions", response_model=MissionRead, status_code=201)
async def create_mission(
	body: MissionCreate,
	session_id: str = Depends(_session_id),  # noqa: B008
	db: AsyncSession = Depends(get_db),  # noqa: B008
) -> Mission:
	"""Create a new mission, optionally with its initial waypoints."""
	mission = Mission(name=body.name, description=body.description, status=MissionStatus.draft)
	for wp in body.waypoints:
		mission.waypoints.append(_new_waypoint(wp.sequence_number, wp))
	db.add(mission)
	await db.commit()
	await log_action(db, session_id=session_id, action="mission.create", params={"name": body.name})
	return await _get_mission_or_404(db, mission.id)


@router.get("/missions/loaded", response_model=MissionRead)
async def get_loaded_mission(db: AsyncSession = Depends(get_db)) -> Mission:  # noqa: B008
	"""The mission Mission Control currently targets.

	Whichever mission was most recently sent to the vessel (see
	mission_service.get_loaded_mission_id). Registered before /missions/{mission_id} so FastAPI
	doesn't try to parse "loaded" as a mission_id UUID.
	"""
	loaded_id = await mission_service.get_loaded_mission_id(db)
	if loaded_id is None:
		raise HTTPException(status_code=404, detail="No mission is currently loaded on the vessel.")
	return await _get_mission_or_404(db, loaded_id)


@router.get("/missions/{mission_id}", response_model=MissionRead)
async def get_mission(
	mission_id: uuid.UUID,
	db: AsyncSession = Depends(get_db),  # noqa: B008
) -> Mission:
	"""Fetch one mission by id."""
	return await _get_mission_or_404(db, mission_id)


@router.patch("/missions/{mission_id}", response_model=MissionRead)
async def update_mission(
	mission_id: uuid.UUID,
	body: MissionUpdate,
	session_id: str = Depends(_session_id),  # noqa: B008
	db: AsyncSession = Depends(get_db),  # noqa: B008
) -> Mission:
	"""Partially update a mission's name/description/status; unset fields are left unchanged."""
	mission = await _get_mission_or_404(db, mission_id)
	if body.name is not None:
		mission.name = body.name
	if body.description is not None:
		mission.description = body.description
	if body.status is not None:
		mission.status = body.status
	await db.commit()
	await db.refresh(mission)
	await log_action(
		db,
		session_id=session_id,
		action="mission.update",
		params=body.model_dump(exclude_none=True),
	)
	return mission


@router.delete("/missions/{mission_id}", status_code=204)
async def delete_mission(
	mission_id: uuid.UUID,
	session_id: str = Depends(_session_id),  # noqa: B008
	db: AsyncSession = Depends(get_db),  # noqa: B008
) -> None:
	"""Delete a mission and its waypoints (cascade)."""
	result = await db.execute(delete(Mission).where(Mission.id == mission_id))
	if result.rowcount == 0:
		raise HTTPException(status_code=404, detail="Mission not found")
	await db.commit()
	await log_action(
		db, session_id=session_id, action="mission.delete", params={"mission_id": str(mission_id)}
	)


@router.post("/missions/{mission_id}/waypoints", response_model=WaypointRead, status_code=201)
async def create_waypoint(
	mission_id: uuid.UUID,
	body: WaypointCreate,
	session_id: str = Depends(_session_id),  # noqa: B008
	db: AsyncSession = Depends(get_db),  # noqa: B008
) -> Waypoint:
	"""Append a new waypoint to a mission, auto-assigning the next sequence number."""
	mission = await _get_mission_or_404(db, mission_id)
	max_seq = await db.scalar(
		select(func.max(Waypoint.sequence_number)).where(Waypoint.mission_id == mission_id)
	)
	next_seq = 0 if max_seq is None else max_seq + 1
	waypoint = _new_waypoint(next_seq, body)
	waypoint.mission_id = mission_id
	db.add(waypoint)
	mission_service.invalidate_load_if_edited(mission)
	await db.commit()
	await db.refresh(waypoint)
	await log_action(
		db,
		session_id=session_id,
		action="waypoint.create",
		params={"mission_id": str(mission_id), "sequence_number": next_seq},
	)
	return waypoint


@router.patch("/missions/{mission_id}/waypoints/{waypoint_id}", response_model=WaypointRead)
async def update_waypoint(
	mission_id: uuid.UUID,
	waypoint_id: uuid.UUID,
	body: WaypointUpdate,
	session_id: str = Depends(_session_id),  # noqa: B008
	db: AsyncSession = Depends(get_db),  # noqa: B008
) -> Waypoint:
	"""Partially update one waypoint; unset fields are left unchanged."""
	waypoint = await _get_waypoint_or_404(db, mission_id, waypoint_id)
	if (body.latitude is None) != (body.longitude is None):
		raise HTTPException(
			status_code=400, detail="latitude and longitude must be provided together"
		)
	if body.latitude is not None and body.longitude is not None:
		waypoint.position = position_to_wkt(body.latitude, body.longitude)
	if body.target_speed is not None:
		waypoint.target_speed = body.target_speed
	if body.switch_radius is not None:
		waypoint.switch_radius = body.switch_radius
	if body.heading_mode is not None:
		waypoint.heading_mode = body.heading_mode
	if body.heading_deg is not None:
		waypoint.heading_rad = _heading_rad(body.heading_deg)
	mission = await db.get(Mission, mission_id)
	if mission is not None:
		mission_service.invalidate_load_if_edited(mission)
	await db.commit()
	await db.refresh(waypoint)
	await log_action(
		db,
		session_id=session_id,
		action="waypoint.update",
		params={"mission_id": str(mission_id), "waypoint_id": str(waypoint_id)},
	)
	return waypoint


@router.delete("/missions/{mission_id}/waypoints/{waypoint_id}", status_code=204)
async def delete_waypoint(
	mission_id: uuid.UUID,
	waypoint_id: uuid.UUID,
	session_id: str = Depends(_session_id),  # noqa: B008
	db: AsyncSession = Depends(get_db),  # noqa: B008
) -> None:
	"""Delete one waypoint and resequence the remaining waypoints to close the gap."""
	waypoint = await _get_waypoint_or_404(db, mission_id, waypoint_id)
	await db.delete(waypoint)
	await db.flush()
	remaining = (
		(
			await db.execute(
				select(Waypoint)
				.where(Waypoint.mission_id == mission_id)
				.order_by(Waypoint.sequence_number)
			)
		)
		.scalars()
		.all()
	)
	# sequence_number must stay a contiguous 0..N-1 route order; a deleted middle waypoint would
	# otherwise leave a gap.
	for i, wp in enumerate(remaining):
		wp.sequence_number = i
	mission = await db.get(Mission, mission_id)
	if mission is not None:
		mission_service.invalidate_load_if_edited(mission)
	await db.commit()
	await log_action(
		db,
		session_id=session_id,
		action="waypoint.delete",
		params={"mission_id": str(mission_id), "waypoint_id": str(waypoint_id)},
	)


@router.put("/missions/{mission_id}/waypoints", response_model=list[WaypointRead])
async def replace_waypoints(
	mission_id: uuid.UUID,
	body: list[WaypointReplace],
	session_id: str = Depends(_session_id),  # noqa: B008
	db: AsyncSession = Depends(get_db),  # noqa: B008
) -> Sequence[Waypoint]:
	"""Replace a mission's entire waypoint list in one operation (reorder/bulk edit)."""
	mission = await _get_mission_or_404(db, mission_id)
	mission.waypoints = [_new_waypoint(i, item) for i, item in enumerate(body)]
	mission_service.invalidate_load_if_edited(mission)
	await db.commit()
	await log_action(
		db,
		session_id=session_id,
		action="mission.waypoints.replace",
		params={"mission_id": str(mission_id), "count": len(body)},
	)
	mission = await _get_mission_or_404(db, mission_id)
	return mission.waypoints


@router.post("/missions/{mission_id}/validate", response_model=MissionValidationResult)
async def validate_mission(
	mission_id: uuid.UUID,
	session_id: str = Depends(_session_id),  # noqa: B008
	db: AsyncSession = Depends(get_db),  # noqa: B008
) -> MissionValidationResult:
	"""Authoritative server-side ENC hazard check (Phase 2).

	See mission_service.validate_mission for the full rationale and how this relates to
	send_mission's own re-validation.
	"""
	mission = await _get_mission_or_404(db, mission_id)
	return await mission_service.validate_mission(db, session_id, mission)


@router.post("/missions/{mission_id}/send", response_model=MissionSendResult)
async def send_mission(
	mission_id: uuid.UUID,
	session_id: str = Depends(_session_id),  # noqa: B008
	db: AsyncSession = Depends(get_db),  # noqa: B008
	bridge: RosBridgeClient = Depends(get_bridge),  # noqa: B008
) -> MissionSendResult:
	"""Re-validate and publish the mission's full waypoint list to the vessel.

	See mission_service.send_mission for the full rationale.
	"""
	mission = await _get_mission_or_404(db, mission_id)
	return await mission_service.send_mission(db, bridge, session_id, mission)


@router.post("/missions/{mission_id}/start", response_model=MissionExecutionResult)
async def start_mission(
	mission_id: uuid.UUID,
	session_id: str = Depends(_session_id),  # noqa: B008
	db: AsyncSession = Depends(get_db),  # noqa: B008
	bridge: RosBridgeClient = Depends(get_bridge),  # noqa: B008
) -> MissionExecutionResult:
	"""Start executing a mission (fresh start or resume-from-pause).

	See mission_service.start_mission for the full rationale.
	"""
	mission = await _get_mission_or_404(db, mission_id)
	return await mission_service.start_mission(db, bridge, session_id, mission)


@router.post("/missions/{mission_id}/pause", response_model=MissionExecutionResult)
async def pause_mission(
	mission_id: uuid.UUID,
	session_id: str = Depends(_session_id),  # noqa: B008
	db: AsyncSession = Depends(get_db),  # noqa: B008
	bridge: RosBridgeClient = Depends(get_bridge),  # noqa: B008
) -> MissionExecutionResult:
	"""Pause a mission, snapshotting a resume point.

	See mission_service.pause_mission for the full rationale.
	"""
	mission = await _get_mission_or_404(db, mission_id)
	return await mission_service.pause_mission(db, bridge, session_id, mission)


@router.post("/missions/{mission_id}/terminate", response_model=MissionExecutionResult)
async def terminate_mission(
	mission_id: uuid.UUID,
	session_id: str = Depends(_session_id),  # noqa: B008
	db: AsyncSession = Depends(get_db),  # noqa: B008
	bridge: RosBridgeClient = Depends(get_bridge),  # noqa: B008
) -> MissionExecutionResult:
	"""Terminate/abort a mission.

	See mission_service.terminate_mission for the full rationale.
	"""
	mission = await _get_mission_or_404(db, mission_id)
	return await mission_service.terminate_mission(db, bridge, session_id, mission)
