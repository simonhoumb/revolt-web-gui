import { useBridgeData } from "../context/useBridgeData.js";
import { useLiveTick } from "./useLiveTick.js";
import { isStale } from "../lib/staleness.js";
import { ON_CURRENT_THRESHOLD_A } from "../lib/thresholds.js";

const BATTERY_FULL_V = 14.4; // Trad/Gel charge voltage (charger spec)
const BATTERY_EMPTY_V = 10.0; // Arduino firmware emergency floor (critical_battery_voltage_level)
const BATTERY_ALARM_V = 11.0; // GUI alarm: warn operator before Arduino emergency at 10.0 V
const BATTERY_WARN_V = 11.5; // GUI warning: early advisory
const BATTERY_OVERVOLT_V = 16.0; // hardware guide "Over Voltage" threshold

export type VoltageStatus = "normal" | "warning" | "alarm" | "overvolt" | "unknown";

export interface CurrentReadingData {
	amperes: number | null;
	isOn: boolean;
	stale: boolean;
}

export interface BatteryData {
	voltageV: number | null;
	voltagePercent: number | null;
	voltageStatus: VoltageStatus;
	voltageStale: boolean;
	current: {
		stern_port: CurrentReadingData;
		stern_star: CurrentReadingData;
		bow: CurrentReadingData;
	};
}

function clamp(value: number, min: number, max: number): number {
	return Math.max(min, Math.min(max, value));
}

export function voltageStatus(v: number | null): VoltageStatus {
	if (v === null) return "unknown";
	if (v > BATTERY_OVERVOLT_V) return "overvolt";
	if (v < BATTERY_ALARM_V) return "alarm";
	if (v < BATTERY_WARN_V) return "warning";
	return "normal";
}

function toCurrentData(
	amperes: number | null,
	timestampMs: number | null | undefined,
	now: number,
): CurrentReadingData {
	return {
		amperes,
		isOn: amperes !== null && amperes > ON_CURRENT_THRESHOLD_A,
		stale: isStale(timestampMs, now),
	};
}

/** Battery voltage/percent/status plus per-motor current draw and on/off state. */
export function useBatteryData(): BatteryData {
	useLiveTick();
	const now = Date.now();
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
		voltageStatus: voltageStatus(voltageV),
		voltageStale: isStale(battery?.timestamp_ms, now),
		current: {
			stern_port: toCurrentData(
				current.stern_port?.amperes ?? null,
				current.stern_port?.timestamp_ms,
				now,
			),
			stern_star: toCurrentData(
				current.stern_star?.amperes ?? null,
				current.stern_star?.timestamp_ms,
				now,
			),
			bow: toCurrentData(current.bow?.amperes ?? null, current.bow?.timestamp_ms, now),
		},
	};
}
