"""Tracks the vessel's live mission-execution state, derived from the /waypoint_list echo.

Extracted from RosBridgeClient so the WS-transport class (connect/reconnect/decode/dispatch)
isn't also the sole owner of mission-execution bookkeeping -- which mission is currently tracked,
its pause-time resume snapshot, and the live current-waypoint/progress derived from each echo.
Those are a genuinely different concern from "speak the rosbridge wire protocol" that happened to
be fused into the same class; this collaborator is owned by (and only ever touched through)
RosBridgeClient, which still exposes the same track_mission/untrack_mission/broadcast_*/
resume-cache methods it always did -- only their implementation now delegates here.
"""

from revolt_api.bridge.contracts import MissionExecutionState, SimWaypoint


class MissionExecutionTracker:
	"""One instance owned by RosBridgeClient, living for the application lifetime."""

	def __init__(self) -> None:
		# Latest /waypoint_list echo, i.e. whatever the vessel's queue actually still contains
		# right now (already reflects any waypoints it has popped as reached). Used both to
		# snapshot a resume point on pause and to derive live current-waypoint/progress status.
		self.latest_waypoint_list: list[SimWaypoint] | None = None
		# Snapshot of the remaining queue taken at pause time, keyed by mission id, so a
		# subsequent Start resumes from where the vessel actually was instead of resending the
		# full original mission. In-memory by design: it must always match the vessel's real
		# queue, which a DB-persisted guess could drift from; lost on backend restart, same as
		# the rest of the bridge client's connection state.
		self.resume_cache: dict[str, list[SimWaypoint]] = {}
		self._tracked_mission_id: str | None = None
		self._tracked_total_count: int = 0
		self._tracked_state: MissionExecutionState = "active"

	@property
	def tracked_mission_id(self) -> str | None:
		return self._tracked_mission_id

	@property
	def tracked_state(self) -> MissionExecutionState:
		return self._tracked_state

	@property
	def tracked_total_count(self) -> int:
		return self._tracked_total_count

	def track(self, mission_id: str, total_count: int) -> None:
		"""Start deriving live execution status (current waypoint, progress) for this mission
		from subsequent /waypoint_list echoes. Called by the start endpoint before publishing,
		not after -- so the echo that resolves publish_and_await_ack's own wait attributes
		correctly to this mission rather than whatever was tracked previously. Defaults to
		"starting" rather than "active" since the ack hasn't landed yet at this point."""
		self._tracked_mission_id = mission_id
		self._tracked_total_count = total_count
		self._tracked_state = "starting"

	def untrack(self) -> None:
		"""Stop deriving live execution status. Called by the terminate endpoint."""
		self._tracked_mission_id = None
		self._tracked_total_count = 0

	def set_state_if_tracked(self, mission_id: str, state: MissionExecutionState) -> bool:
		"""Update the tracked state if mission_id is the one currently tracked, and report
		whether it applied. No-op (returns False) otherwise -- only one mission is tracked at a
		time by design, so this guards callers against broadcasting under the wrong id."""
		if self._tracked_mission_id != mission_id:
			return False
		self._tracked_state = state
		return True

	def record_waypoint_list_echo(self, waypoints: list[SimWaypoint]) -> None:
		self.latest_waypoint_list = waypoints

	def get_resume_point(self, mission_id: str) -> list[SimWaypoint] | None:
		"""The remaining queue snapshotted at pause time for this mission, if any."""
		return self.resume_cache.get(mission_id)

	def set_resume_point(self, mission_id: str, remaining: list[SimWaypoint]) -> None:
		"""Snapshot the vessel's actual remaining queue as a resume point. Called by pause."""
		self.resume_cache[mission_id] = remaining

	def pop_resume_point(self, mission_id: str) -> list[SimWaypoint] | None:
		"""Consume and discard this mission's resume point, if any. Called on a successful
		resume-start (the snapshot has now been used) and on terminate (no resume should
		survive an abort)."""
		return self.resume_cache.pop(mission_id, None)

	def has_resume_points(self) -> bool:
		return bool(self.resume_cache)

	def clear_resume_cache(self) -> list[str]:
		"""Discard every resume point and return the mission ids that were invalidated. Called
		when a publish to /update_waypoint_list replaces the vessel's entire queue, since any
		previously-paused mission's snapshot no longer reflects reality."""
		invalidated = list(self.resume_cache)
		self.resume_cache.clear()
		return invalidated
