import { useBridgeData } from "../context/BridgeDataContext.js";

const BATTERY_FULL_V = 14.4;   // Trad/Gel charge voltage (charger spec)
const BATTERY_EMPTY_V = 10.0;  // Arduino firmware emergency floor (critical_battery_voltage_level)
const BATTERY_ALARM_V = 11.0;  // GUI alarm — warn operator before Arduino emergency at 10.0 V
const BATTERY_WARN_V = 11.5;   // GUI warning — early advisory
const BATTERY_OVERVOLT_V = 16.0; // hardware guide "Over Voltage" threshold

export type VoltageStatus = "normal" | "warning" | "alarm" | "overvolt";

export interface CurrentReadingData {
	amperes: number | null;
	isOn: boolean;
}

export interface BatteryData {
	voltageV: number | null;
	voltagePercent: number | null;
	voltageStatus: VoltageStatus;
	current: {
		stern_port: CurrentReadingData;
		stern_star: CurrentReadingData;
		bow: CurrentReadingData;
	};
}

const ON_CURRENT_THRESHOLD_A = 0.5; // tune once tested on physical hardware

function clamp(value: number, min: number, max: number): number {
	return Math.max(min, Math.min(max, value));
}

export function voltageStatus(v: number): VoltageStatus {
	if (v > BATTERY_OVERVOLT_V) return "overvolt";
	if (v < BATTERY_ALARM_V) return "alarm";
	if (v < BATTERY_WARN_V) return "warning";
	return "normal";
}

function toCurrentData(amperes: number | null): CurrentReadingData {
	return {
		amperes,
		isOn: amperes !== null && amperes > ON_CURRENT_THRESHOLD_A,
	};
}

export function useBatteryData(): BatteryData {
	const { battery, current } = useBridgeData();

	const voltageV = battery?.voltage_v ?? null;
	const voltagePercent =
		voltageV !== null
			? clamp(
					((voltageV - BATTERY_EMPTY_V) / (BATTERY_FULL_V - BATTERY_EMPTY_V)) * 100,
					0,
					100,
				)
			: null;

	return {
		voltageV,
		voltagePercent,
		voltageStatus: voltageV !== null ? voltageStatus(voltageV) : "normal",
		current: {
			stern_port: toCurrentData(current.stern_port?.amperes ?? null),
			stern_star: toCurrentData(current.stern_star?.amperes ?? null),
			bow: toCurrentData(current.bow?.amperes ?? null),
		},
	};
}
