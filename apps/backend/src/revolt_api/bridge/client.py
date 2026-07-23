import asyncio
import base64
import contextlib
import json
import math
import time
import uuid
from collections.abc import Callable
from dataclasses import dataclass, field
from typing import Any, Literal

import structlog
from websockets.asyncio.client import connect

from revolt_api.bridge.contracts import (
	_ADC_TO_AMPS,
	_CONTROL_MODE_MAP,
	AisTargetMsg,
	AzimuthFeedbackMsg,
	BatteryMsg,
	BridgeMessage,
	BridgeStatusMsg,
	CameraStatusMsg,
	ControlModeMsg,
	CurrentMsg,
	EmergencyStopMsg,
	GnssFixMsg,
	GnssHeadingMsg,
	GnssVelocityMsg,
	HumidityMsg,
	ImuMsg,
	LidarScanMsg,
	LightBeaconMsg,
	LinearActuatorMsg,
	MissionExecutionState,
	MissionExecutionStatusMsg,
	MissionSendStatus,
	MissionSendStatusMsg,
	RadarSpokeMsg,
	RcRemoteMsg,
	SimGnssVelocityMsg,
	SimHullPositionMsg,
	SimHullVelocityMsg,
	SimImuMsg,
	SimThrusterFeedbackMsg,
	SimWaypoint,
	SimWaypointListMsg,
	TemperatureMsg,
)
from revolt_api.bridge.mission_tracker import MissionExecutionTracker
from revolt_api.bridge.protocol import (
	PHYSICAL_SUBSCRIBE_TOPICS,
	SIMULATION_SUBSCRIBE_TOPICS,
	RosBridgeCallService,
	RosBridgePublishOut,
	RosBridgeSubscribe,
	get_subscribe_topics,
)
from revolt_api.geo import latlon_to_local_cartesian, local_cartesian_to_latlon

logger = structlog.get_logger(__name__)

# The vessel's radar (Furuno DRS4D-NXT) emits 8,192 raw spokes per revolution (confirmed via
# Furuno's NavNet API spec: "A frame of image consists of 8,192 lines of sweep", bundled in
# Hardware/radar/RadarSDK/), which at a typical 24-48 RPM rotation speed is several thousand raw
# spoke messages per second -- far too high to forward 1:1 over the browser WebSocket. Raw spokes
# are instead aggregated per-connection-independent (this state is global to the bridge, not
# per-subscriber) into this many coarser azimuth bins, merging intensity by taking the max across
# every raw spoke that lands in the same bin, and only forwarded once the antenna moves on to the
# next bin (see _handle_radar_spoke). This keeps full 360-degree coverage every rotation at a
# bounded message rate, instead of either flooding the browser or dropping azimuth resolution
# outright. Must match RADAR_NUM_BINS in the frontend's useRadarData.ts.
RADAR_NUM_BINS = 512
RADAR_BIN_WIDTH_RAD = (2 * math.pi) / RADAR_NUM_BINS
# Safety flush if the antenna stalls on one bin for longer than a real rotation would ever take,
# so a disconnected/stopped radar doesn't leave the last bin's data buffered forever unsent.
RADAR_ACCUM_MAX_AGE_MS = 3000

# Course over ground is an angle derived from the GNSS receiver's own Doppler velocity vector
# (see _handle_gnss_velocity) -- atan2 of a vector whose magnitude is comparable to its own
# measurement noise swings wildly, since the noise is no longer small relative to what it's
# perturbing. Below this speed, course_deg is published as None instead of a meaningless angle,
# rather than trying to filter something that isn't actually there yet. ReVolt is a small, slow
# vessel (normal transit is roughly 0.5-1 kn / 0.25-0.5 m/s per observed rosbag data) -- this sits
# well below that range on purpose, so the gate only ever suppresses genuine near-zero noise, not
# real slow-speed operation. A GUI-side placeholder like STALE_MS/EXPIRE_MS in
# useAisTargets.ts, not a spec'd value; revisit against the VS330's actual noise floor if it
# still gates out real movement or lets too much noise through.
MIN_COG_SPEED_MS = 0.1
# Exponential moving average smoothing applied to the velocity vector (not the angle -- naively
# averaging angles breaks at the 0/360 wraparound, but averaging the underlying vector components
# and then taking atan2 of the result is exact) to damp residual Doppler noise once above
# MIN_COG_SPEED_MS. Higher alpha tracks real course changes faster but smooths less; this is the
# same kind of "COG damping" real marine chartplotters/AIS units expose as a filter time constant.
GNSS_VEL_EMA_ALPHA = 0.3

AckStatus = Literal["acknowledged", "timed_out", "not_connected", "mismatched"]


@dataclass
class PendingAck:
	"""Tracks a publish awaiting confirmation via the vessel's echoed waypoint list.

	expected is (sequence_number, x_metres, y_metres) per waypoint, in order — compared
	against the next /waypoint_list message that arrives after the publish.
	"""

	expected: list[tuple[int, float, float]]
	event: asyncio.Event = field(default_factory=asyncio.Event)
	result: AckStatus = "timed_out"


ServiceCallError = Literal["not_connected", "timed_out", "service_call_failed"]


@dataclass
class ServiceCallResult:
	ok: bool
	values: dict[str, Any] | None
	error: ServiceCallError | None


@dataclass
class PendingServiceCall:
	event: asyncio.Event = field(default_factory=asyncio.Event)
	result: ServiceCallResult | None = None


@dataclass
class LatestRawMessage:
	msg: dict[str, Any]
	timestamp_ms: int


class RosBridgeClient:
	"""Connects to a rosbridge WebSocket server and fans out typed messages to frontend clients.

	One instance is created at startup and lives for the application lifetime.
	Frontend WebSocket connections register a queue via subscribe(); the client
	fills that queue whenever a ROS2 message arrives.
	"""

	def __init__(
		self,
		url: str,
		target: str,
		gnss_origin_lat: float = 0.0,
		gnss_origin_lon: float = 0.0,
	) -> None:
		self._url = url
		self._target = target
		self._gnss_origin_lat = gnss_origin_lat
		self._gnss_origin_lon = gnss_origin_lon
		self._subscribers: set[asyncio.Queue[BridgeMessage]] = set()
		self._receive_task: asyncio.Task[None] | None = None
		self._heartbeat_task: asyncio.Task[None] | None = None
		self._connected = False
		self._backoff_s: float = 1.0
		self.latest_camera_frames: dict[str, bytes] = {}
		self._camera_frame_counters: dict[str, int] = {}
		self._camera_last_frame_time: dict[str, float] = {}
		self._camera_connected: dict[str, bool] = {}
		self._pending_ack: PendingAck | None = None
		self._pending_service_calls: dict[str, PendingServiceCall] = {}
		self._latest_raw_by_topic: dict[str, LatestRawMessage] = {}
		self._mission_tracker = MissionExecutionTracker()

		# In-progress radar azimuth-bin accumulator (see RADAR_NUM_BINS above).
		self._radar_current_bin: int | None = None
		self._radar_accum_intensity: list[int] = []
		self._radar_accum_meta: dict[str, float | int] | None = None
		self._radar_accum_started_ms: int = 0

		# EMA-smoothed GNSS velocity components, see _handle_gnss_velocity below.
		self._gnss_vel_ema_vx: float | None = None
		self._gnss_vel_ema_vy: float | None = None

		# Build a topic → throttle-seconds lookup covering both target inventories so that
		# _dispatch() can drop messages for high-freq topics before they reach browser queues.
		all_specs = [*PHYSICAL_SUBSCRIBE_TOPICS, *SIMULATION_SUBSCRIBE_TOPICS]
		self._topic_throttle: dict[str, float] = {
			spec.topic: spec.frontend_throttle_ms / 1000.0
			for spec in all_specs
			if spec.frontend_throttle_ms > 0
		}
		self._topic_last_emit: dict[str, float] = {}

		self._topic_handlers: dict[str, Callable[[dict, int], BridgeMessage | None]] = {
			"/arduino/stern/battery_voltage": self._handle_battery,
			"/arduino/stern/port/current": self._handle_current_stern_port,
			"/arduino/stern/starboard/current": self._handle_current_stern_starboard,
			"/arduino/bow/current": self._handle_current_bow,
			"/arduino/stern/dht22/temperature": self._handle_temperature_stern,
			"/arduino/stern/dht22/humidity": self._handle_humidity_stern,
			"/arduino/bow/dht22/temperature": self._handle_temperature_bow,
			"/arduino/bow/dht22/humidity": self._handle_humidity_bow,
			"/arduino/stern/emergency_stop_status": self._handle_emergency_stop,
			"/arduino/bow/linear_actuator_retract_state": self._handle_linear_actuator,
			"/thruster/port/feedback_angle": self._handle_azimuth_feedback_port,
			"/thruster/starboard/feedback_angle": self._handle_azimuth_feedback_starboard,
			"/arduino/stern/rc_remote_input": self._handle_rc_remote,
			"/arduino/stern/light_beacon_status": self._handle_light_beacon,
			"/control_mode": self._handle_control_mode,
			"/revolt/sim/stc/position/hull": self._handle_sim_hull_position,
			"/revolt/sim/stc/position/velocity": self._handle_sim_hull_velocity,
			"/revolt/sim/stc/gnss/antenna1/position": self._handle_sim_gnss_fix,
			"/revolt/sim/stc/gnss/antenna2/position": self._handle_gnss_antenna2_ignored,
			"/fix": self._handle_physical_gnss_fix,
			"/heading": self._handle_gnss_heading,
			"/vel": self._handle_gnss_velocity,
			"/revolt/sim/stc/gnss/velocity_vector": self._handle_sim_gnss_velocity,
			"/revolt/sim/stc/imu/data": self._handle_sim_imu,
			"/thruster/bow": lambda msg, now: self._handle_sim_thruster(msg, now, "bow"),
			"/thruster/port": lambda msg, now: self._handle_sim_thruster(msg, now, "port"),
			"/thruster/starboard": lambda msg, now: self._handle_sim_thruster(
				msg, now, "starboard"
			),
			"/waypoint_list": self._handle_waypoint_list,
			"/camera/camera/color/image_raw/compressed": self._handle_camera_frame,
			"/scan": self._handle_lidar_scan,
			"/radar/spoke": self._handle_radar_spoke,
			"/ais/decoded_message": self._handle_ais_target,
			"/imu/data": self._handle_imu,
		}

	async def start(self) -> None:
		self._receive_task = asyncio.create_task(self._run(), name="rosbridge_receive")
		self._heartbeat_task = asyncio.create_task(
			self._heartbeat_loop(), name="rosbridge_heartbeat"
		)

	async def stop(self) -> None:
		for task in (self._receive_task, self._heartbeat_task):
			if task is not None:
				task.cancel()
				with contextlib.suppress(asyncio.CancelledError):
					await task

	def subscribe(self) -> "asyncio.Queue[BridgeMessage]":
		q: asyncio.Queue[BridgeMessage] = asyncio.Queue(maxsize=100)
		self._subscribers.add(q)
		# Push current status immediately so new clients don't have to wait for the next
		# connect/disconnect event to learn whether the backend is connected to rosbridge.
		self._push_status_to(q)
		self._push_camera_status_to(q)
		self._push_mission_execution_status_to(q)
		return q

	def unsubscribe(self, q: "asyncio.Queue[BridgeMessage]") -> None:
		self._subscribers.discard(q)

	async def publish(self, topic: str, ros_type: str, msg: dict) -> None:
		"""Send a message to a ROS2 topic via rosbridge. Used by command endpoints."""
		if not self._connected:
			logger.warning("rosbridge_publish_dropped", topic=topic, reason="not_connected")
			return
		frame: RosBridgePublishOut = {"op": "publish", "topic": topic, "msg": msg}
		# _conn is set when _connected is True; mypy can't see the invariant
		await self._conn.send(json.dumps(frame))  # type: ignore[union-attr]

	async def publish_and_await_ack(
		self,
		topic: str,
		ros_type: str,
		msg: dict,
		expected: list[tuple[int, float, float]],
		timeout_s: float = 5.0,
	) -> AckStatus:
		"""Publish, then wait for the mission planner's /waypoint_list echo to confirm it landed.

		There is no ROS2 service/ack for these topics (see CLAUDE.md's phased-transport note) — the
		only confirmation available is that the sim's own active-list echo matches what was sent.
		Only one send can be pending at a time; a second call while one is in flight replaces it.
		"""
		if not self._connected:
			return "not_connected"
		pending = PendingAck(expected=expected)
		self._pending_ack = pending
		try:
			await self.publish(topic, ros_type, msg)
			try:
				await asyncio.wait_for(pending.event.wait(), timeout=timeout_s)
			except TimeoutError:
				return "timed_out"
			return pending.result
		finally:
			if self._pending_ack is pending:
				self._pending_ack = None

	async def call_service(
		self,
		service: str,
		ros_type: str,
		args: dict[str, Any] | None = None,
		timeout_s: float = 5.0,
	) -> ServiceCallResult:
		"""Call a rosbridge/rosapi service and await its response via the call_service op.

		Deliberately not built on PendingAck/self._pending_ack -- that mechanism is single-flight
		by design for a specific vessel side-effect (see publish_and_await_ack's docstring: "only
		one send can be pending at a time"). Service calls have no such constraint (e.g. two
		browser tabs issuing different introspection commands concurrently), so correlation is by
		the call_service op's own "id" field against a dict of pending calls, not a single slot.
		"""
		if not self._connected:
			return ServiceCallResult(ok=False, values=None, error="not_connected")
		call_id = f"call_service:{uuid.uuid4()}"
		pending = PendingServiceCall()
		self._pending_service_calls[call_id] = pending
		try:
			frame: RosBridgeCallService = {
				"op": "call_service",
				"id": call_id,
				"service": service,
				"type": ros_type,
				"args": args or {},
			}
			await self._conn.send(json.dumps(frame))  # type: ignore[union-attr]
			try:
				await asyncio.wait_for(pending.event.wait(), timeout=timeout_s)
			except TimeoutError:
				return ServiceCallResult(ok=False, values=None, error="timed_out")
			if pending.result is not None:
				return pending.result
			return ServiceCallResult(ok=False, values=None, error="service_call_failed")
		finally:
			self._pending_service_calls.pop(call_id, None)

	def _handle_service_response(self, data: dict) -> None:
		call_id = data.get("id")
		pending = self._pending_service_calls.get(call_id) if call_id else None
		if pending is None:
			return
		result_ok = bool(data.get("result"))
		values = data.get("values")
		pending.result = ServiceCallResult(
			ok=result_ok,
			values=values if isinstance(values, dict) else None,
			error=None if result_ok else "service_call_failed",
		)
		pending.event.set()

	def latest_raw_message(self, topic: str) -> LatestRawMessage | None:
		"""The last raw (untransformed) message received on this topic since connect, if any.

		Only ever populated for topics this client actually subscribes to (get_subscribe_topics,
		applied in _send_subscriptions) -- echo_topic's "must be an already-allow-listed topic"
		restriction is therefore structural here, not just validated by the caller.
		"""
		return self._latest_raw_by_topic.get(topic)

	def _check_pending_ack(self, waypoints: list[SimWaypoint]) -> None:
		pending = self._pending_ack
		if pending is None:
			return
		actual = [(wp["id"], wp["pos_x"], wp["pos_y"]) for wp in waypoints]
		matches = len(actual) == len(pending.expected) and all(
			a_id == e_id
			and math.isclose(a_x, e_x, abs_tol=0.5)
			and math.isclose(a_y, e_y, abs_tol=0.5)
			for (a_id, a_x, a_y), (e_id, e_x, e_y) in zip(actual, pending.expected, strict=True)
		)
		pending.result = "acknowledged" if matches else "mismatched"
		pending.event.set()

	def broadcast_mission_send_status(
		self, mission_id: str, status: MissionSendStatus, waypoint_count: int
	) -> None:
		"""Fan out a mission send status update to every open frontend tab, not just the sender."""
		self._broadcast(
			MissionSendStatusMsg(
				v="1",
				type="mission_send_status",
				timestamp_ms=int(time.time() * 1000),
				mission_id=mission_id,
				status=status,
				waypoint_count=waypoint_count,
			)
		)

	def track_mission(self, mission_id: str, total_count: int) -> None:
		"""Start deriving live execution status (current waypoint, progress) for this mission
		from subsequent /waypoint_list echoes. Called by the start endpoint before publishing,
		not after -- so the echo that resolves publish_and_await_ack's own wait attributes
		correctly to this mission rather than whatever was tracked previously. Defaults to
		"starting" rather than "active" since the ack hasn't landed yet at this point."""
		self._mission_tracker.track(mission_id, total_count)

	def untrack_mission(self) -> None:
		"""Stop deriving live execution status. Called by the terminate endpoint."""
		self._mission_tracker.untrack()

	def broadcast_tracked_status(
		self,
		mission_id: str,
		state: MissionExecutionState,
		current_waypoint_seq: int | None,
		remaining_count: int,
	) -> None:
		"""Broadcast execution status for the currently tracked mission, filling in total_count
		from the count captured at track_mission() time (e.g. pause keeps the mission tracked,
		just relabels its state, so a resumed Start still has the right denominator for
		progress). No-op if mission_id isn't the one currently tracked -- only one mission is
		tracked at a time by design, so this guards against broadcasting under the wrong id."""
		if not self._mission_tracker.set_state_if_tracked(mission_id, state):
			return
		self.broadcast_mission_execution_status(
			mission_id,
			state,
			current_waypoint_seq,
			remaining_count,
			self._mission_tracker.tracked_total_count,
		)

	def broadcast_mission_execution_status(
		self,
		mission_id: str,
		state: MissionExecutionState,
		current_waypoint_seq: int | None,
		remaining_count: int,
		total_count: int,
	) -> None:
		"""Fan out a mission execution status update to every open frontend tab."""
		self._broadcast(
			MissionExecutionStatusMsg(
				v="1",
				type="mission_execution_status",
				timestamp_ms=int(time.time() * 1000),
				mission_id=mission_id,
				state=state,
				current_waypoint_seq=current_waypoint_seq,
				remaining_count=remaining_count,
				total_count=total_count,
			)
		)

	def get_resume_point(self, mission_id: str) -> list[SimWaypoint] | None:
		"""The remaining queue snapshotted at pause time for this mission, if any."""
		return self._mission_tracker.get_resume_point(mission_id)

	def set_resume_point(self, mission_id: str, remaining: list[SimWaypoint]) -> None:
		"""Snapshot the vessel's actual remaining queue as a resume point. Called by pause."""
		self._mission_tracker.set_resume_point(mission_id, remaining)

	def pop_resume_point(self, mission_id: str) -> list[SimWaypoint] | None:
		"""Consume and discard this mission's resume point, if any. Called on a successful
		resume-start (the snapshot has now been used) and on terminate (no resume should
		survive an abort)."""
		return self._mission_tracker.pop_resume_point(mission_id)

	def has_resume_points(self) -> bool:
		return self._mission_tracker.has_resume_points()

	def clear_resume_cache(self) -> list[str]:
		"""Discard every resume point and return the mission ids that were invalidated. Called
		when a publish to /update_waypoint_list replaces the vessel's entire queue, since any
		previously-paused mission's snapshot no longer reflects reality."""
		return self._mission_tracker.clear_resume_cache()

	def get_camera_frame_count(self, camera_id: str) -> int:
		return self._camera_frame_counters.get(camera_id, 0)

	def get_camera_frame(self, camera_id: str) -> bytes | None:
		return self.latest_camera_frames.get(camera_id)

	def latlon_to_cartesian(self, lat: float, lon: float) -> tuple[float, float]:
		"""Convert WGS84 degrees to local Cartesian metres (X=East, Y=North). Inverse of
		_cartesian_to_latlon, used when serialising outbound waypoints for the sim."""
		return latlon_to_local_cartesian(lat, lon, self._gnss_origin_lat, self._gnss_origin_lon)

	@property
	def connected(self) -> bool:
		return self._connected

	@property
	def target(self) -> str:
		return self._target

	@property
	def tracked_mission_id(self) -> str | None:
		return self._mission_tracker.tracked_mission_id

	@property
	def tracked_state(self) -> MissionExecutionState:
		return self._mission_tracker.tracked_state

	@property
	def latest_waypoint_list(self) -> list[SimWaypoint] | None:
		"""Whatever the vessel's queue actually still contains right now, as of the last
		/waypoint_list echo (already reflects any waypoints it has popped as reached)."""
		return self._mission_tracker.latest_waypoint_list

	async def _run(self) -> None:
		while True:
			exited_cleanly = False
			try:
				async with connect(self._url) as ws:
					self._conn = ws
					self._connected = True
					self._broadcast_status()
					logger.info("rosbridge_connected", url=self._url, target=self._target)
					await self._send_subscriptions(ws)
					async for raw in ws:
						self._dispatch(str(raw))
					exited_cleanly = True
			except asyncio.CancelledError:
				return
			except Exception:
				logger.exception("rosbridge_connection_error", url=self._url)
			finally:
				self._conn = None
				self._connected = False
				self._broadcast_status()
			if exited_cleanly:
				self._backoff_s = 1.0
			else:
				self._backoff_s = min(self._backoff_s * 2, 10.0)
			logger.info("rosbridge_reconnect_backoff", delay_s=self._backoff_s, url=self._url)
			await asyncio.sleep(self._backoff_s)

	async def _send_subscriptions(self, ws) -> None:
		for spec in get_subscribe_topics(self._target):
			frame: RosBridgeSubscribe = {
				"op": "subscribe",
				"topic": spec.topic,
				"type": spec.ros_type,
				"throttle_rate": spec.throttle_rate_ms,
			}
			await ws.send(json.dumps(frame))

	def _dispatch(self, raw: str) -> None:
		try:
			data = json.loads(raw)
		except json.JSONDecodeError:
			logger.warning("rosbridge_invalid_json")
			return
		op = data.get("op")
		if op == "service_response":
			self._handle_service_response(data)
			return
		if op != "publish":
			return
		topic = data.get("topic", "")
		# Populated unconditionally, before the frontend fan-out throttle below -- echo_topic
		# must reflect the true latest wire message, not whatever the browser-facing throttle
		# happens to have let through.
		self._latest_raw_by_topic[topic] = LatestRawMessage(
			msg=data.get("msg") or {}, timestamp_ms=int(time.time() * 1000)
		)
		throttle_s = self._topic_throttle.get(topic, 0.0)
		if throttle_s:
			now = time.monotonic()
			if now - self._topic_last_emit.get(topic, 0.0) < throttle_s:
				return
			self._topic_last_emit[topic] = now
		raw_msg = data.get("msg") or {}
		try:
			msg = self._transform(topic, raw_msg)
		except Exception:
			logger.warning("rosbridge_transform_error", topic=topic, exc_info=True)
			return
		if msg is None:
			return
		dropped = 0
		for q in list(self._subscribers):
			try:
				q.put_nowait(msg)
			except asyncio.QueueFull:
				dropped += 1
		if dropped:
			logger.warning("rosbridge_queue_full", dropped=dropped, topic=topic)

	def _transform(self, topic: str, msg: dict) -> BridgeMessage | None:
		"""Dispatch to the per-topic handler registered in self._topic_handlers (built in
		__init__), or None for topics this bridge doesn't forward. Replaces what used to be one
		large match statement -- each handler below is now small and independently callable/
		testable, and adding a topic means adding one method plus one dict entry rather than
		growing a single branch further."""
		handler = self._topic_handlers.get(topic)
		if handler is None:
			return None
		now = int(time.time() * 1000)
		return handler(msg, now)

	def _handle_battery(self, msg: dict, now: int) -> BridgeMessage | None:
		return BatteryMsg(v="1", type="battery", timestamp_ms=now, voltage_v=float(msg["data"]))

	def _handle_current_stern_port(self, msg: dict, now: int) -> BridgeMessage | None:
		raw = int(msg["data"])
		return CurrentMsg(
			v="1",
			type="current",
			timestamp_ms=now,
			location="stern_port",
			raw_adc=raw,
			amperes=float(raw),  # firmware sends Amps (ACS712 formula applied on Arduino)
		)

	def _handle_current_stern_starboard(self, msg: dict, now: int) -> BridgeMessage | None:
		raw = int(msg["data"])
		return CurrentMsg(
			v="1",
			type="current",
			timestamp_ms=now,
			location="stern_star",
			raw_adc=raw,
			amperes=float(raw),  # firmware sends Amps (ACS712 formula applied on Arduino)
		)

	def _handle_current_bow(self, msg: dict, now: int) -> BridgeMessage | None:
		raw = int(msg["data"])
		return CurrentMsg(
			v="1",
			type="current",
			timestamp_ms=now,
			location="bow",
			raw_adc=raw,
			amperes=round(raw * _ADC_TO_AMPS, 2),
		)

	def _handle_temperature_stern(self, msg: dict, now: int) -> BridgeMessage | None:
		return TemperatureMsg(
			v="1",
			type="temperature",
			timestamp_ms=now,
			location="stern",
			value_c=float(msg["data"]),
		)

	def _handle_humidity_stern(self, msg: dict, now: int) -> BridgeMessage | None:
		return HumidityMsg(
			v="1", type="humidity", timestamp_ms=now, location="stern", value_pct=float(msg["data"])
		)

	def _handle_temperature_bow(self, msg: dict, now: int) -> BridgeMessage | None:
		return TemperatureMsg(
			v="1", type="temperature", timestamp_ms=now, location="bow", value_c=float(msg["data"])
		)

	def _handle_humidity_bow(self, msg: dict, now: int) -> BridgeMessage | None:
		return HumidityMsg(
			v="1", type="humidity", timestamp_ms=now, location="bow", value_pct=float(msg["data"])
		)

	def _handle_emergency_stop(self, msg: dict, now: int) -> BridgeMessage | None:
		return EmergencyStopMsg(
			v="1", type="emergency_stop", timestamp_ms=now, active=int(msg["data"]) != 0
		)

	def _handle_linear_actuator(self, msg: dict, now: int) -> BridgeMessage | None:
		return LinearActuatorMsg(
			v="1", type="linear_actuator", timestamp_ms=now, retracted=int(msg["data"]) == 1
		)

	def _handle_azimuth_feedback_port(self, msg: dict, now: int) -> BridgeMessage | None:
		return AzimuthFeedbackMsg(
			v="1",
			type="azimuth_feedback",
			timestamp_ms=now,
			location="port",
			angle_deg=float(msg["data"]),
		)

	def _handle_azimuth_feedback_starboard(self, msg: dict, now: int) -> BridgeMessage | None:
		return AzimuthFeedbackMsg(
			v="1",
			type="azimuth_feedback",
			timestamp_ms=now,
			location="starboard",
			angle_deg=float(msg["data"]),
		)

	def _handle_rc_remote(self, msg: dict, now: int) -> BridgeMessage | None:
		return RcRemoteMsg(
			v="1",
			type="rc_remote",
			timestamp_ms=now,
			throttle=int(msg["throttle"]),
			aileron=int(msg["aileron"]),
			rudder=int(msg["rudder"]),
			gear="auto" if int(msg["gear"]) == 1 else "manual",
		)

	def _handle_light_beacon(self, msg: dict, now: int) -> BridgeMessage | None:
		raw = int(msg["data"])
		return LightBeaconMsg(
			v="1",
			type="light_beacon",
			timestamp_ms=now,
			red=bool(raw & 1),
			yellow=bool(raw & 2),
			green=bool(raw & 4),
		)

	def _handle_control_mode(self, msg: dict, now: int) -> BridgeMessage | None:
		raw_mode = int(msg["data"])
		return ControlModeMsg(
			v="1",
			type="control_mode",
			timestamp_ms=now,
			mode=_CONTROL_MODE_MAP.get(raw_mode, "miscommunication"),  # type: ignore[arg-type]
		)

	def _handle_sim_hull_position(self, msg: dict, now: int) -> BridgeMessage | None:
		pos = msg["pose"]["position"]
		ori = msg["pose"]["orientation"]
		return SimHullPositionMsg(
			v="1",
			type="sim_hull_position",
			timestamp_ms=now,
			pos_x=float(pos["x"]),
			pos_y=float(pos["y"]),
			pos_z=float(pos["z"]),
			orient_x=float(ori["x"]),
			orient_y=float(ori["y"]),
			orient_z=float(ori["z"]),
			orient_w=float(ori["w"]),
		)

	def _handle_sim_hull_velocity(self, msg: dict, now: int) -> BridgeMessage | None:
		lin = msg["linear"]
		ang = msg["angular"]
		return SimHullVelocityMsg(
			v="1",
			type="sim_hull_velocity",
			timestamp_ms=now,
			vel_x=float(lin["x"]),
			vel_y=float(lin["y"]),
			vel_z=float(lin["z"]),
			ang_vel_x=float(ang["x"]),
			ang_vel_y=float(ang["y"]),
			ang_vel_z=float(ang["z"]),
		)

	def _handle_sim_gnss_fix(self, msg: dict, now: int) -> BridgeMessage | None:
		pt = msg["point"]
		lat, lon = self._cartesian_to_latlon(float(pt["x"]), float(pt["y"]))
		return GnssFixMsg(
			v="1",
			type="gnss_fix",
			timestamp_ms=now,
			latitude=lat,
			longitude=lon,
			altitude_m=float(pt["z"]),
			fix_status=0,  # simulation always has a fix; no NavSatFix status field available
		)

	def _handle_gnss_antenna2_ignored(self, msg: dict, now: int) -> BridgeMessage | None:
		return None  # antenna2 not forwarded; antenna1 is the primary position source

	def _handle_physical_gnss_fix(self, msg: dict, now: int) -> BridgeMessage | None:
		lat = msg.get("latitude")
		lon = msg.get("longitude")
		alt = msg.get("altitude")
		if lat is None or lon is None or alt is None:
			logger.warning("rosbridge_gnss_fix_missing_fields", keys=list(msg.keys()))
			return None
		raw_status = msg.get("status", {})
		fix_status = (
			int(raw_status["status"])
			if isinstance(raw_status, dict) and "status" in raw_status
			else -1
		)
		return GnssFixMsg(
			v="1",
			type="gnss_fix",
			timestamp_ms=now,
			latitude=float(lat),
			longitude=float(lon),
			altitude_m=float(alt),
			fix_status=fix_status,
		)

	def _handle_gnss_heading(self, msg: dict, now: int) -> BridgeMessage | None:
		# nmea_navsat builds this as a pure yaw rotation (quaternion_from_euler(0, 0, heading)),
		# so a general yaw extraction recovers the original NMEA HDT heading in degrees.
		q = msg["quaternion"]
		w, x, y, z = float(q["w"]), float(q["x"]), float(q["y"]), float(q["z"])
		yaw_rad = math.atan2(2 * (w * z + x * y), 1 - 2 * (y * y + z * z))
		return GnssHeadingMsg(
			v="1", type="gnss_heading", timestamp_ms=now, heading_deg=math.degrees(yaw_rad) % 360
		)

	def _handle_gnss_velocity(self, msg: dict, now: int) -> BridgeMessage | None:
		# nmea_navsat encodes VTG speed/course as ENU components:
		# linear.x = speed*sin(course), linear.y = speed*cos(course).
		lin = msg["twist"]["linear"]
		vx, vy = float(lin["x"]), float(lin["y"])
		speed_ms = math.hypot(vx, vy)

		# EMA on the vector components, not the angle -- see GNSS_VEL_EMA_ALPHA's own comment.
		alpha = GNSS_VEL_EMA_ALPHA
		ema_vx = (
			vx
			if self._gnss_vel_ema_vx is None
			else alpha * vx + (1 - alpha) * self._gnss_vel_ema_vx
		)
		ema_vy = (
			vy
			if self._gnss_vel_ema_vy is None
			else alpha * vy + (1 - alpha) * self._gnss_vel_ema_vy
		)
		self._gnss_vel_ema_vx = ema_vx
		self._gnss_vel_ema_vy = ema_vy

		course_deg = (
			math.degrees(math.atan2(ema_vx, ema_vy)) % 360 if speed_ms >= MIN_COG_SPEED_MS else None
		)
		return GnssVelocityMsg(
			v="1",
			type="gnss_velocity",
			timestamp_ms=now,
			speed_ms=speed_ms,
			course_deg=course_deg,
		)

	def _handle_sim_gnss_velocity(self, msg: dict, now: int) -> BridgeMessage | None:
		data = msg["data"]
		return SimGnssVelocityMsg(
			v="1",
			type="sim_gnss_velocity",
			timestamp_ms=now,
			speed=float(data[0]),
			heading_rad=float(data[1]),
		)

	def _handle_sim_imu(self, msg: dict, now: int) -> BridgeMessage | None:
		lin = msg["linear"]
		ang = msg["angular"]
		return SimImuMsg(
			v="1",
			type="sim_imu",
			timestamp_ms=now,
			accel_x=float(lin["x"]),
			accel_y=float(lin["y"]),
			accel_z=float(lin["z"]),
			ang_vel_x=float(ang["x"]),
			ang_vel_y=float(ang["y"]),
			ang_vel_z=float(ang["z"]),
		)

	def _handle_imu(self, msg: dict, now: int) -> BridgeMessage | None:
		q = msg["orientation"]
		w, x, y, z = float(q["w"]), float(q["x"]), float(q["y"]), float(q["z"])
		# Standard quaternion-to-Euler (ZYX order) extraction. The yaw term is the same formula
		# already validated in _handle_gnss_heading; roll/pitch extend it to the other two axes.
		roll_rad = math.atan2(2 * (w * x + y * z), 1 - 2 * (x * x + y * y))
		pitch_rad = math.asin(max(-1.0, min(1.0, 2 * (w * y - z * x))))
		yaw_rad = math.atan2(2 * (w * z + x * y), 1 - 2 * (y * y + z * z))
		accel = msg["linear_acceleration"]
		ang_vel = msg["angular_velocity"]
		return ImuMsg(
			v="1",
			type="imu_data",
			timestamp_ms=now,
			roll_deg=math.degrees(roll_rad),
			pitch_deg=math.degrees(pitch_rad),
			yaw_deg=math.degrees(yaw_rad) % 360,
			accel_x=float(accel["x"]),
			accel_y=float(accel["y"]),
			accel_z=float(accel["z"]),
			ang_vel_x=float(ang_vel["x"]),
			ang_vel_y=float(ang_vel["y"]),
			ang_vel_z=float(ang_vel["z"]),
		)

	def _handle_sim_thruster(self, msg: dict, now: int, thruster: str) -> BridgeMessage | None:
		data = msg["data"]
		return SimThrusterFeedbackMsg(
			v="1",
			type="sim_thruster_feedback",
			timestamp_ms=now,
			thruster=thruster,  # type: ignore[arg-type]
			force=float(data[0]),
			angle=float(data[1]),
		)

	def _handle_waypoint_list(self, msg: dict, now: int) -> BridgeMessage | None:
		waypoints = [
			SimWaypoint(
				id=int(wp["id"]),
				pos_x=float(wp["pose"]["pose"]["position"]["x"]),
				pos_y=float(wp["pose"]["pose"]["position"]["y"]),
				pos_z=float(wp["pose"]["pose"]["position"]["z"]),
				switch_radius=float(wp["switch_radius"]),
				desired_speed=float(wp["desired_speed"]),
				heading_mode=int(wp["heading_mode"]),
				heading_rad=float(wp["heading"]),
			)
			for wp in msg["waypoints"]
		]
		self._check_pending_ack(waypoints)
		self._mission_tracker.record_waypoint_list_echo(waypoints)
		tracked_mission_id = self._mission_tracker.tracked_mission_id
		if tracked_mission_id is not None:
			self.broadcast_mission_execution_status(
				tracked_mission_id,
				self._mission_tracker.tracked_state,
				waypoints[0]["id"] if waypoints else None,
				len(waypoints),
				self._mission_tracker.tracked_total_count,
			)
		return SimWaypointListMsg(
			v="1", type="sim_waypoint_list", timestamp_ms=now, waypoints=waypoints
		)

	def _handle_camera_frame(self, msg: dict, now: int) -> BridgeMessage | None:
		data_b64 = msg.get("data", "")
		if not data_b64:
			return None
		try:
			self.latest_camera_frames["main"] = base64.b64decode(data_b64)
			self._camera_frame_counters["main"] = self._camera_frame_counters.get("main", 0) + 1
			self._camera_last_frame_time["main"] = time.monotonic()
		except Exception:
			logger.warning("camera_frame_decode_error")
		return None  # served via MJPEG endpoint, not forwarded through WebSocket

	def _handle_lidar_scan(self, msg: dict, now: int) -> BridgeMessage | None:
		range_max = float(msg.get("range_max", 25.0))
		raw_ranges: list[float] = msg.get("ranges", [])
		ranges = [r if (r is not None and math.isfinite(r)) else range_max for r in raw_ranges]
		return LidarScanMsg(
			v="1",
			type="lidar_scan",
			timestamp_ms=now,
			angle_min=float(msg.get("angle_min", 0.0)),
			angle_max=float(msg.get("angle_max", 2 * math.pi)),
			angle_increment=float(msg.get("angle_increment", 0.0)),
			range_min=float(msg.get("range_min", 0.1)),
			range_max=range_max,
			ranges=ranges,
		)

	def _finalize_radar_bin(self, now: int) -> BridgeMessage | None:
		meta = self._radar_accum_meta
		if meta is None:
			return None
		return RadarSpokeMsg(
			v="1",
			type="radar_spoke",
			timestamp_ms=now,
			azimuth=meta["azimuth"],
			range_start=meta["range_start"],
			range_increment=meta["range_increment"],
			num_samples=len(self._radar_accum_intensity),
			min_intensity=int(meta["min_intensity"]),
			max_intensity=int(meta["max_intensity"]),
			intensity=self._radar_accum_intensity,
		)

	def _handle_radar_spoke(self, msg: dict, now: int) -> BridgeMessage | None:
		# rosbridge_suite's JSON wire protocol encodes ROS uint8[] fields as base64 strings, not
		# plain JSON arrays -- same treatment _handle_camera_frame already gives
		# sensor_msgs/CompressedImage.data. Verify this assumption against real radar hardware
		# once available; confirmed here only against the mock's matching encoding.
		intensity = list(base64.b64decode(msg["intensity"]))
		azimuth = float(msg["azimuth"])
		num_samples = int(msg["num_samples"])
		bin_index = int((azimuth % (2 * math.pi)) / RADAR_BIN_WIDTH_RAD) % RADAR_NUM_BINS

		# A raw spoke's shape (num_samples) can change if the operator changes the radar's range
		# setting mid-sweep; treat that the same as a bin change rather than trying to merge
		# mismatched-length intensity arrays.
		same_shape = len(self._radar_accum_intensity) == num_samples
		bin_changed = self._radar_current_bin is not None and bin_index != self._radar_current_bin
		stale = now - self._radar_accum_started_ms > RADAR_ACCUM_MAX_AGE_MS

		result: BridgeMessage | None = None
		if self._radar_current_bin is not None and (bin_changed or stale or not same_shape):
			result = self._finalize_radar_bin(now)

		if self._radar_current_bin is None or bin_changed or stale or not same_shape:
			self._radar_current_bin = bin_index
			self._radar_accum_intensity = intensity
			self._radar_accum_started_ms = now
		else:
			self._radar_accum_intensity = [
				max(a, b) for a, b in zip(self._radar_accum_intensity, intensity, strict=True)
			]

		self._radar_accum_meta = {
			"azimuth": azimuth,
			"range_start": float(msg["range_start"]),
			"range_increment": float(msg["range_increment"]),
			"min_intensity": int(msg["min_intensity"]),
			"max_intensity": int(msg["max_intensity"]),
		}

		return result

	def _handle_ais_target(self, msg: dict, now: int) -> BridgeMessage | None:
		# custom_msgs/SimpleAISdata.msg documents 102.3 as the AIS protocol's own "speed not
		# available" sentinel. Hardware/ais/ais/ais_decoder.py additionally falls back to a
		# 0.00001 placeholder when a decoded message type carries no speed field at all (e.g. a
		# base station report). Both mean "no sog"; tolerances guard against float roundtrip noise
		# on the wire rather than requiring an exact match.
		sog = float(msg["sog"])
		heading = int(msg["heading"])
		sog_kn = None if sog >= 102.25 or sog < 0.001 else sog
		heading_deg = None if heading == 511 else heading
		return AisTargetMsg(
			v="1",
			type="ais_target",
			timestamp_ms=now,
			mmsi=int(msg["mmsi"]),
			lat=float(msg["lat"]),
			lon=float(msg["lon"]),
			sog_kn=sog_kn,
			heading_deg=heading_deg,
		)

	def _cartesian_to_latlon(self, x_m: float, y_m: float) -> tuple[float, float]:
		"""Convert local Cartesian metres (X=East, Y=North) to WGS84 degrees."""
		return local_cartesian_to_latlon(x_m, y_m, self._gnss_origin_lat, self._gnss_origin_lon)

	def _make_status_msg(self) -> BridgeStatusMsg:
		return BridgeStatusMsg(
			v="1",
			type="bridge_status",
			timestamp_ms=int(time.time() * 1000),
			connected=self._connected,
			bridge_url=self._url,
			target=self._target,
		)

	def _push_status_to(self, q: "asyncio.Queue[BridgeMessage]") -> None:
		with contextlib.suppress(asyncio.QueueFull):
			q.put_nowait(self._make_status_msg())

	def _push_camera_status_to(self, q: "asyncio.Queue[BridgeMessage]") -> None:
		now_ms = int(time.time() * 1000)
		now = time.monotonic()
		for camera_id, _connected in self._camera_connected.items():
			last = self._camera_last_frame_time.get(camera_id, 0.0)
			current = (now - last) < 3.0
			with contextlib.suppress(asyncio.QueueFull):
				q.put_nowait(
					CameraStatusMsg(
						v="1",
						type="camera_status",
						timestamp_ms=now_ms,
						camera_id=camera_id,
						connected=current,
					)
				)

	def _push_mission_execution_status_to(self, q: "asyncio.Queue[BridgeMessage]") -> None:
		"""Push the currently tracked mission's execution status immediately, mirroring
		_push_status_to/_push_camera_status_to -- otherwise a client that connects (or
		reconnects, e.g. on page refresh) after a mission was already started has no way to learn
		its live state until the next /waypoint_list echo or command broadcast happens to fire."""
		tracked_mission_id = self._mission_tracker.tracked_mission_id
		if tracked_mission_id is None:
			return
		waypoints = self._mission_tracker.latest_waypoint_list
		current_waypoint_seq = waypoints[0]["id"] if waypoints else None
		total_count = self._mission_tracker.tracked_total_count
		remaining_count = len(waypoints) if waypoints is not None else total_count
		with contextlib.suppress(asyncio.QueueFull):
			q.put_nowait(
				MissionExecutionStatusMsg(
					v="1",
					type="mission_execution_status",
					timestamp_ms=int(time.time() * 1000),
					mission_id=tracked_mission_id,
					state=self._mission_tracker.tracked_state,
					current_waypoint_seq=current_waypoint_seq,
					remaining_count=remaining_count,
					total_count=total_count,
				)
			)

	def _broadcast(self, msg: BridgeMessage) -> None:
		for q in list(self._subscribers):
			with contextlib.suppress(asyncio.QueueFull):
				q.put_nowait(msg)

	def _broadcast_status(self) -> None:
		self._broadcast(self._make_status_msg())

	async def _heartbeat_loop(self) -> None:
		_CAMERA_TIMEOUT_S = 3.0
		while True:
			await asyncio.sleep(1.0)
			now = time.monotonic()
			now_ms = int(time.time() * 1000)
			if self._connected:
				await self.publish("/heartbeat", "std_msgs/Bool", {"data": True})
			for camera_id in {"main"}:
				last = self._camera_last_frame_time.get(camera_id, 0.0)
				connected = (now - last) < _CAMERA_TIMEOUT_S
				if connected != self._camera_connected.get(camera_id):
					self._camera_connected[camera_id] = connected
					self._broadcast(
						CameraStatusMsg(
							v="1",
							type="camera_status",
							timestamp_ms=now_ms,
							camera_id=camera_id,
							connected=connected,
						)
					)
