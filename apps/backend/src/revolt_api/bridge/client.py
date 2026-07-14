import asyncio
import base64
import contextlib
import json
import math
import time
from dataclasses import dataclass, field
from typing import Literal

import structlog
from websockets.asyncio.client import connect

from revolt_api.bridge.contracts import (
	_ADC_TO_AMPS,
	_CONTROL_MODE_MAP,
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
	LidarScanMsg,
	LinearActuatorMsg,
	MissionExecutionState,
	MissionExecutionStatusMsg,
	MissionSendStatus,
	MissionSendStatusMsg,
	SimGnssVelocityMsg,
	SimHullPositionMsg,
	SimHullVelocityMsg,
	SimImuMsg,
	SimThrusterFeedbackMsg,
	SimWaypoint,
	SimWaypointListMsg,
	TemperatureMsg,
)
from revolt_api.bridge.protocol import (
	PHYSICAL_SUBSCRIBE_TOPICS,
	SIMULATION_SUBSCRIBE_TOPICS,
	RosBridgePublishOut,
	RosBridgeSubscribe,
	get_subscribe_topics,
)

logger = structlog.get_logger(__name__)

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

		# Latest /waypoint_list echo, i.e. whatever the vessel's queue actually still contains
		# right now (already reflects any waypoints it has popped as reached). Used both to
		# snapshot a resume point on pause and to derive live current-waypoint/progress status.
		self.latest_waypoint_list: list[SimWaypoint] | None = None
		# Snapshot of the remaining queue taken at pause time, keyed by mission id, so a
		# subsequent Start resumes from where the vessel actually was instead of resending the
		# full original mission. In-memory by design: it must always match the vessel's real
		# queue, which a DB-persisted guess could drift from; lost on backend restart, same as
		# the rest of this client's connection state.
		self.resume_cache: dict[str, list[SimWaypoint]] = {}
		self._tracked_mission_id: str | None = None
		self._tracked_total_count: int = 0
		self._tracked_state: MissionExecutionState = "active"

		# Build a topic → throttle-seconds lookup covering both target inventories so that
		# _dispatch() can drop messages for high-freq topics before they reach browser queues.
		all_specs = [*PHYSICAL_SUBSCRIBE_TOPICS, *SIMULATION_SUBSCRIBE_TOPICS]
		self._topic_throttle: dict[str, float] = {
			spec.topic: spec.frontend_throttle_ms / 1000.0
			for spec in all_specs
			if spec.frontend_throttle_ms > 0
		}
		self._topic_last_emit: dict[str, float] = {}

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

	def _check_pending_ack(self, waypoints: list[SimWaypoint]) -> None:
		pending = self._pending_ack
		if pending is None:
			return
		actual = [(wp["id"], wp["pos_x"], wp["pos_y"]) for wp in waypoints]
		matches = len(actual) == len(pending.expected) and all(
			a_id == e_id and math.isclose(a_x, e_x, abs_tol=0.5) and math.isclose(a_y, e_y, abs_tol=0.5)
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
		self._tracked_mission_id = mission_id
		self._tracked_total_count = total_count
		self._tracked_state = "starting"

	def untrack_mission(self) -> None:
		"""Stop deriving live execution status. Called by the terminate endpoint."""
		self._tracked_mission_id = None
		self._tracked_total_count = 0

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
		if self._tracked_mission_id != mission_id:
			return
		self._tracked_state = state
		self.broadcast_mission_execution_status(
			mission_id, state, current_waypoint_seq, remaining_count, self._tracked_total_count
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

	def latlon_to_cartesian(self, lat: float, lon: float) -> tuple[float, float]:
		"""Convert WGS84 degrees to local Cartesian metres (X=East, Y=North). Inverse of
		_cartesian_to_latlon, used when serialising outbound waypoints for the sim."""
		x = (lon - self._gnss_origin_lon) * 111320.0 * math.cos(math.radians(self._gnss_origin_lat))
		y = (lat - self._gnss_origin_lat) * 111320.0
		return x, y

	@property
	def connected(self) -> bool:
		return self._connected

	@property
	def target(self) -> str:
		return self._target

	@property
	def tracked_mission_id(self) -> str | None:
		return self._tracked_mission_id

	@property
	def tracked_state(self) -> MissionExecutionState:
		return self._tracked_state

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
		if data.get("op") != "publish":
			return
		topic = data.get("topic", "")
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
		now = int(time.time() * 1000)
		match topic:
			case "/arduino/stern/battery_voltage":
				return BatteryMsg(
					v="1", type="battery", timestamp_ms=now, voltage_v=float(msg["data"])
				)
			case "/arduino/stern/port/current":
				raw = int(msg["data"])
				return CurrentMsg(
					v="1",
					type="current",
					timestamp_ms=now,
					location="stern_port",
					raw_adc=raw,
					amperes=float(raw),  # firmware sends Amps (ACS712 formula applied on Arduino)
				)
			case "/arduino/stern/starboard/current":
				raw = int(msg["data"])
				return CurrentMsg(
					v="1",
					type="current",
					timestamp_ms=now,
					location="stern_star",
					raw_adc=raw,
					amperes=float(raw),  # firmware sends Amps (ACS712 formula applied on Arduino)
				)
			case "/arduino/bow/current":
				raw = int(msg["data"])
				return CurrentMsg(
					v="1",
					type="current",
					timestamp_ms=now,
					location="bow",
					raw_adc=raw,
					amperes=round(raw * _ADC_TO_AMPS, 2),
				)
			case "/arduino/stern/dht22/temperature":
				return TemperatureMsg(
					v="1",
					type="temperature",
					timestamp_ms=now,
					location="stern",
					value_c=float(msg["data"]),
				)
			case "/arduino/stern/dht22/humidity":
				return HumidityMsg(
					v="1",
					type="humidity",
					timestamp_ms=now,
					location="stern",
					value_pct=float(msg["data"]),
				)
			case "/arduino/bow/dht22/temperature":
				return TemperatureMsg(
					v="1",
					type="temperature",
					timestamp_ms=now,
					location="bow",
					value_c=float(msg["data"]),
				)
			case "/arduino/bow/dht22/humidity":
				return HumidityMsg(
					v="1",
					type="humidity",
					timestamp_ms=now,
					location="bow",
					value_pct=float(msg["data"]),
				)
			case "/arduino/stern/emergency_stop_status":
				return EmergencyStopMsg(
					v="1",
					type="emergency_stop",
					timestamp_ms=now,
					active=int(msg["data"]) != 0,
				)
			case "/arduino/bow/linear_actuator_retract_state":
				return LinearActuatorMsg(
					v="1",
					type="linear_actuator",
					timestamp_ms=now,
					retracted=int(msg["data"]) == 1,
				)
			case "/control_mode":
				raw_mode = int(msg["data"])
				return ControlModeMsg(
					v="1",
					type="control_mode",
					timestamp_ms=now,
					mode=_CONTROL_MODE_MAP.get(raw_mode, "miscommunication"),  # type: ignore[arg-type]
				)
			case "/revolt/sim/stc/position/hull":
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
			case "/revolt/sim/stc/position/velocity":
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
			case "/revolt/sim/stc/gnss/antenna1/position":
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
			case "/revolt/sim/stc/gnss/antenna2/position":
				return None  # antenna2 not forwarded; antenna1 is the primary position source
			case "/fix":
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
			case "/heading":
				# nmea_navsat builds this as a pure yaw rotation (quaternion_from_euler(0, 0, heading)),
				# so a general yaw extraction recovers the original NMEA HDT heading in degrees.
				q = msg["quaternion"]
				w, x, y, z = float(q["w"]), float(q["x"]), float(q["y"]), float(q["z"])
				yaw_rad = math.atan2(2 * (w * z + x * y), 1 - 2 * (y * y + z * z))
				return GnssHeadingMsg(
					v="1",
					type="gnss_heading",
					timestamp_ms=now,
					heading_deg=math.degrees(yaw_rad) % 360,
				)
			case "/vel":
				# nmea_navsat encodes VTG speed/course as ENU components:
				# linear.x = speed*sin(course), linear.y = speed*cos(course).
				lin = msg["twist"]["linear"]
				vx, vy = float(lin["x"]), float(lin["y"])
				return GnssVelocityMsg(
					v="1",
					type="gnss_velocity",
					timestamp_ms=now,
					speed_ms=math.hypot(vx, vy),
					course_deg=math.degrees(math.atan2(vx, vy)) % 360,
				)
			case "/revolt/sim/stc/gnss/velocity_vector":
				data = msg["data"]
				return SimGnssVelocityMsg(
					v="1",
					type="sim_gnss_velocity",
					timestamp_ms=now,
					speed=float(data[0]),
					heading_rad=float(data[1]),
				)
			case "/revolt/sim/stc/imu/data":
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
			case "/thruster/bow":
				data = msg["data"]
				return SimThrusterFeedbackMsg(
					v="1",
					type="sim_thruster_feedback",
					timestamp_ms=now,
					thruster="bow",
					force=float(data[0]),
					angle=float(data[1]),
				)
			case "/thruster/port":
				data = msg["data"]
				return SimThrusterFeedbackMsg(
					v="1",
					type="sim_thruster_feedback",
					timestamp_ms=now,
					thruster="port",
					force=float(data[0]),
					angle=float(data[1]),
				)
			case "/thruster/starboard":
				data = msg["data"]
				return SimThrusterFeedbackMsg(
					v="1",
					type="sim_thruster_feedback",
					timestamp_ms=now,
					thruster="starboard",
					force=float(data[0]),
					angle=float(data[1]),
				)
			case "/waypoint_list":
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
				self.latest_waypoint_list = waypoints
				if self._tracked_mission_id is not None:
					self.broadcast_mission_execution_status(
						self._tracked_mission_id,
						self._tracked_state,
						waypoints[0]["id"] if waypoints else None,
						len(waypoints),
						self._tracked_total_count,
					)
				return SimWaypointListMsg(
					v="1",
					type="sim_waypoint_list",
					timestamp_ms=now,
					waypoints=waypoints,
				)
			case "/camera/camera/color/image_raw/compressed":
				data_b64 = msg.get("data", "")
				if not data_b64:
					return None
				try:
					self.latest_camera_frames["main"] = base64.b64decode(data_b64)
					self._camera_frame_counters["main"] = (
						self._camera_frame_counters.get("main", 0) + 1
					)
					self._camera_last_frame_time["main"] = time.monotonic()
				except Exception:
					logger.warning("camera_frame_decode_error")
				return None  # served via MJPEG endpoint, not forwarded through WebSocket
			case "/scan":
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
			case _:
				return None

	def _cartesian_to_latlon(self, x_m: float, y_m: float) -> tuple[float, float]:
		"""Convert local Cartesian metres (X=East, Y=North) to WGS84 degrees."""
		lat = self._gnss_origin_lat + y_m / 111320.0
		lon = self._gnss_origin_lon + x_m / (
			111320.0 * math.cos(math.radians(self._gnss_origin_lat))
		)
		return lat, lon

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
		for camera_id, connected in self._camera_connected.items():
			last = self._camera_last_frame_time.get(camera_id, 0.0)
			current = (now - last) < 3.0
			with contextlib.suppress(asyncio.QueueFull):
				q.put_nowait(CameraStatusMsg(
					v="1",
					type="camera_status",
					timestamp_ms=now_ms,
					camera_id=camera_id,
					connected=current,
				))

	def _push_mission_execution_status_to(self, q: "asyncio.Queue[BridgeMessage]") -> None:
		"""Push the currently tracked mission's execution status immediately, mirroring
		_push_status_to/_push_camera_status_to -- otherwise a client that connects (or
		reconnects, e.g. on page refresh) after a mission was already started has no way to learn
		its live state until the next /waypoint_list echo or command broadcast happens to fire."""
		if self._tracked_mission_id is None:
			return
		waypoints = self.latest_waypoint_list
		current_waypoint_seq = waypoints[0]["id"] if waypoints else None
		remaining_count = len(waypoints) if waypoints is not None else self._tracked_total_count
		with contextlib.suppress(asyncio.QueueFull):
			q.put_nowait(
				MissionExecutionStatusMsg(
					v="1",
					type="mission_execution_status",
					timestamp_ms=int(time.time() * 1000),
					mission_id=self._tracked_mission_id,
					state=self._tracked_state,
					current_waypoint_seq=current_waypoint_seq,
					remaining_count=remaining_count,
					total_count=self._tracked_total_count,
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
					self._broadcast(CameraStatusMsg(
						v="1",
						type="camera_status",
						timestamp_ms=now_ms,
						camera_id=camera_id,
						connected=connected,
					))
