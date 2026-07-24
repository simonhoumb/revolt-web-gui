import type { MissionExecutionState } from "./bridge.js";

/** Mirrors the backend's ControlMode enum (models/vessel.py); the /control_mode topic's values. */
export enum ControlMode {
	Manual = "manual",
	ManualAssisted = "manual_assisted",
	Autonomous = "autonomous",
	Miscommunication = "miscommunication",
}

/** A mission's lifecycle state. */
export enum MissionStatus {
	Draft = "draft",
	Active = "active",
	Paused = "paused",
	Completed = "completed",
	Aborted = "aborted",
}

/** Which vessel sensor a SensorReading came from. */
export enum SensorType {
	GNSS = "gnss",
	IMU = "imu",
	ThrusterSternPort = "thruster_stern_port",
	ThrusterSternStarboard = "thruster_stern_starboard",
	ThrusterBow = "thruster_bow",
	Battery = "battery",
	EnvironmentalStern = "environmental_stern",
	EnvironmentalBow = "environmental_bow",
	Camera = "camera",
	Lidar = "lidar",
	Radar = "radar",
}

/** A WGS84 lat/lon pair, the API's wire format for any geometry column. */
export interface Position {
	latitude: number;
	longitude: number;
}

/** A single point-in-time snapshot of vessel position, heading, and status. */
export interface VesselState {
	id: string;
	timestamp: string;
	position: Position;
	heading: number;
	speed_over_ground: number;
	battery_voltage: number;
	control_mode: ControlMode;
	emergency_stop_active: boolean;
	created_at: string;
	updated_at: string;
}

/** One raw reading from a vessel sensor; the shape of raw_data varies by sensor_type. */
export interface SensorReading {
	id: string;
	timestamp: string;
	sensor_type: SensorType;
	raw_data: Record<string, unknown>;
	quality: number | null;
	created_at: string;
	updated_at: string;
}

/** One point in a Mission's route, in send order (sequence_number). */
export interface Waypoint {
	id: string;
	mission_id: string;
	sequence_number: number;
	position: Position;
	target_speed: number;
	switch_radius: number;
	heading_mode: number;
	heading_deg: number | null;
	validation_status: string | null;
	reached_at: string | null;
}

/** A named, ordered route: metadata plus its waypoints. */
export interface Mission {
	id: string;
	name: string;
	description: string | null;
	status: MissionStatus;
	waypoints: Waypoint[];
	started_at: string | null;
	completed_at: string | null;
	last_validated_at: string | null;
	last_validation_status: string | null;
	last_sent_at: string | null;
	last_send_status: string | null;
	created_at: string;
	updated_at: string;
}

/** One hazard layer a route came within the safety margin of, and how many features hit. */
export interface HazardHit {
	layer: string;
	description: string;
	count: number;
}

/** Per-leg hazard summary computed client-side (Phase 1 ENC check).
 *
 * Computed by apps/frontend/src/lib/encValidation.ts against currently-rendered map layers,
 * distinct from HazardHit above, which is the server-side (Phase 2) PostGIS check's per-layer
 * aggregate hit count.
 */
export interface HazardSummary {
	status: "safe" | "warning" | "no_data" | "blocked";
	description: string;
}

/** Response from sending a mission to the vessel: the Phase 2 re-validation result plus what was sent. */
export interface MissionSendResult {
	status: string;
	waypoint_count: number;
	checked_at: string;
	// The Phase 2 check /send always runs before publishing. "blocked" never reaches this
	// response (the backend rejects with 409 instead); only ever "safe", "warning", or "no_data".
	validation_status: "safe" | "warning" | "no_data" | "blocked";
	hazards: HazardHit[];
}

/** Response from validating a mission's route against charted hazards. */
export interface MissionValidationResult {
	status: "safe" | "warning" | "no_data" | "blocked";
	hazards: HazardHit[];
	checked_at: string;
}

/** Response from the start/pause/terminate command endpoints. */
export interface MissionExecutionResult {
	status: string;
	state: MissionExecutionState;
	autonomy_engaged: boolean;
	// Explains the physical-target limitation when relevant: engaging autonomy on the real
	// vessel is the RC operator's action (hardware/RC-owned), not something this endpoint can do.
	autonomy_note: string | null;
	waypoint_count: number;
}

/** Describes one parameter a ROS command accepts, resolved for the current registry response. */
export interface RosCommandParamMeta {
	name: string;
	label: string;
	kind: "topic_select" | "param_select" | "text";
	required: boolean;
	// Populated for kind="topic_select" (bridge/protocol.py's topic allow-list) and
	// kind="param_select" (a live /rosapi/get_param_names call), both resolved server-side;
	// the frontend never keeps its own copy of either list.
	allowed_values: string[] | null;
}

/** Response entry from GET /api/ros-commands: one command's UI metadata. */
export interface RosCommandMeta {
	command_id: string;
	label: string;
	description: string;
	params: RosCommandParamMeta[];
}

/** Response from a ROS command execution. */
export interface RosCommandResult {
	command_id: string;
	ok: boolean;
	// "not_connected" | "timed_out" | "service_call_failed" | "no_data_yet" | null
	error: string | null;
	result: Record<string, unknown> | null;
	executed_at: string;
}

export * from "./bridge.js";
