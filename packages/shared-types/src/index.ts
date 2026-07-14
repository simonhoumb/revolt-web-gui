import type { MissionExecutionState } from "./bridge.js";

export enum ControlMode {
	Manual = "manual",
	ManualAssisted = "manual_assisted",
	Autonomous = "autonomous",
	Miscommunication = "miscommunication",
}

export enum MissionStatus {
	Draft = "draft",
	Active = "active",
	Paused = "paused",
	Completed = "completed",
	Aborted = "aborted",
}

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

export interface Position {
	latitude: number;
	longitude: number;
}

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

export interface SensorReading {
	id: string;
	timestamp: string;
	sensor_type: SensorType;
	raw_data: Record<string, unknown>;
	quality: number | null;
	created_at: string;
	updated_at: string;
}

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

export interface HazardHit {
	layer: string;
	description: string;
	count: number;
}

export interface MissionSendResult {
	status: string;
	waypoint_count: number;
	checked_at: string;
	// The Phase 2 check /send always runs before publishing. "blocked" never reaches this
	// response (the backend rejects with 409 instead) -- only ever "safe", "warning", or "no_data".
	validation_status: "safe" | "warning" | "no_data" | "blocked";
	hazards: HazardHit[];
}

export interface MissionValidationResult {
	status: "safe" | "warning" | "no_data" | "blocked";
	hazards: HazardHit[];
	checked_at: string;
}

export interface MissionExecutionResult {
	status: string;
	state: MissionExecutionState;
	autonomy_engaged: boolean;
	// Explains the physical-target limitation when relevant: engaging autonomy on the real
	// vessel is the RC operator's action (hardware/RC-owned), not something this endpoint can do.
	autonomy_note: string | null;
	waypoint_count: number;
}

export * from "./bridge.js";
