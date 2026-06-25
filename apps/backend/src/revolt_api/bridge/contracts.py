from typing import Literal

from typing_extensions import TypedDict

# Version literal embedded in every message. Bump per-type (not globally) on breaking changes.
# Never remove fields within a version; add new optional fields instead.


class BatteryMsg(TypedDict):
	v: Literal["1"]
	type: Literal["battery"]
	timestamp_ms: int  # unix epoch ms, UTC, set at backend receive time
	voltage_v: float   # raw volts from /arduino/stern/battery_voltage


class CurrentMsg(TypedDict):
	v: Literal["1"]
	type: Literal["current"]
	timestamp_ms: int
	location: Literal["stern_port", "stern_star", "bow"]
	raw_adc: int    # 0-1023 from std_msgs/Int16
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
	connected: bool   # true when backend has a live connection to rosbridge
	bridge_url: str
	target: str       # "physical" or "simulation"


class PingMsg(TypedDict):
	v: Literal["1"]
	type: Literal["ping"]
	server_ms: int    # backend unix epoch ms; frontend computes Date.now() - server_ms for latency


# Simulation (pygemini/STC) message contracts


class SimHullPositionMsg(TypedDict):
	v: Literal["1"]
	type: Literal["sim_hull_position"]
	timestamp_ms: int
	pos_x: float      # PoseStamped.pose.position.x; frame_id="map" (coordinate TBD: NED or WGS84)
	pos_y: float
	pos_z: float
	orient_x: float   # PoseStamped.pose.orientation.x (quaternion, ZYX extrinsic)
	orient_y: float
	orient_z: float
	orient_w: float


class SimHullVelocityMsg(TypedDict):
	v: Literal["1"]
	type: Literal["sim_hull_velocity"]
	timestamp_ms: int
	vel_x: float      # Twist.linear.x, m/s
	vel_y: float
	vel_z: float
	ang_vel_x: float  # Twist.angular.x, rad/s (NOT converted to degrees)
	ang_vel_y: float
	ang_vel_z: float


class GnssFixMsg(TypedDict):
	v: Literal["1"]
	type: Literal["gnss_fix"]
	timestamp_ms: int
	latitude: float    # degrees, WGS84
	longitude: float   # degrees, WGS84
	altitude_m: float  # metres above WGS84 ellipsoid
	fix_status: int    # NavSatFix.status.status: -1=NO_FIX, 0=FIX, 1=SBAS, 2=GBAS; -1 if field absent


class SimGnssVelocityMsg(TypedDict):
	v: Literal["1"]
	type: Literal["sim_gnss_velocity"]
	timestamp_ms: int
	speed: float        # Float32MultiArray.data[0], m/s
	heading_rad: float  # Float32MultiArray.data[1], radians


class SimImuMsg(TypedDict):
	v: Literal["1"]
	type: Literal["sim_imu"]
	timestamp_ms: int
	accel_x: float    # Twist.linear.x, m/s²
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
	force: float   # Float32MultiArray.data[0]
	angle: float   # Float32MultiArray.data[1]


class SimWaypoint(TypedDict):
	id: int
	pos_x: float          # PoseStamped.pose.position.x; frame TBD
	pos_y: float
	pos_z: float
	switch_radius: float
	desired_speed: float   # m/s; 0 or NaN means use route default
	heading_mode: int      # 0=NONE 1=TANGENT 2=ABSOLUTE
	heading_rad: float     # radians, used when heading_mode==ABSOLUTE


class SimWaypointListMsg(TypedDict):
	v: Literal["1"]
	type: Literal["sim_waypoint_list"]
	timestamp_ms: int
	waypoints: list[SimWaypoint]


BridgeMessage = (
	BatteryMsg
	| CurrentMsg
	| TemperatureMsg
	| HumidityMsg
	| ControlModeMsg
	| EmergencyStopMsg
	| LinearActuatorMsg
	| BridgeStatusMsg
	| PingMsg
	| GnssFixMsg
	| SimHullPositionMsg
	| SimHullVelocityMsg
	| SimGnssVelocityMsg
	| SimImuMsg
	| SimThrusterFeedbackMsg
	| SimWaypointListMsg
)

_CONTROL_MODE_MAP: dict[int, str] = {
	0: "manual",
	1: "manual_assisted",
	2: "autonomous",
	3: "miscommunication",
}
_ADC_TO_AMPS = 30.0 / 1023.0
