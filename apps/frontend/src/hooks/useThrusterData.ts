import { useBridgeData } from "../context/useBridgeData.js";
import { useLiveTick } from "./useLiveTick.js";
import { isStale } from "../lib/staleness.js";
import { ON_CURRENT_THRESHOLD_A } from "../lib/thresholds.js";

export interface ThrusterStatus {
	isOn: boolean;
	amperes: number | null;
	force: number | null;
	angleDeg: number | null;
	stale: boolean;
}

export interface ThrusterData {
	stern_port: ThrusterStatus;
	stern_star: ThrusterStatus;
	bow: ThrusterStatus;
	bowRetracted: boolean | null;
	controlMode: string | null;
	controlModeStale: boolean;
	isSimulation: boolean;
}

function toThrusterStatus(
	amperes: number | null,
	timestampMs: number | null | undefined,
	simFeedback: { force: number; angle: number } | null,
	physicalAngleDeg: number | null,
	now: number,
): ThrusterStatus {
	return {
		isOn: amperes !== null && amperes > ON_CURRENT_THRESHOLD_A,
		amperes,
		force: simFeedback?.force ?? null,
		angleDeg: simFeedback !== null ? simFeedback.angle * (180 / Math.PI) : physicalAngleDeg,
		stale: isStale(timestampMs, now),
	};
}

/** Per-thruster on/off, current, and force/angle feedback, plus control mode and bow actuator state. */
export function useThrusterData(): ThrusterData {
	useLiveTick();
	const now = Date.now();
	const {
		current,
		thrusterFeedback,
		controlMode,
		linearActuator,
		bridgeStatus,
		azimuthFeedback,
	} = useBridgeData();

	const isSimulation = bridgeStatus?.target === "simulation";

	return {
		stern_port: toThrusterStatus(
			current.stern_port?.amperes ?? null,
			current.stern_port?.timestamp_ms,
			isSimulation ? (thrusterFeedback.port ?? null) : null,
			azimuthFeedback.port?.angle_deg ?? null,
			now,
		),
		stern_star: toThrusterStatus(
			current.stern_star?.amperes ?? null,
			current.stern_star?.timestamp_ms,
			isSimulation ? (thrusterFeedback.starboard ?? null) : null,
			azimuthFeedback.starboard?.angle_deg ?? null,
			now,
		),
		bow: toThrusterStatus(
			current.bow?.amperes ?? null,
			current.bow?.timestamp_ms,
			isSimulation ? (thrusterFeedback.bow ?? null) : null,
			null, // bow is a linear actuator, not azimuthing; no feedback angle exists
			now,
		),
		bowRetracted: linearActuator?.retracted ?? null,
		controlMode: controlMode?.mode ?? null,
		controlModeStale: isStale(controlMode?.timestamp_ms, now),
		isSimulation,
	};
}
