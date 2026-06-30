import {
	createContext,
	useCallback,
	useContext,
	useMemo,
	useReducer,
	type ReactNode,
} from "react";
import type {
	BatteryMsg,
	BridgeMessage,
	BridgeStatusMsg,
	CameraStatusMsg,
	ControlModeMsg,
	CurrentMsg,
	EmergencyStopMsg,
	GnssFixMsg,
	LidarScanMsg,
	LinearActuatorMsg,
	SimGnssVelocityMsg,
	SimThrusterFeedbackMsg,
} from "@revolt/shared-types";
import { useBridgeConnection } from "../hooks/useBridgeConnection.js";

interface CurrentReadings {
	stern_port: CurrentMsg | null;
	stern_star: CurrentMsg | null;
	bow: CurrentMsg | null;
}

interface ThrusterFeedback {
	bow: SimThrusterFeedbackMsg | null;
	port: SimThrusterFeedbackMsg | null;
	starboard: SimThrusterFeedbackMsg | null;
}

export interface BridgeData {
	battery: BatteryMsg | null;
	current: CurrentReadings;
	gnssFix: GnssFixMsg | null;
	gnssVelocity: SimGnssVelocityMsg | null;
	controlMode: ControlModeMsg | null;
	emergencyStop: EmergencyStopMsg | null;
	linearActuator: LinearActuatorMsg | null;
	bridgeStatus: BridgeStatusMsg | null;
	cameraStatus: CameraStatusMsg | null;
	thrusterFeedback: ThrusterFeedback;
	lidarScan: LidarScanMsg | null;
	wsConnected: boolean;
	bridgeConnected: boolean;
	latencyMs: number | null;
}

const initialCurrent: CurrentReadings = { stern_port: null, stern_star: null, bow: null };
const initialThrusterFeedback: ThrusterFeedback = { bow: null, port: null, starboard: null };

const initialData: BridgeData = {
	battery: null,
	current: initialCurrent,
	gnssFix: null,
	gnssVelocity: null,
	controlMode: null,
	emergencyStop: null,
	linearActuator: null,
	bridgeStatus: null,
	cameraStatus: null,
	thrusterFeedback: initialThrusterFeedback,
	lidarScan: null,
	wsConnected: false,
	bridgeConnected: false,
	latencyMs: null,
};

function bridgeDataReducer(state: BridgeData, msg: BridgeMessage): BridgeData {
	switch (msg.type) {
		case "battery":
			return { ...state, battery: msg };
		case "current":
			return {
				...state,
				current: { ...state.current, [msg.location]: msg },
			};
		case "gnss_fix":
			return { ...state, gnssFix: msg };
		case "sim_gnss_velocity":
			return { ...state, gnssVelocity: msg };
		case "control_mode":
			return { ...state, controlMode: msg };
		case "emergency_stop":
			return { ...state, emergencyStop: msg };
		case "linear_actuator":
			return { ...state, linearActuator: msg };
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
