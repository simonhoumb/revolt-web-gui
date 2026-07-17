import { createContext, useCallback, useContext, useMemo, useReducer, type ReactNode } from "react";
import type {
	AzimuthFeedbackMsg,
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
	MissionExecutionStatusMsg,
	MissionSendStatusMsg,
	SimGnssVelocityMsg,
	SimThrusterFeedbackMsg,
	SimWaypointListMsg,
	TemperatureMsg,
} from "@revolt/shared-types";
import { useBridgeConnection } from "../hooks/useBridgeConnection.js";

interface CurrentReadings {
	stern_port: CurrentMsg | null;
	stern_star: CurrentMsg | null;
	bow: CurrentMsg | null;
}

interface TemperatureReadings {
	stern: TemperatureMsg | null;
	bow: TemperatureMsg | null;
}

interface HumidityReadings {
	stern: HumidityMsg | null;
	bow: HumidityMsg | null;
}

interface ThrusterFeedback {
	bow: SimThrusterFeedbackMsg | null;
	port: SimThrusterFeedbackMsg | null;
	starboard: SimThrusterFeedbackMsg | null;
}

interface AzimuthFeedback {
	port: AzimuthFeedbackMsg | null;
	starboard: AzimuthFeedbackMsg | null;
}

export interface BridgeData {
	battery: BatteryMsg | null;
	current: CurrentReadings;
	temperature: TemperatureReadings;
	humidity: HumidityReadings;
	gnssFix: GnssFixMsg | null;
	gnssHeading: GnssHeadingMsg | null;
	gnssVelocity: SimGnssVelocityMsg | null;
	gnssVelocityPhysical: GnssVelocityMsg | null;
	controlMode: ControlModeMsg | null;
	emergencyStop: EmergencyStopMsg | null;
	linearActuator: LinearActuatorMsg | null;
	azimuthFeedback: AzimuthFeedback;
	bridgeStatus: BridgeStatusMsg | null;
	cameraStatus: CameraStatusMsg | null;
	thrusterFeedback: ThrusterFeedback;
	lidarScan: LidarScanMsg | null;
	activeWaypointList: SimWaypointListMsg | null;
	missionSendStatus: MissionSendStatusMsg | null;
	missionExecutionStatus: MissionExecutionStatusMsg | null;
	wsConnected: boolean;
	bridgeConnected: boolean;
	latencyMs: number | null;
}

const initialCurrent: CurrentReadings = { stern_port: null, stern_star: null, bow: null };
const initialTemperature: TemperatureReadings = { stern: null, bow: null };
const initialHumidity: HumidityReadings = { stern: null, bow: null };
const initialThrusterFeedback: ThrusterFeedback = { bow: null, port: null, starboard: null };
const initialAzimuthFeedback: AzimuthFeedback = { port: null, starboard: null };

export const initialData: BridgeData = {
	battery: null,
	current: initialCurrent,
	temperature: initialTemperature,
	humidity: initialHumidity,
	gnssFix: null,
	gnssHeading: null,
	gnssVelocity: null,
	gnssVelocityPhysical: null,
	controlMode: null,
	emergencyStop: null,
	linearActuator: null,
	azimuthFeedback: initialAzimuthFeedback,
	bridgeStatus: null,
	cameraStatus: null,
	thrusterFeedback: initialThrusterFeedback,
	lidarScan: null,
	activeWaypointList: null,
	missionSendStatus: null,
	missionExecutionStatus: null,
	wsConnected: false,
	bridgeConnected: false,
	latencyMs: null,
};

export function bridgeDataReducer(state: BridgeData, msg: BridgeMessage): BridgeData {
	switch (msg.type) {
		case "battery":
			return { ...state, battery: msg };
		case "current":
			return {
				...state,
				current: { ...state.current, [msg.location]: msg },
			};
		case "temperature":
			return {
				...state,
				temperature: { ...state.temperature, [msg.location]: msg },
			};
		case "humidity":
			return {
				...state,
				humidity: { ...state.humidity, [msg.location]: msg },
			};
		case "gnss_fix":
			return { ...state, gnssFix: msg };
		case "gnss_heading":
			return { ...state, gnssHeading: msg };
		case "gnss_velocity":
			return { ...state, gnssVelocityPhysical: msg };
		case "sim_gnss_velocity":
			return { ...state, gnssVelocity: msg };
		case "control_mode":
			return { ...state, controlMode: msg };
		case "emergency_stop":
			return { ...state, emergencyStop: msg };
		case "linear_actuator":
			return { ...state, linearActuator: msg };
		case "azimuth_feedback":
			return {
				...state,
				azimuthFeedback: { ...state.azimuthFeedback, [msg.location]: msg },
			};
		case "bridge_status":
			return { ...state, bridgeStatus: msg };
		case "sim_thruster_feedback":
			return {
				...state,
				thrusterFeedback: { ...state.thrusterFeedback, [msg.thruster]: msg },
			};
		case "lidar_scan":
			return { ...state, lidarScan: msg };
		case "camera_status":
			return { ...state, cameraStatus: msg };
		case "sim_waypoint_list":
			return { ...state, activeWaypointList: msg };
		case "mission_send_status":
			return { ...state, missionSendStatus: msg };
		case "mission_execution_status":
			return { ...state, missionExecutionStatus: msg };
		default:
			return state;
	}
}

const BridgeDataContext = createContext<BridgeData | null>(null);

export function BridgeDataProvider({ children }: { children: ReactNode }) {
	const [data, dispatch] = useReducer(bridgeDataReducer, initialData);

	const handleMessage = useCallback((msg: BridgeMessage) => {
		dispatch(msg);
	}, []);

	const { wsConnected, bridgeConnected, latencyMs } = useBridgeConnection({
		onMessage: handleMessage,
	});

	const value = useMemo(
		() => ({ ...data, wsConnected, bridgeConnected, latencyMs }),
		[data, wsConnected, bridgeConnected, latencyMs],
	);

	return <BridgeDataContext.Provider value={value}>{children}</BridgeDataContext.Provider>;
}

export function useBridgeData(): BridgeData {
	const ctx = useContext(BridgeDataContext);
	if (ctx === null) {
		throw new Error("useBridgeData must be used within BridgeDataProvider");
	}
	return ctx;
}
