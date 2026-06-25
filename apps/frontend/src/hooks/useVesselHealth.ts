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
	const batStatus = battery !== null ? voltageStatus(battery.voltage_v) : "normal";

	const alerts: AlertEntry[] = [];

	if (!wsConnected) {
		alerts.push({
			id: "ws-disconnected",
			title: "WebSocket disconnected",
			description: "No connection to the backend server.",
			level: "alarm",
		});
	}
	if (wsConnected && !bridgeConnected) {
		alerts.push({
			id: "bridge-offline",
			title: "ROS Bridge offline",
			description: "Backend is connected but has no link to rosbridge.",
			level: "warning",
		});
	}
	if (emergencyStopActive) {
		alerts.push({
			id: "estop",
			title: "Emergency stop active",
			description: "Vessel thrusters are halted by the emergency stop signal.",
			level: "alarm",
		});
	}
	if (controlMode?.mode === "miscommunication") {
		alerts.push({
			id: "miscomm",
			title: "Control miscommunication",
			description: "Neither RC nor ROS2 is commanding the vessel.",
			level: "caution",
		});
	}
	if (batStatus === "alarm") {
		alerts.push({
			id: "bat-alarm",
			title: "Battery voltage critical",
			description: "Voltage below 11.0 V — approaching Arduino emergency cutoff at 10.0 V.",
			level: "alarm",
		});
	} else if (batStatus === "overvolt") {
		alerts.push({
			id: "bat-overvolt",
			title: "Battery overvoltage",
			description: "Voltage exceeds 16.0 V.",
			level: "alarm",
		});
	} else if (batStatus === "warning") {
		alerts.push({
			id: "bat-warning",
			title: "Battery voltage low",
			description: "Voltage below 11.5 V — monitor closely.",
			level: "warning",
		});
	}

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
