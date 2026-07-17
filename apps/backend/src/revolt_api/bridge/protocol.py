from dataclasses import dataclass
from typing import Any, Literal

from typing_extensions import TypedDict


@dataclass(frozen=True)
class TopicSpec:
	topic: str
	ros_type: str
	throttle_rate_ms: int = (
		0  # rosbridge inbound throttle: drops messages before they reach the backend
	)
	frontend_throttle_ms: int = (
		0  # backend fan-out throttle: drops messages before they reach browser queues
	)
	description: str = ""


# Topics published by the physical vessel hardware interface
PHYSICAL_SUBSCRIBE_TOPICS: list[TopicSpec] = [
	TopicSpec(
		"/arduino/stern/battery_voltage",
		"std_msgs/Float32",
		description="Raw battery voltage in volts",
	),
	TopicSpec(
		"/arduino/stern/port/current",
		"std_msgs/Int16",
		description="Port motor ADC reading 0-1023 (0-30 A via ACS712)",
	),
	TopicSpec(
		"/arduino/stern/starboard/current",
		"std_msgs/Int16",
		description="Starboard motor ADC reading 0-1023 (0-30 A via ACS712)",
	),
	TopicSpec(
		"/arduino/bow/current",
		"std_msgs/Int16",
		description="Bow motor ADC reading 0-1023 (0-30 A via ACS712)",
	),
	TopicSpec(
		"/arduino/stern/dht22/temperature",
		"std_msgs/Float32",
		description="Stern enclosure temperature in °C",
	),
	TopicSpec(
		"/arduino/stern/dht22/humidity",
		"std_msgs/Float32",
		description="Stern enclosure relative humidity in %",
	),
	TopicSpec(
		"/arduino/bow/dht22/temperature",
		"std_msgs/Float32",
		description="Bow enclosure temperature in °C",
	),
	TopicSpec(
		"/arduino/bow/dht22/humidity",
		"std_msgs/Float32",
		description="Bow enclosure relative humidity in %",
	),
	TopicSpec(
		"/arduino/stern/emergency_stop_status",
		"std_msgs/UInt16",
		description="Emergency stop state: 0=running, non-zero=stopped",
	),
	TopicSpec(
		"/arduino/bow/linear_actuator_retract_state",
		"std_msgs/UInt16",
		description="Bow linear actuator retract state: 1=retracted",
	),
	TopicSpec(
		"/thruster/port/feedback_angle",
		"std_msgs/Float32",
		description="Port azimuth thruster actual angle feedback, degrees",
	),
	TopicSpec(
		"/thruster/starboard/feedback_angle",
		"std_msgs/Float32",
		description="Starboard azimuth thruster actual angle feedback, degrees",
	),
	TopicSpec(
		"/arduino/stern/rc_remote_input",
		"custom_msgs/RCRemote",
		description=(
			"RC transmitter raw stick/switch values: throttle, aileron, elevation "
			"(unused), rudder, gear (0=manual, 1=auto), aux (unused)"
		),
	),
	TopicSpec(
		"/control_mode",
		"std_msgs/UInt8",
		description="Control mode: 0=manual 1=manual_assisted 2=autonomous 3=miscommunication",
	),
	TopicSpec(
		"/fix",
		"sensor_msgs/NavSatFix",
		description=(
			"Primary GNSS fix (WGS84): latitude, longitude, altitude. "
			"Published by the Hemisphere Vector VS330 GNSS compass via nmea_navsat."
		),
	),
	TopicSpec(
		"/vel",
		"geometry_msgs/TwistStamped",
		description=(
			"GNSS speed/course over ground (VTG-derived), ENU linear.x/y components. "
			"Published by the Hemisphere Vector VS330 GNSS compass via nmea_navsat."
		),
	),
	TopicSpec(
		"/heading",
		"geometry_msgs/QuaternionStamped",
		description=(
			"True heading as a yaw-only quaternion, derived from the NMEA HDT sentence. "
			"Published by the Hemisphere Vector VS330 GNSS compass (dual-antenna RTK "
			"heading computed in receiver firmware) via nmea_navsat."
		),
	),
	TopicSpec(
		"/camera/camera/color/image_raw/compressed",
		"sensor_msgs/CompressedImage",
		throttle_rate_ms=100,
		description=(
			"Intel RealSense D456 color camera, JPEG-compressed via image_transport "
			"(realsense2_camera v4.x — namespace is /camera/camera/). Frame stored by "
			"bridge client; served via MJPEG HTTP endpoint, not forwarded through WebSocket."
		),
	),
	TopicSpec(
		"/scan",
		"sensor_msgs/LaserScan",
		throttle_rate_ms=100,
		frontend_throttle_ms=100,
		description=(
			"2D LaserScan (ring 8, horizontal mid-layer) derived from Velodyne VLP-16 "
			"PointCloud2 by velodyne_laserscan node. ~1800 points per 360° sweep at 10 Hz."
		),
	),
	# Xsens IMU (/filter/quaternion, /filter/velocity), radar: not wired up yet.
	# GNSS heading/velocity use the VS330 compass (/heading, /vel) as the
	# authoritative source; Xsens is a candidate fallback, not implemented.
]

PHYSICAL_PUBLISH_TOPICS: list[TopicSpec] = [
	TopicSpec(
		"/thrusterAllocation/stern_thruster_setpoints",
		"revolt_msgs/SternThrusterSetpoints",
		description="Stern thruster setpoints: star_effort and port_effort (0-100%)",
	),
	TopicSpec("/bow_control", "revolt_msgs/BowControl"),
	TopicSpec("/control_mode", "std_msgs/UInt8"),
	TopicSpec("/heartbeat", "std_msgs/Bool", description="Must publish at 1 Hz"),
]

# Topics published by the pygemini/STC simulation environment (discovered via ros2 topic list -v).
SIMULATION_SUBSCRIBE_TOPICS: list[TopicSpec] = [
	TopicSpec(
		"/revolt/sim/stc/position/hull",
		"geometry_msgs/PoseStamped",
		frontend_throttle_ms=100,
		description=(
			"Hull position: pose.position={x,y,z} (frame_id='map', coordinate TBD: NED or WGS84), "
			"pose.orientation={x,y,z,w} quaternion (ZYX extrinsic from DDS radians)"
		),
	),
	TopicSpec(
		"/revolt/sim/stc/position/velocity",
		"geometry_msgs/Twist",
		frontend_throttle_ms=100,
		description="Hull velocity: linear={x,y,z} m/s, angular={x,y,z} rad/s",
	),
	TopicSpec(
		"/revolt/sim/stc/gnss/antenna1/position",
		"geometry_msgs/PointStamped",
		description=(
			"Simulated GNSS antenna 1 position in local Cartesian metres (X=East, Y=North). "
			"Converted to WGS84 GnssFixMsg using SIM_GNSS_ORIGIN_LAT/LON reference."
		),
	),
	TopicSpec(
		"/revolt/sim/stc/gnss/antenna2/position",
		"geometry_msgs/PointStamped",
		description="Simulated GNSS antenna 2 position — subscribed but not forwarded to frontend.",
	),
	TopicSpec(
		"/revolt/sim/stc/gnss/velocity_vector",
		"std_msgs/Float32MultiArray",
		description="GNSS velocity: data[0]=speed (m/s), data[1]=heading in radians",
	),
	TopicSpec(
		"/revolt/sim/stc/imu/data",
		"geometry_msgs/Twist",
		frontend_throttle_ms=100,
		description="IMU: linear={accel_x,y,z} m/s², angular={ang_vel_x,y,z} rad/s",
	),
	TopicSpec(
		"/thruster/bow",
		"std_msgs/Float32MultiArray",
		frontend_throttle_ms=100,
		description="Bow thruster feedback from sim: data[0]=force, data[1]=angle",
	),
	TopicSpec(
		"/thruster/port",
		"std_msgs/Float32MultiArray",
		frontend_throttle_ms=100,
		description="Port thruster feedback from sim: data[0]=force, data[1]=angle",
	),
	TopicSpec(
		"/thruster/starboard",
		"std_msgs/Float32MultiArray",
		frontend_throttle_ms=100,
		description="Starboard thruster feedback from sim: data[0]=force, data[1]=angle",
	),
	TopicSpec(
		"/waypoint_list",
		"custom_msgs/WaypointList",
		description="Active waypoint list from mission planner (custom_msgs/WaypointList)",
	),
]

SIMULATION_PUBLISH_TOPICS: list[TopicSpec] = [
	TopicSpec("/ROS_heartbeat", "std_msgs/Bool", description="Must publish at 1 Hz"),
	TopicSpec(
		"/revolt/thruster/bow",
		"custom_msgs/BowControl",
		description="Bow thruster command: effort (-100–100 %), angle (-90–90°), linear_actuator (0|1)",
	),
	TopicSpec(
		"/revolt/thruster/port",
		"custom_msgs/PortControl",
		description="Port thruster command: effort (-100–100 %), angle (-360–360°)",
	),
	TopicSpec(
		"/revolt/thruster/starboard",
		"custom_msgs/StarboardControl",
		description="Starboard thruster command: effort (-100–100 %), angle (-360–360°)",
	),
	TopicSpec(
		"/add_waypoint",
		"custom_msgs/Waypoint",
		description="Append a single waypoint to the active mission",
	),
	TopicSpec(
		"/update_waypoint_list",
		"custom_msgs/WaypointList",
		description="Replace the full active waypoint list",
	),
	TopicSpec(
		"/arduino/is_autonomous",
		"std_msgs/Bool",
		description="Enable/disable autonomous mode on the sim Arduino bridge",
	),
]


def get_subscribe_topics(target: str) -> list[TopicSpec]:
	return SIMULATION_SUBSCRIBE_TOPICS if target == "simulation" else PHYSICAL_SUBSCRIBE_TOPICS


def get_publish_topics(target: str) -> list[TopicSpec]:
	return SIMULATION_PUBLISH_TOPICS if target == "simulation" else PHYSICAL_PUBLISH_TOPICS


# rosbridge wire protocol types


class RosBridgeSubscribe(TypedDict):
	op: Literal["subscribe"]
	topic: str
	type: str
	throttle_rate: int


class RosBridgePublishOut(TypedDict):
	op: Literal["publish"]
	topic: str
	msg: dict[str, Any]


class RosBridgePublishIn(TypedDict):
	op: Literal["publish"]
	topic: str
	msg: dict[str, Any]


class RosBridgeCallService(TypedDict):
	op: Literal["call_service"]
	id: str
	service: str
	type: str
	args: dict[str, Any]


class RosBridgeServiceResponse(TypedDict):
	op: Literal["service_response"]
	id: str
	service: str
	values: dict[str, Any] | None
	result: bool
