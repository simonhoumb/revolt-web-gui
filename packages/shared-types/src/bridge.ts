// Versioned message contracts for the ROS2 bridge WebSocket connection.
// Mirror of apps/backend/src/revolt_api/bridge/contracts.py; keep in sync.
//
// All messages include a `v` version literal and a `type` discriminant.
// Switch on `msg.type` to narrow; check `msg.v` to guard unknown schema versions.

/** Battery voltage reading from /arduino/stern/battery_voltage. */
export interface BatteryMsg {
	v: "1";
	type: "battery";
	timestamp_ms: number;
	voltage_v: number; // raw volts from /arduino/stern/battery_voltage
}

/** Per-motor current draw, converted from raw ADC via the ACS712 formula. */
export interface CurrentMsg {
	v: "1";
	type: "current";
	timestamp_ms: number;
	location: "stern_port" | "stern_star" | "bow";
	raw_adc: number; // 0-1023 from std_msgs/Int16
	amperes: number; // raw_adc * 30.0 / 1023.0 via ACS712
}

/** DHT22 enclosure temperature reading, stern or bow. */
export interface TemperatureMsg {
	v: "1";
	type: "temperature";
	timestamp_ms: number;
	location: "stern" | "bow";
	value_c: number;
}

/** DHT22 enclosure humidity reading, stern or bow. */
export interface HumidityMsg {
	v: "1";
	type: "humidity";
	timestamp_ms: number;
	location: "stern" | "bow";
	value_pct: number;
}

/** Stern thruster azimuth angle feedback, port or starboard. */
export interface AzimuthFeedbackMsg {
	v: "1";
	type: "azimuth_feedback";
	timestamp_ms: number;
	location: "port" | "starboard";
	angle_deg: number;
}

/** Raw RC transmitter channel values, from custom_msgs/RCRemote. */
export interface RcRemoteMsg {
	v: "1";
	type: "rc_remote";
	timestamp_ms: number;
	throttle: number; // raw PWM, 1070-1930
	aileron: number; // raw PWM, 1070-1930
	rudder: number; // raw PWM, 1070-1930
	gear: "manual" | "auto"; // 0=manual, 1=auto
}

/** Stern light beacon lamp state, decoded from the firmware's red/yellow/green bitmask. */
export interface LightBeaconMsg {
	v: "1";
	type: "light_beacon";
	timestamp_ms: number;
	red: boolean;
	yellow: boolean;
	green: boolean;
}

/** Current vessel control mode. */
export interface ControlModeMsg {
	v: "1";
	type: "control_mode";
	timestamp_ms: number;
	mode: "manual" | "manual_assisted" | "autonomous" | "miscommunication";
}

/** Stern emergency-stop status. */
export interface EmergencyStopMsg {
	v: "1";
	type: "emergency_stop";
	timestamp_ms: number;
	active: boolean; // true when UInt8 value != 0
}

/** Bow linear actuator retract/extend state. */
export interface LinearActuatorMsg {
	v: "1";
	type: "linear_actuator";
	timestamp_ms: number;
	retracted: boolean; // true when UInt8 value == 1
}

/**
 * Backend-to-rosbridge connection status. Always the first message sent after connecting, so
 * the UI knows immediately whether telemetry is live before any topic data arrives.
 */
export interface BridgeStatusMsg {
	v: "1";
	type: "bridge_status";
	timestamp_ms: number;
	connected: boolean; // true when backend has a live connection to rosbridge
	bridge_url: string;
	target: string; // "physical" or "simulation"
}

/** Liveness status for a camera feed, derived from recent frame arrival. */
export interface CameraStatusMsg {
	v: "1";
	type: "camera_status";
	timestamp_ms: number;
	camera_id: string; // e.g. "main"
	connected: boolean; // true when a frame was received within the last 3 seconds
}

/** Keepalive the frontend uses to compute round-trip latency. */
export interface PingMsg {
	v: "1";
	type: "ping";
	server_ms: number; // backend unix epoch ms; compute Date.now() - server_ms for latency
}

// Simulation (pygemini/STC) message contracts

/** Simulated hull pose from the pygemini/STC simulation environment. */
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

/** Simulated hull linear and angular velocity. */
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

/**
 * GNSS position fix. Sourced from /fix on the physical vessel, or converted from the sim's
 * local-Cartesian antenna position.
 */
export interface GnssFixMsg {
	v: "1";
	type: "gnss_fix";
	timestamp_ms: number;
	latitude: number; // degrees, WGS84
	longitude: number; // degrees, WGS84
	altitude_m: number; // metres above WGS84 ellipsoid
	fix_status: number; // NavSatFix.status.status: -1=NO_FIX, 0=FIX, 1=SBAS, 2=GBAS; -1 if field absent
}

/** True heading from the VS330 GNSS compass's dual-antenna RTK solution. */
export interface GnssHeadingMsg {
	v: "1";
	type: "gnss_heading";
	timestamp_ms: number;
	heading_deg: number; // true heading 0-360, from /heading QuaternionStamped yaw (VS330 GNSS compass)
}

/** GNSS-derived speed and course over ground from the VS330 compass. */
export interface GnssVelocityMsg {
	v: "1";
	type: "gnss_velocity";
	timestamp_ms: number;
	speed_ms: number; // from /vel TwistStamped linear.x/y magnitude (VS330 GNSS compass, VTG-derived)
	// Course over ground 0-360, from /vel TwistStamped linear.x/y bearing. null below the
	// backend's MIN_COG_SPEED_MS; the angle is meaningless noise at near-zero speed, not just
	// imprecise.
	course_deg: number | null;
}

/** Simulated GNSS speed/heading vector. */
export interface SimGnssVelocityMsg {
	v: "1";
	type: "sim_gnss_velocity";
	timestamp_ms: number;
	speed: number; // Float32MultiArray.data[0], m/s
	heading_rad: number; // Float32MultiArray.data[1], radians
}

/** Simulated IMU linear acceleration and angular velocity. */
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

/**
 * Physical IMU attitude and raw motion data from the Xsens unit. The VS330 GNSS compass remains
 * the authoritative heading/velocity source; this topic is attitude-only.
 */
export interface ImuMsg {
	v: "1";
	type: "imu_data";
	timestamp_ms: number;
	roll_deg: number; // -180..180
	pitch_deg: number; // -90..90
	yaw_deg: number; // 0..360
	accel_x: number; // sensor_msgs/Imu.linear_acceleration, m/s²
	accel_y: number;
	accel_z: number;
	ang_vel_x: number; // sensor_msgs/Imu.angular_velocity, rad/s
	ang_vel_y: number;
	ang_vel_z: number;
}

/** Simulated per-thruster force/angle feedback. */
export interface SimThrusterFeedbackMsg {
	v: "1";
	type: "sim_thruster_feedback";
	timestamp_ms: number;
	thruster: "bow" | "port" | "starboard";
	force: number; // Float32MultiArray.data[0]
	angle: number; // Float32MultiArray.data[1]
}

/** Single waypoint as echoed back by the simulation's /waypoint_list. */
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

/**
 * Full waypoint queue echoed back by the simulation. Used to confirm mission sends landed and
 * to derive live mission execution progress (see MissionExecutionStatusMsg).
 */
export interface SimWaypointListMsg {
	v: "1";
	type: "sim_waypoint_list";
	timestamp_ms: number;
	waypoints: SimWaypoint[];
}

/** Progress of a mission send-to-vessel operation's ack/echo flow. */
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

/** Live mission execution progress, derived from the /waypoint_list echo. */
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

/** 2D lidar scan, from the Velodyne VLP-16's ring-8 horizontal slice. */
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

/**
 * Decimated 3D point cloud from the Velodyne VLP-16's full 16-ring sweep, complementing
 * LidarScanMsg's single-ring slice. Backend voxel-decimates before forwarding (see client.py's
 * _handle_velodyne_points), same frame as LidarScanMsg's ranges.
 */
export interface PointCloudMsg {
	v: "1";
	type: "point_cloud";
	timestamp_ms: number;
	// Flat, interleaved [x0,y0,z0, x1,y1,z1, ...] in metres, ROS convention (x=forward, y=left,
	// z=up). One flat array rather than per-point objects to keep the JSON payload down at this
	// point count.
	points: number[];
	point_count: number; // points.length / 3
}

/**
 * One aggregated radar azimuth bin, forwarded after backend-side binning (see client.py's
 * RADAR_NUM_BINS comment); never a raw 1:1 spoke.
 */
export interface RadarSpokeMsg {
	v: "1";
	type: "radar_spoke";
	timestamp_ms: number;
	azimuth: number; // radians, absolute (not relative to a prior spoke)
	range_start: number; // metres, range of the first sample
	range_increment: number; // metres between consecutive samples
	num_samples: number;
	min_intensity: number; // 0-255
	max_intensity: number; // 0-255
	intensity: number[]; // one 0-255 value per sample
}

/**
 * Cartesian radar returns, an alternative representation to RadarSpokeMsg's polar bins. Kept
 * alongside RadarSpokeMsg while the two are evaluated against each other (see client.py's
 * _handle_radar_points); not the widget's actual data source yet.
 */
export interface RadarPointCloudMsg {
	v: "1";
	type: "radar_point_cloud";
	timestamp_ms: number;
	// Flat, interleaved [x0,y0,z0,i0, x1,y1,z1,i1, ...] in metres / 0-255 intensity. Same flat-array
	// convention as PointCloudMsg, extended with a per-point intensity value -- radar echo
	// strength drives the widget's brightness, unlike lidar's flattened 2D view, which doesn't
	// use one.
	points: number[];
	point_count: number; // points.length / 4
}

/** Decoded AIS target report, keyed by MMSI. */
export interface AisTargetMsg {
	v: "1";
	type: "ais_target";
	timestamp_ms: number;
	mmsi: number;
	lat: number;
	lon: number;
	sog_kn: number | null; // null when the source report has no valid speed
	heading_deg: number | null; // null when the source report has no valid heading
}

export type BridgeMessage =
	| BatteryMsg
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
	| PointCloudMsg;
