import { useBridgeData } from "../context/useBridgeData.js";
import { useLiveTick } from "./useLiveTick.js";
import { isStale } from "../lib/staleness.js";
import { DHT22_STALE_MS } from "../lib/thresholds.js";

// Hardware/actuators/firmware/stern/src/main.cpp:79-80 and .../bow/src/main.cpp:54-55 define
// critical_temperature_level = 100.0 and critical_humidity_level = 99.0 identically on both
// boards. These feed the firmware's own emergency escalation, so they're used here as the alarm
// tier. The warning tier below has no firmware precedent; it's a GUI-only early advisory.
const TEMP_ALARM_C = 100.0;
const TEMP_WARN_C = 60.0;
const HUMIDITY_ALARM_PCT = 99.0;
const HUMIDITY_WARN_PCT = 90.0;

export type EnvStatus = "normal" | "warning" | "alarm" | "unknown";

export interface EnclosureReading {
	valueC?: number;
	valuePct?: number;
	status: EnvStatus;
	stale: boolean;
}

export interface EnclosureHealthData {
	temperature: { stern: EnclosureReading; bow: EnclosureReading };
	humidity: { stern: EnclosureReading; bow: EnclosureReading };
	emergencyStopActive: boolean;
	emergencyStopStale: boolean;
	actuatorRetracted: boolean | null;
	actuatorStale: boolean;
}

export function temperatureStatus(v: number | null): EnvStatus {
	if (v === null) return "unknown";
	if (v >= TEMP_ALARM_C) return "alarm";
	if (v >= TEMP_WARN_C) return "warning";
	return "normal";
}

export function humidityStatus(v: number | null): EnvStatus {
	if (v === null) return "unknown";
	if (v >= HUMIDITY_ALARM_PCT) return "alarm";
	if (v >= HUMIDITY_WARN_PCT) return "warning";
	return "normal";
}

/** Stern/bow temperature and humidity with status thresholds, plus e-stop and actuator state. */
export function useEnclosureHealthData(): EnclosureHealthData {
	useLiveTick();
	const now = Date.now();
	const { temperature, humidity, emergencyStop, linearActuator } = useBridgeData();

	return {
		temperature: {
			stern: {
				valueC: temperature.stern?.value_c,
				status: temperatureStatus(temperature.stern?.value_c ?? null),
				stale: isStale(temperature.stern?.timestamp_ms, now, DHT22_STALE_MS),
			},
			bow: {
				valueC: temperature.bow?.value_c,
				status: temperatureStatus(temperature.bow?.value_c ?? null),
				stale: isStale(temperature.bow?.timestamp_ms, now, DHT22_STALE_MS),
			},
		},
		humidity: {
			stern: {
				valuePct: humidity.stern?.value_pct,
				status: humidityStatus(humidity.stern?.value_pct ?? null),
				stale: isStale(humidity.stern?.timestamp_ms, now, DHT22_STALE_MS),
			},
			bow: {
				valuePct: humidity.bow?.value_pct,
				status: humidityStatus(humidity.bow?.value_pct ?? null),
				stale: isStale(humidity.bow?.timestamp_ms, now, DHT22_STALE_MS),
			},
		},
		emergencyStopActive: emergencyStop?.active ?? false,
		emergencyStopStale: isStale(emergencyStop?.timestamp_ms, now),
		actuatorRetracted: linearActuator?.retracted ?? null,
		actuatorStale: isStale(linearActuator?.timestamp_ms, now),
	};
}
