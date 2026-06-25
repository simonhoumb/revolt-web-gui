import { useBridgeData } from "../context/BridgeDataContext.js";
import { ON_CURRENT_THRESHOLD_A } from "../lib/thresholds.js";

export interface ThrusterStatus {
	isOn: boolean;
	amperes: number | null;
	force: number | null;
	angleDeg: number | null;
}

export interface ThrusterData {
	stern_port: ThrusterStatus;
	stern_star: ThrusterStatus;
	bow: ThrusterStatus;
	bowRetracted: boolean | null;
	controlMode: string | null;
	isSimulation: boolean;
}

function toThrusterStatus(
	amperes: number | null,
	simFeedback: { force: number; angle: number } | null,
): ThrusterStatus {
	return {
		isOn: amperes !== null && amperes > ON_CURRENT_THRESHOLD_A,
		amperes,
		force: simFeedback?.force ?? null,
		angleDeg: simFeedback !== null ? simFeedback.angle * (180 / Math.PI) : null,
	};
}

export function useThrusterData(): ThrusterData {
	const { current, thrusterFeedback, controlMode, linearActuator, bridgeStatus } =
		useBridgeData();

	const isSimulation = bridgeStatus?.target === "simulation";

	return {
		stern_port: toThrusterStatus(
			current.stern_port?.amperes ?? null,
			isSimulation ? (thrusterFeedback.port ?? null) : null,
		),
		stern_star: toThrusterStatus(
			current.stern_star?.amperes ?? null,
			isSimulation ? (thrusterFeedback.starboard ?? null) : null,
		),
		bow: toThrusterStatus(
			current.bow?.amperes ?? null,
			isSimulation ? (thrusterFeedback.bow ?? null) : null,
		),
		bowRetracted: linearActuator?.retracted ?? null,
		controlMode: controlMode?.mode ?? null,
		isSimulation,
	};
}
