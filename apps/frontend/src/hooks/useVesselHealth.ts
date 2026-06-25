import { useBridgeData } from "../context/BridgeDataContext.js";

export type AlertLevel = "alarm" | "warning" | "caution";

export interface VesselHealth {
	wsConnected: boolean;
	bridgeConnected: boolean;
	latencyMs: number | null;
	emergencyStopActive: boolean;
	alertCount: number;
	highestAlertLevel: AlertLevel | null;
}

export function useVesselHealth(): VesselHealth {
	const { wsConnected, bridgeConnected, latencyMs, emergencyStop, controlMode } =
		useBridgeData();

	const emergencyStopActive = emergencyStop?.active ?? false;

	let alarms = 0;
	let warnings = 0;
	let cautions = 0;

	if (!wsConnected) alarms++;
	if (wsConnected && !bridgeConnected) warnings++;
	if (emergencyStopActive) alarms++;
	if (controlMode?.mode === "miscommunication") cautions++;

	const alertCount = alarms + warnings + cautions;

	let highestAlertLevel: AlertLevel | null = null;
	if (alarms > 0) highestAlertLevel = "alarm";
	else if (warnings > 0) highestAlertLevel = "warning";
	else if (cautions > 0) highestAlertLevel = "caution";

	return {
		wsConnected,
		bridgeConnected,
		latencyMs,
		emergencyStopActive,
		alertCount,
		highestAlertLevel,
	};
}
