// Versioned message contracts for the ROS2 bridge WebSocket connection.
// Mirror of apps/backend/src/revolt_api/bridge/contracts.py — keep in sync.
//
// All messages include a `v` version literal and a `type` discriminant.
// Switch on `msg.type` to narrow; check `msg.v` to guard unknown schema versions.

export interface BatteryMsg {
	v: "1";
	type: "battery";
	timestamp_ms: number;
	voltage_v: number; // raw volts from /arduino/stern/battery_voltage
}

export interface CurrentMsg {
	v: "1";
	type: "current";
	timestamp_ms: number;
	location: "stern_port" | "stern_star" | "bow";
	raw_adc: number; // 0-1023 from std_msgs/Int16
	amperes: number; // raw_adc * 30.0 / 1023.0 via ACS712
}

export interface TemperatureMsg {
	v: "1";
	type: "temperature";
	timestamp_ms: number;
	location: "stern" | "bow";
	value_c: number;
}

export interface HumidityMsg {
	v: "1";
	type: "humidity";
	timestamp_ms: number;
	location: "stern" | "bow";
	value_pct: number;
}

export interface AzimuthFeedbackMsg {
	v: "1";
	type: "azimuth_feedback";
	timestamp_ms: number;
	location: "port" | "starboard";
	angle_deg: number;
}

export interface ControlModeMsg {
	v: "1";
	type: "control_mode";
	timestamp_ms: number;
	mode: "manual" | "manual_assisted" | "autonomous" | "miscommunication";
}

export interface EmergencyStopMsg {
	v: "1";
	type: "emergency_stop";
	timestamp_ms: number;
	active: boolean; // true when UInt8 value != 0
}

export interface LinearActuatorMsg {
	v: "1";
	type: "linear_actuator";
	timestamp_ms: number;
	retracted: boolean; // true when UInt8 value == 1
}

export interface BridgeStatusMsg {
	v: "1";
	type: "bridge_status";
	timestamp_ms: number;
	connected: boolean; // true when backend has a live connection to rosbridge
	bridge_url: string;
	target: string; // "physical" or "simulation"
}

export interface CameraStatusMsg {
	v: "1";
	type: "camera_status";
	timestamp_ms: number;
	camera_id: string; // e.g. "main"
	connected: boolean; // true when a frame was received within the last 3 seconds
}

export interface PingMsg {
	v: "1";
	type: "ping";
	server_ms: number; // backend unix epoch ms; compute Date.now() - server_ms for latency
}

// Simulation (pygemini/STC) message contracts

export interface SimHullPositionMsg {
	v: "1";
	type: "sim_hull_position";
	timestamp_ms: number;
	pos_x: number; // PoseStamped.pose.position.x; frame_id="map" (coordinate TBD: NED or WGS84)
	pos_y: number;
	pos_z: number;
	orient_x: number; // PoseStamped.pose.orientation (quaternion, ZYX extrinsic)
	orient_y: number;
	orient_z: number;
	orient_w: number;
}

export interface SimHullVelocityMsg {
	v: "1";
	type: "sim_hull_velocity";
	timestamp_ms: number;
	vel_x: number; // Twist.linear.x, m/s
	vel_y: number;
	vel_z: number;
	ang_vel_x: number; // Twist.angular.x, rad/s (NOT converted to degrees)
	ang_vel_y: number;
	ang_vel_z: number;
}

export interface GnssFixMsg {
	v: "1";
	type: "gnss_fix";
	timestamp_ms: number;
	latitude: number; // degrees, WGS84
	longitude: number; // degrees, WGS84
	altitude_m: number; // metres above WGS84 ellipsoid
	fix_status: number; // NavSatFix.status.status: -1=NO_FIX, 0=FIX, 1=SBAS, 2=GBAS; -1 if field absent
}

export interface GnssHeadingMsg {
	v: "1";
	type: "gnss_heading";
	timestamp_ms: number;
	heading_deg: number; // true heading 0-360, from /heading QuaternionStamped yaw (VS330 GNSS compass)
}

export interface GnssVelocityMsg {
	v: "1";
	type: "gnss_velocity";
	timestamp_ms: number;
	speed_ms: number; // from /vel TwistStamped linear.x/y magnitude (VS330 GNSS compass, VTG-derived)
	course_deg: number; // course over ground 0-360, from /vel TwistStamped linear.x/y bearing
}

export interface SimGnssVelocityMsg {
	v: "1";
	type: "sim_gnss_velocity";
	timestamp_ms: number;
	speed: number; // Float32MultiArray.data[0], m/s
	heading_rad: number; // Float32MultiArray.data[1], radians
}

export interface SimImuMsg {
	v: "1";
	type: "sim_imu";
	timestamp_ms: number;
	accel_x: number; // Twist.linear.x, m/s²
	accel_y: number;
	accel_z: number;
	ang_vel_x: number; // Twist.angular.x, rad/s
	ang_vel_y: number;
	ang_vel_z: number;
}

export interface SimThrusterFeedbackMsg {
	v: "1";
	type: "sim_thruster_feedback";
	timestamp_ms: number;
	thruster: "bow" | "port" | "starboard";
	force: number; // Float32MultiArray.data[0]
	angle: number; // Float32MultiArray.data[1]
}

export interface SimWaypoint {
	id: number;
	pos_x: number; // PoseStamped.pose.position.x; frame TBD
	pos_y: number;
	pos_z: number;
	switch_radius: number;
	desired_speed: number; // m/s; 0 or NaN means use route default
	heading_mode: number; // 0=NONE 1=TANGENT 2=ABSOLUTE
	heading_rad: number; // radians, used when heading_mode == ABSOLUTE
}

export interface SimWaypointListMsg {
	v: "1";
	type: "sim_waypoint_list";
	timestamp_ms: number;
	waypoints: SimWaypoint[];
}

export interface MissionSendStatusMsg {
	v: "1";
	type: "mission_send_status";
	timestamp_ms: number;
	mission_id: string;
	status: "sending" | "acknowledged" | "timed_out" | "not_connected" | "mismatched";
	waypoint_count: number;
}

export type MissionExecutionState =
	| "starting"
	| "active"
	| "pausing"
	| "paused"
	| "terminating"
	| "aborted"
	| "completed";

export interface MissionExecutionStatusMsg {
	v: "1";
	type: "mission_execution_status";
	timestamp_ms: number;
	mission_id: string;
	state: MissionExecutionState;
	current_waypoint_seq: number | null; // first element's id from the live /waypoint_list echo
	remaining_count: number;
	total_count: number;
}

export interface LidarScanMsg {
	v: "1";
	type: "lidar_scan";
	timestamp_ms: number;
	angle_min: number; // radians, first scan angle
	angle_max: number; // radians, last scan angle
	angle_increment: number; // radians between consecutive measurements
	range_min: number; // metres, minimum valid range
	range_max: number; // metres, maximum valid range
	ranges: number[]; // metres per step; inf/NaN replaced with range_max
}

export type BridgeMessage =
	| BatteryMsg
	| CurrentMsg
	| TemperatureMsg
	| HumidityMsg
	| AzimuthFeedbackMsg
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
	| LidarScanMsg;
