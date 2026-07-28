import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { Mock } from "vitest";
import { renderHook } from "@testing-library/react";
import { voltageStatus, useBatteryData } from "./useBatteryData.js";
import { useBridgeData } from "../context/useBridgeData.js";
import type { BridgeData } from "../context/bridgeDataReducer.js";
import { SENSOR_STALE_MS } from "../lib/thresholds.js";

vi.mock("../context/useBridgeData.js", () => ({
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
	azimuthFeedback: { port: null, starboard: null },
	rcRemote: null,
	lightBeacon: null,
	bridgeStatus: null,
	thrusterFeedback: { bow: null, port: null, starboard: null },
	lidarScan: null,
	pointCloud: null,
	radarSpoke: null,
	aisTargets: {},
	imu: null,
	activeWaypointList: null,
	missionSendStatus: null,
	missionExecutionStatus: null,
	cameraStatus: null,
	wsConnected: true,
	bridgeConnected: true,
	latencyMs: null,
};

describe("voltageStatus", () => {
	it("returns unknown for null", () => {
		expect(voltageStatus(null)).toBe("unknown");
	});

	it("returns overvolt above 16.0 V", () => {
		expect(voltageStatus(16.1)).toBe("overvolt");
	});

	it("returns alarm below 11.0 V", () => {
		expect(voltageStatus(10.9)).toBe("alarm");
	});

	it("returns warning between 11.0 and 11.5 V", () => {
		expect(voltageStatus(11.2)).toBe("warning");
	});

	it("returns normal in the safe range", () => {
		expect(voltageStatus(12.5)).toBe("normal");
	});

	it("treats exactly 11.0 V as warning, not alarm (boundary is exclusive)", () => {
		expect(voltageStatus(11.0)).toBe("warning");
	});

	it("treats exactly 11.5 V as normal, not warning (boundary is exclusive)", () => {
		expect(voltageStatus(11.5)).toBe("normal");
	});

	it("treats exactly 16.0 V as normal, not overvolt (boundary is exclusive)", () => {
		expect(voltageStatus(16.0)).toBe("normal");
	});
});

describe("useBatteryData — isOn threshold", () => {
	beforeEach(() => {
		mockUseBridgeData.mockReturnValue(base);
	});

	it("isOn is false when amperes is null", () => {
		const { result } = renderHook(() => useBatteryData());
		expect(result.current.current.stern_port.isOn).toBe(false);
	});

	it("isOn is false at exactly 0.5 A (threshold is exclusive)", () => {
		mockUseBridgeData.mockReturnValue({
			...base,
			current: {
				stern_port: {
					v: "1",
					type: "current",
					timestamp_ms: 0,
					location: "stern_port",
					raw_adc: 0,
					amperes: 0.5,
				},
				stern_star: null,
				bow: null,
			},
		});
		const { result } = renderHook(() => useBatteryData());
		expect(result.current.current.stern_port.isOn).toBe(false);
	});

	it("isOn is true above 0.5 A", () => {
		mockUseBridgeData.mockReturnValue({
			...base,
			current: {
				stern_port: {
					v: "1",
					type: "current",
					timestamp_ms: 0,
					location: "stern_port",
					raw_adc: 0,
					amperes: 0.51,
				},
				stern_star: null,
				bow: null,
			},
		});
		const { result } = renderHook(() => useBatteryData());
		expect(result.current.current.stern_port.isOn).toBe(true);
	});

	it("isOn is false below 0.5 A", () => {
		mockUseBridgeData.mockReturnValue({
			...base,
			current: {
				stern_port: {
					v: "1",
					type: "current",
					timestamp_ms: 0,
					location: "stern_port",
					raw_adc: 0,
					amperes: 0.49,
				},
				stern_star: null,
				bow: null,
			},
		});
		const { result } = renderHook(() => useBatteryData());
		expect(result.current.current.stern_port.isOn).toBe(false);
	});
});

describe("useBatteryData — staleness", () => {
	afterEach(() => {
		vi.useRealTimers();
	});

	it("is stale when no battery/current reading has ever arrived", () => {
		mockUseBridgeData.mockReturnValue(base);
		const { result } = renderHook(() => useBatteryData());
		expect(result.current.voltageStale).toBe(true);
		expect(result.current.current.stern_port.stale).toBe(true);
	});

	it("is not stale for a fresh reading, and becomes stale once the window elapses", () => {
		vi.useFakeTimers();
		vi.setSystemTime(0);
		mockUseBridgeData.mockReturnValue({
			...base,
			battery: { v: "1", type: "battery", timestamp_ms: 0, voltage_v: 12.5 },
			current: {
				stern_port: {
					v: "1",
					type: "current",
					timestamp_ms: 0,
					location: "stern_port",
					raw_adc: 0,
					amperes: 1.0,
				},
				stern_star: null,
				bow: null,
			},
		});

		const { result, rerender } = renderHook(() => useBatteryData());
		expect(result.current.voltageStale).toBe(false);
		expect(result.current.current.stern_port.stale).toBe(false);

		vi.setSystemTime(SENSOR_STALE_MS + 1);
		rerender();
		expect(result.current.voltageStale).toBe(true);
		expect(result.current.current.stern_port.stale).toBe(true);
	});
});
