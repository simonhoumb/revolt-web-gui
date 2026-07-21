import { useMemo } from "react";
import { useBridgeData } from "../context/BridgeDataContext.js";
import { voltageStatus } from "./useBatteryData.js";

export type AlertLevel = "alarm" | "warning" | "caution";

export interface AlertEntry {
	id: string;
	title: string;
	description: string;
	level: AlertLevel;
}

export interface VesselHealth {
	wsConnected: boolean;
	bridgeConnected: boolean;
	latencyMs: number | null;
	emergencyStopActive: boolean;
	alerts: AlertEntry[];
	alertCount: number;
	highestAlertLevel: AlertLevel | null;
}

export function useVesselHealth(): VesselHealth {
	const { wsConnected, bridgeConnected, latencyMs, emergencyStop, controlMode, battery } =
		useBridgeData();

	const emergencyStopActive = emergencyStop?.active ?? false;
	const batStatus = voltageStatus(battery?.voltage_v ?? null);
	const controlModeValue = controlMode?.mode ?? null;

	const alerts = useMemo(() => {
		const result: AlertEntry[] = [];
		if (!wsConnected) {
			result.push({
				id: "ws-disconnected",
				title: "WebSocket disconnected",
				description: "No connection to the backend server.",
				level: "alarm",
			});
		}
		if (wsConnected && !bridgeConnected) {
			result.push({
				id: "bridge-offline",
				title: "ROS Bridge offline",
				description: "Backend is connected but has no link to rosbridge.",
				level: "warning",
			});
		}
		if (emergencyStopActive) {
			result.push({
				id: "estop",
				title: "Emergency stop active",
				description: "Vessel thrusters are halted by the emergency stop signal.",
				level: "alarm",
			});
		}
		if (controlModeValue === "miscommunication") {
			result.push({
				id: "miscomm",
				title: "Control miscommunication",
				description: "Neither RC nor ROS2 is commanding the vessel.",
				level: "caution",
			});
		}
		if (batStatus === "unknown" && wsConnected && bridgeConnected) {
			result.push({
				id: "bat-unknown",
				title: "Battery data unavailable",
				description: "No battery voltage reading received from the vessel.",
				level: "caution",
			});
		} else if (batStatus === "alarm") {
			result.push({
				id: "bat-alarm",
				title: "Battery voltage critical",
				description:
					"Voltage below 11.0 V — approaching Arduino emergency cutoff at 10.0 V.",
				level: "alarm",
			});
		} else if (batStatus === "overvolt") {
			result.push({
				id: "bat-overvolt",
				title: "Battery overvoltage",
				description: "Voltage exceeds 16.0 V.",
				level: "alarm",
			});
		} else if (batStatus === "warning") {
			result.push({
				id: "bat-warning",
				title: "Battery voltage low",
				description: "Voltage below 11.5 V — monitor closely.",
				level: "warning",
			});
		}
		return result;
	}, [wsConnected, bridgeConnected, emergencyStopActive, controlModeValue, batStatus]);

	const alertCount = alerts.length;
	const highestAlertLevel: AlertLevel | null = alerts.some((a) => a.level === "alarm")
		? "alarm"
		: alerts.some((a) => a.level === "warning")
			? "warning"
			: alerts.some((a) => a.level === "caution")
				? "caution"
				: null;

	return {
		wsConnected,
		bridgeConnected,
		latencyMs,
		emergencyStopActive,
		alerts,
		alertCount,
		highestAlertLevel,
	};
}
