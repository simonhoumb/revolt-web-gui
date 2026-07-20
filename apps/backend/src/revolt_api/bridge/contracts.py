from typing import Literal

from typing_extensions import TypedDict

# Version literal embedded in every message. Bump per-type (not globally) on breaking changes.
# Never remove fields within a version; add new optional fields instead.


class BatteryMsg(TypedDict):
	v: Literal["1"]
	type: Literal["battery"]
	timestamp_ms: int  # unix epoch ms, UTC, set at backend receive time
	voltage_v: float  # raw volts from /arduino/stern/battery_voltage


class CurrentMsg(TypedDict):
	v: Literal["1"]
	type: Literal["current"]
	timestamp_ms: int
	location: Literal["stern_port", "stern_star", "bow"]
	raw_adc: int  # 0-1023 from std_msgs/Int16
	amperes: float  # raw_adc * 30.0 / 1023.0 via ACS712 formula


class TemperatureMsg(TypedDict):
	v: Literal["1"]
	type: Literal["temperature"]
	timestamp_ms: int
	location: Literal["stern", "bow"]
	value_c: float


class HumidityMsg(TypedDict):
	v: Literal["1"]
	type: Literal["humidity"]
	timestamp_ms: int
	location: Literal["stern", "bow"]
	value_pct: float


class AzimuthFeedbackMsg(TypedDict):
	v: Literal["1"]
	type: Literal["azimuth_feedback"]
	timestamp_ms: int
	location: Literal["port", "starboard"]
	angle_deg: float


class RcRemoteMsg(TypedDict):
	v: Literal["1"]
	type: Literal["rc_remote"]
	timestamp_ms: int
	throttle: int  # raw PWM, 1070-1930
	aileron: int  # raw PWM, 1070-1930
	rudder: int  # raw PWM, 1070-1930
	gear: Literal["manual", "auto"]  # 0=manual, 1=auto


class ControlModeMsg(TypedDict):
	v: Literal["1"]
	type: Literal["control_mode"]
	timestamp_ms: int
	mode: Literal["manual", "manual_assisted", "autonomous", "miscommunication"]


class EmergencyStopMsg(TypedDict):
	v: Literal["1"]
	type: Literal["emergency_stop"]
	timestamp_ms: int
	active: bool  # true when UInt8 value != 0


class LinearActuatorMsg(TypedDict):
	v: Literal["1"]
	type: Literal["linear_actuator"]
	timestamp_ms: int
	retracted: bool  # true when UInt8 value == 1


class BridgeStatusMsg(TypedDict):
	v: Literal["1"]
	type: Literal["bridge_status"]
	timestamp_ms: int
	connected: bool  # true when backend has a live connection to rosbridge
	bridge_url: str
	target: str  # "physical" or "simulation"


class CameraStatusMsg(TypedDict):
	v: Literal["1"]
	type: Literal["camera_status"]
	timestamp_ms: int
	camera_id: str  # e.g. "main"
	connected: bool  # true when a frame was received within the last 3 seconds


class PingMsg(TypedDict):
	v: Literal["1"]
	type: Literal["ping"]
	server_ms: int  # backend unix epoch ms; frontend computes Date.now() - server_ms for latency


# Simulation (pygemini/STC) message contracts


class SimHullPositionMsg(TypedDict):
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
	v: Literal["1"]
	type: Literal["gnss_fix"]
	timestamp_ms: int
	latitude: float  # degrees, WGS84
	longitude: float  # degrees, WGS84
	altitude_m: float  # metres above WGS84 ellipsoid
	fix_status: int  # NavSatFix.status.status: -1=NO_FIX, 0=FIX, 1=SBAS, 2=GBAS; -1 if field absent


class GnssHeadingMsg(TypedDict):
	v: Literal["1"]
	type: Literal["gnss_heading"]
	timestamp_ms: int
	heading_deg: (
		float  # true heading 0-360, from /heading QuaternionStamped yaw (VS330 GNSS compass)
	)


class GnssVelocityMsg(TypedDict):
	v: Literal["1"]
	type: Literal["gnss_velocity"]
	timestamp_ms: int
	speed_ms: float  # from /vel TwistStamped linear.x/y magnitude (VS330 GNSS compass, VTG-derived)
	course_deg: float  # course over ground 0-360, from /vel TwistStamped linear.x/y bearing


class SimGnssVelocityMsg(TypedDict):
	v: Literal["1"]
	type: Literal["sim_gnss_velocity"]
	timestamp_ms: int
	speed: float  # Float32MultiArray.data[0], m/s
	heading_rad: float  # Float32MultiArray.data[1], radians


class SimImuMsg(TypedDict):
	v: Literal["1"]
	type: Literal["sim_imu"]
	timestamp_ms: int
	accel_x: float  # Twist.linear.x, m/s²
	accel_y: float
	accel_z: float
	ang_vel_x: float  # Twist.angular.x, rad/s
	ang_vel_y: float
	ang_vel_z: float


class SimThrusterFeedbackMsg(TypedDict):
	v: Literal["1"]
	type: Literal["sim_thruster_feedback"]
	timestamp_ms: int
	thruster: Literal["bow", "port", "starboard"]
	force: float  # Float32MultiArray.data[0]
	angle: float  # Float32MultiArray.data[1]


class SimWaypoint(TypedDict):
	id: int
	pos_x: float  # PoseStamped.pose.position.x; frame TBD
	pos_y: float
	pos_z: float
	switch_radius: float
	desired_speed: float  # m/s; 0 or NaN means use route default
	heading_mode: int  # 0=NONE 1=TANGENT 2=ABSOLUTE
	heading_rad: float  # radians, used when heading_mode==ABSOLUTE


class SimWaypointListMsg(TypedDict):
	v: Literal["1"]
	type: Literal["sim_waypoint_list"]
	timestamp_ms: int
	waypoints: list[SimWaypoint]


MissionSendStatus = Literal["sending", "acknowledged", "timed_out", "not_connected", "mismatched"]


class MissionSendStatusMsg(TypedDict):
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
	v: Literal["1"]
	type: Literal["mission_execution_status"]
	timestamp_ms: int
	mission_id: str
	state: MissionExecutionState
	current_waypoint_seq: int | None  # first element's id from the live /waypoint_list echo
	remaining_count: int
	total_count: int


class LidarScanMsg(TypedDict):
	v: Literal["1"]
	type: Literal["lidar_scan"]
	timestamp_ms: int
	angle_min: float  # radians, first scan angle
	angle_max: float  # radians, last scan angle
	angle_increment: float  # radians between consecutive measurements
	range_min: float  # metres, minimum valid range
	range_max: float  # metres, maximum valid range
	ranges: list[float]  # metres per step; inf/NaN replaced with range_max


class RadarSpokeMsg(TypedDict):
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


class AisTargetMsg(TypedDict):
	v: Literal["1"]
	type: Literal["ais_target"]
	timestamp_ms: int
	mmsi: int
	lat: float
	lon: float
	sog_kn: float | None  # None when the source report has no valid speed
	heading_deg: int | None  # None when the source report has no valid heading


BridgeMessage = (
	BatteryMsg
	| CurrentMsg
	| TemperatureMsg
	| HumidityMsg
	| AzimuthFeedbackMsg
	| RcRemoteMsg
	| RadarSpokeMsg
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
	| SimThrusterFeedbackMsg
	| SimWaypointListMsg
	| MissionSendStatusMsg
	| MissionExecutionStatusMsg
	| LidarScanMsg
)

_CONTROL_MODE_MAP: dict[int, str] = {
	0: "manual",
	1: "manual_assisted",
	2: "autonomous",
	3: "miscommunication",
}
_ADC_TO_AMPS = 30.0 / 1023.0
