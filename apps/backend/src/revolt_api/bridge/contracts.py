"""Versioned TypedDict message contracts for the ROS2 bridge WebSocket connection.

Mirror of packages/shared-types/src/bridge.ts; keep the two in sync. The `v` literal is bumped
per-type (not globally) on breaking changes; never remove a field within a version, add new
optional fields instead.
"""

from typing import Literal

from typing_extensions import TypedDict


class BatteryMsg(TypedDict):
	"""Battery voltage reading from /arduino/stern/battery_voltage."""

	v: Literal["1"]
	type: Literal["battery"]
	timestamp_ms: int  # unix epoch ms, UTC, set at backend receive time
	voltage_v: float  # raw volts from /arduino/stern/battery_voltage


class CurrentMsg(TypedDict):
	"""Per-motor current draw, converted from raw ADC via the ACS712 formula."""

	v: Literal["1"]
	type: Literal["current"]
	timestamp_ms: int
	location: Literal["stern_port", "stern_star", "bow"]
	raw_adc: int  # 0-1023 from std_msgs/Int16
	amperes: float  # raw_adc * 30.0 / 1023.0 via ACS712 formula


class TemperatureMsg(TypedDict):
	"""DHT22 enclosure temperature reading, stern or bow."""

	v: Literal["1"]
	type: Literal["temperature"]
	timestamp_ms: int
	location: Literal["stern", "bow"]
	value_c: float


class HumidityMsg(TypedDict):
	"""DHT22 enclosure humidity reading, stern or bow."""

	v: Literal["1"]
	type: Literal["humidity"]
	timestamp_ms: int
	location: Literal["stern", "bow"]
	value_pct: float


class AzimuthFeedbackMsg(TypedDict):
	"""Stern thruster azimuth angle feedback, port or starboard."""

	v: Literal["1"]
	type: Literal["azimuth_feedback"]
	timestamp_ms: int
	location: Literal["port", "starboard"]
	angle_deg: float


class RcRemoteMsg(TypedDict):
	"""Raw RC transmitter channel values, from custom_msgs/RCRemote."""

	v: Literal["1"]
	type: Literal["rc_remote"]
	timestamp_ms: int
	throttle: int  # raw PWM, 1070-1930
	aileron: int  # raw PWM, 1070-1930
	rudder: int  # raw PWM, 1070-1930
	gear: Literal["manual", "auto"]  # 0=manual, 1=auto


class LightBeaconMsg(TypedDict):
	"""Stern light beacon lamp state, decoded from the firmware's red/yellow/green bitmask."""

	v: Literal["1"]
	type: Literal["light_beacon"]
	timestamp_ms: int
	red: bool
	yellow: bool
	green: bool


class ControlModeMsg(TypedDict):
	"""Current vessel control mode."""

	v: Literal["1"]
	type: Literal["control_mode"]
	timestamp_ms: int
	mode: Literal["manual", "manual_assisted", "autonomous", "miscommunication"]


class EmergencyStopMsg(TypedDict):
	"""Stern emergency-stop status."""

	v: Literal["1"]
	type: Literal["emergency_stop"]
	timestamp_ms: int
	active: bool  # true when UInt8 value != 0


class LinearActuatorMsg(TypedDict):
	"""Bow linear actuator retract/extend state."""

	v: Literal["1"]
	type: Literal["linear_actuator"]
	timestamp_ms: int
	retracted: bool  # true when UInt8 value == 1


class BridgeStatusMsg(TypedDict):
	"""Backend-to-rosbridge connection status.

	Always the first message sent after a frontend WebSocket connects, so the UI knows
	immediately whether telemetry is live before any topic data arrives.
	"""

	v: Literal["1"]
	type: Literal["bridge_status"]
	timestamp_ms: int
	connected: bool  # true when backend has a live connection to rosbridge
	bridge_url: str
	target: str  # "physical" or "simulation"


class CameraStatusMsg(TypedDict):
	"""Liveness status for a camera feed, derived from recent frame arrival."""

	v: Literal["1"]
	type: Literal["camera_status"]
	timestamp_ms: int
	camera_id: str  # e.g. "main"
	connected: bool  # true when a frame was received within the last 3 seconds


class PingMsg(TypedDict):
	"""Keepalive the frontend uses to compute round-trip latency."""

	v: Literal["1"]
	type: Literal["ping"]
	server_ms: int  # backend unix epoch ms; frontend computes Date.now() - server_ms for latency


# Simulation (pygemini/STC) message contracts


class SimHullPositionMsg(TypedDict):
	"""Simulated hull pose from the pygemini/STC simulation environment."""

	v: Literal["1"]
	type: Literal["sim_hull_position"]
	timestamp_ms: int
	pos_x: float  # PoseStamped.pose.position.x; frame_id="map" (coordinate TBD: NED or WGS84)
	pos_y: float
	pos_z: float
	orient_x: float  # PoseStamped.pose.orientation.x (quaternion, ZYX extrinsic)
	orient_y: float
	orient_z: float
	orient_w: float


class SimHullVelocityMsg(TypedDict):
	"""Simulated hull linear and angular velocity."""

	v: Literal["1"]
	type: Literal["sim_hull_velocity"]
	timestamp_ms: int
	vel_x: float  # Twist.linear.x, m/s
	vel_y: float
	vel_z: float
	ang_vel_x: float  # Twist.angular.x, rad/s (NOT converted to degrees)
	ang_vel_y: float
	ang_vel_z: float


class GnssFixMsg(TypedDict):
	"""GNSS position fix.

	Sourced from /fix on the physical vessel, or converted from the sim's local-Cartesian
	antenna position (see client.py's flat-earth projection for the sim case).
	"""

	v: Literal["1"]
	type: Literal["gnss_fix"]
	timestamp_ms: int
	latitude: float  # degrees, WGS84
	longitude: float  # degrees, WGS84
	altitude_m: float  # metres above WGS84 ellipsoid
	fix_status: int  # NavSatFix.status.status: -1=NO_FIX, 0=FIX, 1=SBAS, 2=GBAS; -1 if field absent


class GnssHeadingMsg(TypedDict):
	"""True heading from the VS330 GNSS compass's dual-antenna RTK solution."""

	v: Literal["1"]
	type: Literal["gnss_heading"]
	timestamp_ms: int
	heading_deg: (
		float  # true heading 0-360, from /heading QuaternionStamped yaw (VS330 GNSS compass)
	)


class GnssVelocityMsg(TypedDict):
	"""GNSS-derived speed and course over ground from the VS330 compass."""

	v: Literal["1"]
	type: Literal["gnss_velocity"]
	timestamp_ms: int
	speed_ms: float  # from /vel TwistStamped linear.x/y magnitude (VS330 GNSS compass, VTG-derived)
	# Course over ground 0-360, from /vel TwistStamped linear.x/y bearing. None below
	# MIN_COG_SPEED_MS in client.py; the angle is meaningless noise at near-zero speed, not
	# just imprecise.
	course_deg: float | None


class SimGnssVelocityMsg(TypedDict):
	"""Simulated GNSS speed/heading vector."""

	v: Literal["1"]
	type: Literal["sim_gnss_velocity"]
	timestamp_ms: int
	speed: float  # Float32MultiArray.data[0], m/s
	heading_rad: float  # Float32MultiArray.data[1], radians


class SimImuMsg(TypedDict):
	"""Simulated IMU linear acceleration and angular velocity."""

	v: Literal["1"]
	type: Literal["sim_imu"]
	timestamp_ms: int
	accel_x: float  # Twist.linear.x, m/s²
	accel_y: float
	accel_z: float
	ang_vel_x: float  # Twist.angular.x, rad/s
	ang_vel_y: float
	ang_vel_z: float


class ImuMsg(TypedDict):
	"""Physical IMU attitude and raw motion data from the Xsens unit.

	roll/pitch/yaw are extracted from the orientation quaternion via standard ZYX Euler formulas;
	the VS330 GNSS compass remains the authoritative heading/velocity source, this topic is
	attitude-only.
	"""

	v: Literal["1"]
	type: Literal["imu_data"]
	timestamp_ms: int
	roll_deg: float  # -180..180
	pitch_deg: float  # -90..90
	yaw_deg: float  # 0..360
	accel_x: float  # sensor_msgs/Imu.linear_acceleration, m/s²
	accel_y: float
	accel_z: float
	ang_vel_x: float  # sensor_msgs/Imu.angular_velocity, rad/s
	ang_vel_y: float
	ang_vel_z: float


class SimThrusterFeedbackMsg(TypedDict):
	"""Simulated per-thruster force/angle feedback."""

	v: Literal["1"]
	type: Literal["sim_thruster_feedback"]
	timestamp_ms: int
	thruster: Literal["bow", "port", "starboard"]
	force: float  # Float32MultiArray.data[0]
	angle: float  # Float32MultiArray.data[1]


class SimWaypoint(TypedDict):
	"""Single waypoint as echoed back by the simulation's /waypoint_list."""

	id: int
	pos_x: float  # PoseStamped.pose.position.x; frame TBD
	pos_y: float
	pos_z: float
	switch_radius: float
	desired_speed: float  # m/s; 0 or NaN means use route default
	heading_mode: int  # 0=NONE 1=TANGENT 2=ABSOLUTE
	heading_rad: float  # radians, used when heading_mode==ABSOLUTE


class SimWaypointListMsg(TypedDict):
	"""Full waypoint queue echoed back by the simulation.

	Used to confirm mission sends landed (publish_and_await_ack) and to derive live mission
	execution progress (see MissionExecutionStatusMsg).
	"""

	v: Literal["1"]
	type: Literal["sim_waypoint_list"]
	timestamp_ms: int
	waypoints: list[SimWaypoint]


MissionSendStatus = Literal["sending", "acknowledged", "timed_out", "not_connected", "mismatched"]


class MissionSendStatusMsg(TypedDict):
	"""Progress of a mission send-to-vessel operation's ack/echo flow."""

	v: Literal["1"]
	type: Literal["mission_send_status"]
	timestamp_ms: int
	mission_id: str
	status: MissionSendStatus
	waypoint_count: int


MissionExecutionState = Literal[
	"starting", "active", "pausing", "paused", "terminating", "aborted", "completed"
]


class MissionExecutionStatusMsg(TypedDict):
	"""Live mission execution progress, derived from the /waypoint_list echo.

	Presentation-only; never written to the DB (see mission_tracker.py for why).
	"""

	v: Literal["1"]
	type: Literal["mission_execution_status"]
	timestamp_ms: int
	mission_id: str
	state: MissionExecutionState
	current_waypoint_seq: int | None  # first element's id from the live /waypoint_list echo
	remaining_count: int
	total_count: int


class LidarScanMsg(TypedDict):
	"""2D lidar scan, from the Velodyne VLP-16's ring-8 horizontal slice."""

	v: Literal["1"]
	type: Literal["lidar_scan"]
	timestamp_ms: int
	angle_min: float  # radians, first scan angle
	angle_max: float  # radians, last scan angle
	angle_increment: float  # radians between consecutive measurements
	range_min: float  # metres, minimum valid range
	range_max: float  # metres, maximum valid range
	ranges: list[float]  # metres per step; inf/NaN replaced with range_max


class PointCloudMsg(TypedDict):
	"""Decimated 3D point cloud from the Velodyne VLP-16's full 16-ring sweep.

	Backend voxel-decimates before forwarding (see client.py's _handle_velodyne_points); the same
	frame LidarScanMsg's ranges are computed in.
	"""

	v: Literal["1"]
	type: Literal["point_cloud"]
	timestamp_ms: int
	# Flat, interleaved [x0,y0,z0, x1,y1,z1, ...] in metres, ROS convention (x=forward, y=left,
	# z=up). One flat list rather than a list of per-point dicts to keep the JSON payload down
	# at this point count.
	points: list[float]
	point_count: int  # len(points) // 3


class RadarSpokeMsg(TypedDict):
	"""One aggregated radar azimuth bin.

	Forwarded after RADAR_NUM_BINS-way binning (see client.py's RADAR_NUM_BINS comment); never a
	raw 1:1 spoke.
	"""

	v: Literal["1"]
	type: Literal["radar_spoke"]
	timestamp_ms: int
	azimuth: float  # radians, absolute (not relative to a prior spoke)
	range_start: float  # metres, range of the first sample
	range_increment: float  # metres between consecutive samples
	num_samples: int
	min_intensity: int  # 0-255
	max_intensity: int  # 0-255
	intensity: list[int]  # one 0-255 value per sample


class RadarPointCloudMsg(TypedDict):
	"""Cartesian radar returns, an alternative representation to RadarSpokeMsg's polar bins.

	Kept alongside RadarSpokeMsg while the two are evaluated against each other (see client.py's
	_handle_radar_points); not the widget's actual data source yet.
	"""

	v: Literal["1"]
	type: Literal["radar_point_cloud"]
	timestamp_ms: int
	# Flat, interleaved [x0,y0,z0,i0, x1,y1,z1,i1, ...] in metres / 0-255 intensity. Same flat-array
	# convention as PointCloudMsg, extended with a per-point intensity value -- radar echo strength
	# drives the widget's brightness, unlike lidar's flattened 2D view, which doesn't use one.
	points: list[float]
	point_count: int  # len(points) // 4


class AisTargetMsg(TypedDict):
	"""Decoded AIS target report, keyed by MMSI on the frontend."""

	v: Literal["1"]
	type: Literal["ais_target"]
	timestamp_ms: int
	mmsi: int
	lat: float
	lon: float
	sog_kn: float | None  # None when the source report has no valid speed
	heading_deg: int | None  # None when the source report has no valid heading
	cog_deg: float | None  # course over ground, distinct from heading_deg; None when unavailable
	turn_deg_per_min: float | None  # rate of turn, +right/-left; None when unavailable
	# Raw AIS navigational status code (0-15, e.g. 0=under way using engine, 1=at anchor,
	# 5=moored); 15 ("undefined") is itself a real status, not absence of data, so this is never
	# null the way the other AIS-derived fields above are.
	nav_status: int


BridgeMessage = (
	BatteryMsg
	| CurrentMsg
	| TemperatureMsg
	| HumidityMsg
	| AzimuthFeedbackMsg
	| RcRemoteMsg
	| LightBeaconMsg
	| RadarSpokeMsg
	| RadarPointCloudMsg
	| AisTargetMsg
	| ControlModeMsg
	| EmergencyStopMsg
	| LinearActuatorMsg
	| BridgeStatusMsg
	| CameraStatusMsg
	| PingMsg
	| GnssFixMsg
	| GnssHeadingMsg
	| GnssVelocityMsg
	| SimHullPositionMsg
	| SimHullVelocityMsg
	| SimGnssVelocityMsg
	| SimImuMsg
	| ImuMsg
	| SimThrusterFeedbackMsg
	| SimWaypointListMsg
	| MissionSendStatusMsg
	| MissionExecutionStatusMsg
	| LidarScanMsg
	| PointCloudMsg
)

_CONTROL_MODE_MAP: dict[int, str] = {
	0: "manual",
	1: "manual_assisted",
	2: "autonomous",
	3: "miscommunication",
}
_ADC_TO_AMPS = 30.0 / 1023.0
