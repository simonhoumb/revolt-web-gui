import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Mock } from "vitest";
import { renderHook } from "@testing-library/react";
import {
	temperatureStatus,
	humidityStatus,
	useEnclosureHealthData,
} from "./useEnclosureHealthData.js";
import { useBridgeData } from "../context/BridgeDataContext.js";
import type { BridgeData } from "../context/BridgeDataContext.js";

vi.mock("../context/BridgeDataContext.js", () => ({
	useBridgeData: vi.fn(),
}));

const mockUseBridgeData = useBridgeData as Mock;

const base: BridgeData = {
	battery: null,
	current: { stern_port: null, stern_star: null, bow: null },
	temperature: { stern: null, bow: null },
	humidity: { stern: null, bow: null },
	gnssFix: null,
	gnssHeading: null,
	gnssVelocity: null,
	gnssVelocityPhysical: null,
	controlMode: null,
	emergencyStop: null,
	linearActuator: null,
	bridgeStatus: null,
	thrusterFeedback: { bow: null, port: null, starboard: null },
	lidarScan: null,
	activeWaypointList: null,
	missionSendStatus: null,
	missionExecutionStatus: null,
	cameraStatus: null,
	wsConnected: true,
	bridgeConnected: true,
	latencyMs: null,
};

describe("temperatureStatus", () => {
	it("returns unknown for null", () => {
		expect(temperatureStatus(null)).toBe("unknown");
	});

	it("returns normal below the warning threshold", () => {
		expect(temperatureStatus(59.9)).toBe("normal");
	});

	it("returns warning at the 60.0°C threshold", () => {
		expect(temperatureStatus(60.0)).toBe("warning");
	});

	it("returns alarm at the firmware's 100.0°C critical_temperature_level", () => {
		expect(temperatureStatus(100.0)).toBe("alarm");
	});
});

describe("humidityStatus", () => {
	it("returns unknown for null", () => {
		expect(humidityStatus(null)).toBe("unknown");
	});

	it("returns normal below the warning threshold", () => {
		expect(humidityStatus(89.9)).toBe("normal");
	});

	it("returns warning at the 90.0% threshold", () => {
		expect(humidityStatus(90.0)).toBe("warning");
	});

	it("returns alarm at the firmware's 99.0% critical_humidity_level", () => {
		expect(humidityStatus(99.0)).toBe("alarm");
	});
});

describe("useEnclosureHealthData", () => {
	beforeEach(() => {
		mockUseBridgeData.mockReturnValue(base);
	});

	it("returns unknown status and no value when no reading has arrived", () => {
		const { result } = renderHook(() => useEnclosureHealthData());
		expect(result.current.temperature.bow.status).toBe("unknown");
		expect(result.current.temperature.bow.valueC).toBeUndefined();
		expect(result.current.humidity.stern.status).toBe("unknown");
	});

	it("surfaces emergencyStop.active and linearActuator.retracted unchanged", () => {
		mockUseBridgeData.mockReturnValue({
			...base,
			emergencyStop: { v: "1", type: "emergency_stop", timestamp_ms: 0, active: true },
			linearActuator: { v: "1", type: "linear_actuator", timestamp_ms: 0, retracted: false },
		});
		const { result } = renderHook(() => useEnclosureHealthData());
		expect(result.current.emergencyStopActive).toBe(true);
		expect(result.current.actuatorRetracted).toBe(false);
	});

	it("reports actuatorRetracted as null when no reading has arrived", () => {
		const { result } = renderHook(() => useEnclosureHealthData());
		expect(result.current.actuatorRetracted).toBeNull();
	});

	it("derives per-location temperature status from live readings", () => {
		mockUseBridgeData.mockReturnValue({
			...base,
			temperature: {
				stern: { v: "1", type: "temperature", timestamp_ms: 0, location: "stern", value_c: 45 },
				bow: { v: "1", type: "temperature", timestamp_ms: 0, location: "bow", value_c: 65 },
			},
		});
		const { result } = renderHook(() => useEnclosureHealthData());
		expect(result.current.temperature.stern.status).toBe("normal");
		expect(result.current.temperature.bow.status).toBe("warning");
	});
});
