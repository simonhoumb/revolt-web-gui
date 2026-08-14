"""Mission command orchestration: validation, send, start, pause, terminate.

Extracted from routers/mission.py so the router stays a thin HTTP boundary (parse the request,
fetch the mission or 404, delegate here, return the result) while this module owns ENC
re-validation policy, bridge publish/ack orchestration, resume-cache handling, and the associated
audit logging, previously all fused into the route handlers themselves.
"""

import uuid
from datetime import UTC, datetime

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from revolt_api.audit import log_action
from revolt_api.bridge import RosBridgeClient
from revolt_api.bridge.contracts import MissionExecutionState
from revolt_api.bridge.waypoint_codec import (
	expected_ack,
	expected_ack_from_sim,
	sim_waypoint_list_to_ros_dict,
	waypoint_list_to_ros_dict,
)
from revolt_api.config import settings
from revolt_api.enc_validation import ValidationResult, evaluate_route_hazards
from revolt_api.models.mission import Mission, MissionStatus
from revolt_api.schemas.mission import (
	MissionExecutionResult,
	MissionSendResult,
	MissionValidationResult,
)

_PHYSICAL_AUTONOMY_NOTE = (
	"Waypoints are loaded and ready. On the physical vessel, engaging autonomy is controlled by "
	"the RC operator's gear switch, not by this button."
)

_IN_FLIGHT_STATES: frozenset[MissionExecutionState] = frozenset({"starting", "active", "pausing"})

# Missions in these statuses aren't running or resumable; the vessel has no live interest in
# their waypoints, so editing them safely invalidates "loaded" (see invalidate_load_if_edited).
_EDITABLE_WITHOUT_VESSEL_IMPACT: frozenset[MissionStatus] = frozenset(
	{MissionStatus.draft, MissionStatus.aborted, MissionStatus.completed}
)

# Starting is valid from any status except active: an already-active mission has nothing to
# (re)start. draft/aborted/completed all fall through to the fresh-start branch (loaded-check
# below); paused additionally allows the resume branch (see the stricter check inside it).
_START_ALLOWED_STATUSES: frozenset[MissionStatus] = frozenset(
	{MissionStatus.draft, MissionStatus.paused, MissionStatus.aborted, MissionStatus.completed}
)


async def get_loaded_mission_id(db: AsyncSession) -> uuid.UUID | None:
	"""The mission most recently sent to the vessel: "loaded," in the ECDIS/autopilot sense.

	Not gated on last_send_status == "acknowledged": a dropped/delayed echo (e.g. rosbridge
	hiccup, or the 1Hz /waypoint_list republish just missing the ack window) would otherwise
	make "loaded" flicker false despite the mission having reached the vessel. Reaching the
	wire is what counts.
	"""
	result = await db.execute(
		select(Mission.id)
		.where(Mission.last_sent_at.isnot(None))
		.order_by(Mission.last_sent_at.desc())
		.limit(1)
	)
	return result.scalar_one_or_none()


def reject_if_superseding_mission(bridge: RosBridgeClient, mission_id: uuid.UUID) -> None:
	"""Refuse to send a different mission while one is genuinely in-flight on the vessel.

	The vessel has one physical waypoint queue, not one per mission, so sending mission B while
	A is active would silently hijack A's route. Re-sending the same tracked mission (e.g.
	pushing edited waypoints mid-run) is unaffected.
	"""
	tracked = bridge.tracked_mission_id
	if (
		tracked is not None
		and tracked != str(mission_id)
		and bridge.tracked_state in _IN_FLIGHT_STATES
	):
		raise HTTPException(
			status_code=409,
			detail={
				"message": (
					f"Mission {tracked} is currently active on the vessel. Pause or terminate "
					"it before sending a different route."
				),
				"reason": "another_mission_active",
			},
		)


def reject_if_stale_mission(bridge: RosBridgeClient, mission_id: uuid.UUID) -> None:
	"""Defensive guard for pause/terminate: refuse to act on a different mission than the tracked one.

	Fails open when nothing is tracked (e.g. after a backend restart) so a genuinely stuck
	mission can still be terminated.
	"""
	tracked = bridge.tracked_mission_id
	if tracked is not None and tracked != str(mission_id):
		raise HTTPException(
			status_code=409,
			detail={
				"message": (
					f"Mission {tracked} is the mission currently tracked on the vessel, not this "
					"one; refusing to avoid acting on the wrong route."
				),
				"reason": "stale_mission",
			},
		)


def reject_invalid_transition(
	mission: Mission, allowed: frozenset[MissionStatus], action: str
) -> None:
	"""Enforce the mission execution state machine server-side.

	The frontend disables buttons for the same reason, but that's a UI courtesy, not a guarantee
	(nothing stops a direct API call). Without this, pausing an aborted mission would silently
	mark it "paused" again.
	"""
	if mission.status not in allowed:
		raise HTTPException(
			status_code=409,
			detail={
				"message": f"Cannot {action} a mission that is currently {mission.status.value}.",
				"reason": "invalid_transition",
			},
		)


def invalidate_load_if_edited(mission: Mission) -> None:
	"""Clear last_sent_at/last_send_status when a mission that isn't active/paused is edited.

	Deliberately not cleared for active/paused missions: the vessel's guidance stack keeps its
	own copy of the waypoints once published, so it keeps executing the pre-edit route
	regardless of what the planner now shows. Invalidating "loaded" there would make Mission
	Control falsely claim nothing is loaded while the vessel is still executing the old plan.
	"""
	if mission.status in _EDITABLE_WITHOUT_VESSEL_IMPACT and mission.last_sent_at is not None:
		mission.last_sent_at = None
		mission.last_send_status = None


async def _run_hazard_validation(db: AsyncSession, mission: Mission) -> ValidationResult:
	"""Run the Phase 2 authoritative ENC hazard check and persist the result onto the mission.

	Shared by validate_mission, send_mission, and start_mission: all three must re-run this
	fresh rather than trusting a stale mission.last_validation_status.
	"""
	result = await evaluate_route_hazards(
		db, mission.waypoints, settings.safety_margin_m, settings.safety_contour_m
	)
	mission.last_validated_at = datetime.now(UTC)
	mission.last_validation_status = result.status
	await db.commit()
	return result


async def _reject_if_hazards_blocked(
	db: AsyncSession,
	session_id: str,
	mission_id: uuid.UUID,
	validation: ValidationResult,
	*,
	action: str,
	verb: str,
) -> None:
	"""Refuse a send/start whose route was found blocked.

	Shared by send_mission and start_mission, the two endpoints that actually publish to the
	vessel.
	"""
	if validation.status != "blocked":
		return
	await log_action(
		db,
		session_id=session_id,
		action=f"mission.{action}.blocked",
		severity="warning",
		params={
			"mission_id": str(mission_id),
			"hazards": [h.model_dump() for h in validation.hazards],
		},
	)
	raise HTTPException(
		status_code=409,
		detail={
			"message": f"Route crosses a charted hazard and cannot be {verb}.",
			"hazards": [h.model_dump() for h in validation.hazards],
			"reason": "hazard_blocked",
		},
	)


async def validate_mission(
	db: AsyncSession, session_id: str, mission: Mission
) -> MissionValidationResult:
	"""Authoritative server-side ENC hazard check (Phase 2).

	Checked against the enc_* PostGIS tables (infra/enc-pipeline/ingest_postgis.sh), independent
	of whatever chart tiles the browser happens to have rendered. See encValidation.ts's Phase 1
	client-side check (advisory only) for why that distinction matters. send_mission() always
	re-runs this itself before publishing; this endpoint exists so the frontend can show hazard
	state before the operator even attempts a send, not as the only gate.
	"""
	result = await _run_hazard_validation(db, mission)
	await log_action(
		db,
		session_id=session_id,
		action="mission.validate",
		params={
			"mission_id": str(mission.id),
			"status": result.status,
			"hazard_count": len(result.hazards),
		},
	)
	return MissionValidationResult(
		status=result.status, hazards=result.hazards, checked_at=mission.last_validated_at
	)


async def send_mission(
	db: AsyncSession, bridge: RosBridgeClient, session_id: str, mission: Mission
) -> MissionSendResult:
	"""Re-validate (Phase 2), then publish the mission's full waypoint list.

	Waits for waypoint_switcher_node's /waypoint_list echo to confirm it landed (see
	RosBridgeClient.publish_and_await_ack) -- the same topic and wire format on both
	BRIDGE_TARGET=simulation and physical, since ControlSystemROS2's waypoint_switcher node
	runs on the real vessel too. Always re-runs the hazard check itself rather than trusting a
	client-reported "already validated" flag; a route that was safe when last checked, or never
	checked at all, must not reach the vessel unexamined. "blocked" refuses the send (409);
	"warning" and "no_data" (route outside charted ENC coverage) do not, since the vessel is
	tested in areas this delivery has no chart data for.
	"""
	mission_id = mission.id
	waypoints = mission.waypoints

	validation = await _run_hazard_validation(db, mission)
	await _reject_if_hazards_blocked(
		db, session_id, mission_id, validation, action="send", verb="sent"
	)

	reject_if_superseding_mission(bridge, mission_id)

	ros_msg = waypoint_list_to_ros_dict(waypoints, bridge)
	expected = expected_ack(waypoints, bridge)

	bridge.broadcast_mission_send_status(str(mission_id), "sending", len(waypoints))
	status = await bridge.publish_and_await_ack(
		"/update_waypoint_list", "custom_msgs/WaypointList", ros_msg, expected
	)

	if status != "not_connected" and bridge.has_resume_points():
		# Any publish to /update_waypoint_list replaces the vessel's entire queue, so whatever any
		# previously-paused mission's resume snapshot remembered (including this same mission's
		# own stale one, if re-sending after edits) no longer reflects reality.
		invalidated = bridge.clear_resume_cache()
		await log_action(
			db,
			session_id=session_id,
			action="mission.send.invalidated_resume",
			severity="warning",
			params={"mission_id": str(mission_id), "invalidated_missions": invalidated},
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


async def start_mission(
	db: AsyncSession, bridge: RosBridgeClient, session_id: str, mission: Mission
) -> MissionExecutionResult:
	"""Start executing a mission, handling two distinct cases.

	Fresh start (no resume_cache entry): the waypoints must already be loaded via a prior /send,
	mirroring ECDIS/autopilot's separate upload-then-engage steps. Nothing is published here; it
	only engages execution of what's already there, so there's no ack to wait for.

	Resume (mission was previously paused, resume_cache has its remaining queue): the vessel's
	own "pick up where it left off" capability, not a new route upload. Still self-publishes the
	cached remainder and gates on the ack.

	On simulation, also engages autonomy (/arduino/is_autonomous). On the physical vessel that's
	the RC operator's action (see _PHYSICAL_AUTONOMY_NOTE), so this only marks the mission active.
	"""
	mission_id = mission.id
	reject_invalid_transition(mission, _START_ALLOWED_STATUSES, "start")
	waypoints = mission.waypoints

	validation = await _run_hazard_validation(db, mission)
	await _reject_if_hazards_blocked(
		db, session_id, mission_id, validation, action="start", verb="started"
	)

	resume_key = str(mission_id)
	resumed = bridge.get_resume_point(resume_key)
	autonomy_engaged = False
	autonomy_note: str | None = None

	if resumed is not None:
		# Resuming is specifically "continue a paused mission", stricter than the general
		# _START_ALLOWED_STATUSES check above, which also lets draft/aborted/completed through
		# to the fresh-start branch.
		reject_invalid_transition(mission, frozenset({MissionStatus.paused}), "resume")
		ros_msg = sim_waypoint_list_to_ros_dict(resumed)
		expected = expected_ack_from_sim(resumed)
		first_seq: int | None = resumed[0]["id"] if resumed else None
		total_count = len(resumed)

		# Track before publishing, not after: publish_and_await_ack's own wait resolves via
		# _transform() processing the echo, which broadcasts execution status using whatever
		# _tracked_mission_id is already set at that moment. Tracking only on success would
		# misattribute that echo to a stale mission id left over from a previous Start.
		bridge.track_mission(resume_key, total_count)
		status = await bridge.publish_and_await_ack(
			"/update_waypoint_list", "custom_msgs/WaypointList", ros_msg, expected
		)
		succeeded = status == "acknowledged"
		if succeeded:
			bridge.pop_resume_point(resume_key)
	else:
		# Fresh start: the waypoints must already be loaded via a prior /send, so nothing is
		# published here; there's no ack to gate on, the loaded-check is the only precondition.
		loaded_id = await get_loaded_mission_id(db)
		if loaded_id != mission_id:
			raise HTTPException(
				status_code=412,
				detail={
					"message": (
						"This mission hasn't been sent to the vessel, or a different mission "
						"was sent more recently. Send it, then Start."
					),
					"reason": "not_loaded",
				},
			)
		first_seq = waypoints[0].sequence_number if waypoints else None
		total_count = len(waypoints)
		status = mission.last_send_status or "not_connected"
		succeeded = True
		bridge.track_mission(resume_key, total_count)

	state: MissionExecutionState = "starting"
	if succeeded:
		mission.status = MissionStatus.active
		if mission.started_at is None:
			mission.started_at = datetime.now(UTC)
		await db.commit()
		if bridge.target == "simulation":
			await bridge.publish("/arduino/is_autonomous", "std_msgs/Bool", {"data": True})
			autonomy_engaged = True
		else:
			autonomy_note = _PHYSICAL_AUTONOMY_NOTE
		state = "active"
		bridge.broadcast_tracked_status(resume_key, state, first_seq, total_count)
	else:
		# The resume didn't actually take; don't leave this mission falsely tracked as if it
		# were executing.
		bridge.untrack_mission()

	await log_action(
		db,
		session_id=session_id,
		action="mission.start",
		params={
			"mission_id": resume_key,
			"status": status,
			"waypoint_count": total_count,
			"resumed": resumed is not None,
		},
	)
	return MissionExecutionResult(
		status=status,
		state=state,
		autonomy_engaged=autonomy_engaged,
		autonomy_note=autonomy_note,
		waypoint_count=total_count,
	)


async def pause_mission(
	db: AsyncSession, bridge: RosBridgeClient, session_id: str, mission: Mission
) -> MissionExecutionResult:
	"""Pause a mission: snapshot the vessel's remaining queue, then clear the active list to stop it.

	The snapshot is the last-echoed /waypoint_list (already reflects any waypoints popped as
	reached); starting again resends it instead of the full original mission, so completed legs
	aren't re-run. If there's no echo yet (mission never actually sent), there's nothing
	meaningful to capture; a subsequent Start falls back to a fresh full send, which is correct
	anyway.
	"""
	mission_id = mission.id
	reject_invalid_transition(mission, frozenset({MissionStatus.active}), "pause")
	resume_key = str(mission_id)
	reject_if_stale_mission(bridge, mission_id)

	remaining = bridge.latest_waypoint_list
	if remaining:
		bridge.set_resume_point(resume_key, remaining)
	else:
		await log_action(
			db,
			session_id=session_id,
			action="mission.pause.no_resume_point",
			severity="warning",
			params={"mission_id": resume_key},
		)

	status = await bridge.publish_and_await_ack(
		"/update_waypoint_list", "custom_msgs/WaypointList", {"waypoints": []}, []
	)
	if bridge.target == "simulation":
		await bridge.publish("/arduino/is_autonomous", "std_msgs/Bool", {"data": False})

	mission.status = MissionStatus.paused
	await db.commit()
	# None means no /waypoint_list echo has ever been received (e.g. testing against a rosbag
	# replay that doesn't include this topic): "we don't actually know," not "confirmed empty."
	# Collapsing that into remaining_count=0 would understate this as 100% complete instead of
	# correctly reporting nothing known reached yet. Mirrors _push_mission_execution_status_to's
	# own is-not-None distinction and its "assume nothing consumed" fallback.
	remaining_count = len(remaining) if remaining is not None else len(mission.waypoints)
	bridge.broadcast_tracked_status(resume_key, "paused", None, remaining_count)

	await log_action(
		db,
		session_id=session_id,
		action="mission.pause",
		params={"mission_id": resume_key, "status": status, "remaining_count": remaining_count},
	)
	return MissionExecutionResult(
		status=status,
		state="paused",
		autonomy_engaged=False,
		autonomy_note=None,
		waypoint_count=remaining_count,
	)


async def terminate_mission(
	db: AsyncSession, bridge: RosBridgeClient, session_id: str, mission: Mission
) -> MissionExecutionResult:
	"""Terminate/abort a mission: clear the waypoint list, mark it aborted, drop any resume snapshot.

	Clearing the list is verified sufficient to stop the vessel on both targets (speed_control
	tracks u_ref unconditionally, and thrust_allocation shares effort across both thrusters, so
	zero thrust makes any stale heading command physically inert). Dropping the resume snapshot
	means a terminated mission's next Start is always a fresh full send, never a stale partial
	resume from an earlier pause. Always logged at severity="warning": the intent to terminate is
	the reportable event, not just a successful ack.
	"""
	mission_id = mission.id
	reject_invalid_transition(
		mission, frozenset({MissionStatus.active, MissionStatus.paused}), "terminate"
	)
	resume_key = str(mission_id)
	reject_if_stale_mission(bridge, mission_id)
	# Terminating a paused mission: the live echo (bridge.latest_waypoint_list) is already the
	# empty list pause itself cleared, not the real remaining count; the resume snapshot from
	# that earlier pause is the accurate source instead. Terminating a still-active mission
	# (never paused): there's no resume snapshot, so the live echo is accurate, same as
	# pause_mission's own remaining_count above.
	resume_point = bridge.pop_resume_point(resume_key)
	remaining = resume_point if resume_point is not None else bridge.latest_waypoint_list
	# None means no /waypoint_list echo has ever been received (e.g. testing against a rosbag
	# replay that doesn't include this topic): "we don't actually know," not "confirmed empty."
	# See pause_mission's own identical comment above for why that distinction matters here.
	remaining_count = len(remaining) if remaining is not None else len(mission.waypoints)

	status = await bridge.publish_and_await_ack(
		"/update_waypoint_list", "custom_msgs/WaypointList", {"waypoints": []}, []
	)
	if bridge.target == "simulation":
		await bridge.publish("/arduino/is_autonomous", "std_msgs/Bool", {"data": False})

	mission.status = MissionStatus.aborted
	mission.completed_at = datetime.now(UTC)
	await db.commit()
	bridge.broadcast_tracked_status(resume_key, "aborted", None, remaining_count)
	bridge.untrack_mission()

	await log_action(
		db,
		session_id=session_id,
		action="mission.terminate",
		severity="warning",
		params={"mission_id": resume_key, "status": status, "remaining_count": remaining_count},
	)
	return MissionExecutionResult(
		status=status,
		state="aborted",
		autonomy_engaged=False,
		autonomy_note=None,
		waypoint_count=remaining_count,
	)
