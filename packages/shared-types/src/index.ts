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
	created_at: string;
	updated_at: string;
}

export * from "./bridge.js";
