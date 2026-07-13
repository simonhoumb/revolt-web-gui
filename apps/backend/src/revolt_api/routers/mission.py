import math
import uuid
from collections.abc import Sequence
from datetime import UTC, datetime

from fastapi import APIRouter, Depends, Header, HTTPException
from sqlalchemy import delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from revolt_api.audit import log_action
from revolt_api.bridge import RosBridgeClient, get_bridge
from revolt_api.bridge.waypoint_codec import expected_ack, waypoint_list_to_ros_dict
from revolt_api.config import settings
from revolt_api.database import get_db
from revolt_api.enc_validation import evaluate_route_hazards
from revolt_api.models.mission import Mission, MissionStatus, Waypoint
from revolt_api.schemas.mission import (
	MissionCreate,
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


def _heading_rad(heading_deg: float | None) -> float | None:
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
	mission = Mission(name=body.name, description=body.description, status=MissionStatus.draft)
	for wp in body.waypoints:
		mission.waypoints.append(_new_waypoint(wp.sequence_number, wp))
	db.add(mission)
	await db.commit()
	await log_action(db, session_id=session_id, action="mission.create", params={"name": body.name})
	return await _get_mission_or_404(db, mission.id)


@router.get("/missions/{mission_id}", response_model=MissionRead)
async def get_mission(
	mission_id: uuid.UUID,
	db: AsyncSession = Depends(get_db),  # noqa: B008
) -> Mission:
	return await _get_mission_or_404(db, mission_id)


@router.patch("/missions/{mission_id}", response_model=MissionRead)
async def update_mission(
	mission_id: uuid.UUID,
	body: MissionUpdate,
	session_id: str = Depends(_session_id),  # noqa: B008
	db: AsyncSession = Depends(get_db),  # noqa: B008
) -> Mission:
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
	await _get_mission_or_404(db, mission_id)
	max_seq = await db.scalar(
		select(func.max(Waypoint.sequence_number)).where(Waypoint.mission_id == mission_id)
	)
	next_seq = 0 if max_seq is None else max_seq + 1
	waypoint = _new_waypoint(next_seq, body)
	waypoint.mission_id = mission_id
	db.add(waypoint)
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
	waypoint = await db.get(Waypoint, waypoint_id)
	if waypoint is None or waypoint.mission_id != mission_id:
		raise HTTPException(status_code=404, detail="Waypoint not found")
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
	waypoint = await db.get(Waypoint, waypoint_id)
	if waypoint is None or waypoint.mission_id != mission_id:
		raise HTTPException(status_code=404, detail="Waypoint not found")
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
	for i, wp in enumerate(remaining):
		wp.sequence_number = i
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
	mission = await _get_mission_or_404(db, mission_id)
	mission.waypoints = [_new_waypoint(i, item) for i, item in enumerate(body)]
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
	"""Authoritative server-side ENC hazard check (Phase 2) against the enc_* PostGIS tables
	(infra/enc-pipeline/ingest_postgis.sh) — independent of whatever chart tiles happen to be
	rendered in the requesting browser's current viewport/zoom. See encValidation.ts's Phase 1
	client-side check (advisory only) and WebApp/CLAUDE.md's ENC validation section for why that
	distinction matters. send_mission() below always re-runs this itself before publishing —
	this endpoint exists so the frontend can show hazard state before the operator attempts a
	send at all, not as the only gate.
	"""
	mission = await _get_mission_or_404(db, mission_id)
	result = await evaluate_route_hazards(
		db, mission.waypoints, settings.safety_margin_m, settings.safety_contour_m
	)
	checked_at = datetime.now(UTC)
	mission.last_validated_at = checked_at
	mission.last_validation_status = result.status
	await db.commit()
	await log_action(
		db,
		session_id=session_id,
		action="mission.validate",
		params={
			"mission_id": str(mission_id),
			"status": result.status,
			"hazard_count": len(result.hazards),
		},
	)
	return MissionValidationResult(status=result.status, hazards=result.hazards, checked_at=checked_at)


@router.post("/missions/{mission_id}/send", response_model=MissionSendResult)
async def send_mission(
	mission_id: uuid.UUID,
	session_id: str = Depends(_session_id),  # noqa: B008
	db: AsyncSession = Depends(get_db),  # noqa: B008
	bridge: RosBridgeClient = Depends(get_bridge),  # noqa: B008
) -> MissionSendResult:
	"""Re-validate (Phase 2), then publish the mission's full waypoint list and wait for the
	sim's /waypoint_list echo to confirm it landed (see RosBridgeClient.publish_and_await_ack).

	Always re-runs the authoritative hazard check itself rather than trusting a client-reported
	"already validated" flag — a route that was safe when last checked, or never checked at all,
	must not reach the vessel unexamined. A "blocked" result refuses the send outright (409);
	"warning" (e.g. a shallow-water crossing) and "no_data" (route passes outside charted ENC
	coverage) do not — the vessel is tested in areas this delivery has no chart data for at all, so
	sending has to stay possible there. Sending isn't the only way to catch either one, either —
	the operator has already seen them surfaced by Phase 1 while planning.

	On BRIDGE_TARGET=physical there is currently nothing that echoes /waypoint_list back, so
	a send there will correctly resolve to "timed_out" rather than being special-cased —
	that is honest degradation, not a bug, until a physical-vessel ack path exists.
	"""
	mission = await _get_mission_or_404(db, mission_id)
	waypoints = mission.waypoints

	validation = await evaluate_route_hazards(
		db, waypoints, settings.safety_margin_m, settings.safety_contour_m
	)
	mission.last_validated_at = datetime.now(UTC)
	mission.last_validation_status = validation.status
	await db.commit()
	if validation.status == "blocked":
		await log_action(
			db,
			session_id=session_id,
			action="mission.send.blocked",
			severity="warning",
			params={
				"mission_id": str(mission_id),
				"hazards": [h.model_dump() for h in validation.hazards],
			},
		)
		raise HTTPException(
			status_code=409,
			detail={
				"message": "Route crosses a charted hazard and cannot be sent.",
				"hazards": [h.model_dump() for h in validation.hazards],
			},
		)

	ros_msg = waypoint_list_to_ros_dict(waypoints, bridge)
	expected = expected_ack(waypoints, bridge)

	bridge.broadcast_mission_send_status(str(mission_id), "sending", len(waypoints))
	status = await bridge.publish_and_await_ack(
		"/update_waypoint_list", "custom_msgs/WaypointList", ros_msg, expected
	)

	checked_at = datetime.now(UTC)
	mission.last_sent_at = checked_at
	mission.last_send_status = status
	await db.commit()

	bridge.broadcast_mission_send_status(str(mission_id), status, len(waypoints))
	await log_action(
		db,
		session_id=session_id,
		action="mission.send",
		params={
			"mission_id": str(mission_id),
			"status": status,
			"waypoint_count": len(waypoints),
			"validation_status": validation.status,
		},
	)
	return MissionSendResult(
		status=status,
		waypoint_count=len(waypoints),
		checked_at=checked_at,
		validation_status=validation.status,
		hazards=validation.hazards,
	)
