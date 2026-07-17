import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Mock } from "vitest";
import { renderHook } from "@testing-library/react";
import { useRcRemoteData } from "./useRcRemoteData.js";
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
	azimuthFeedback: { port: null, starboard: null },
	rcRemote: null,
	bridgeStatus: null,
	thrusterFeedback: { bow: null, port: null, starboard: null },
	lidarScan: null,
	radarSpoke: null,
	activeWaypointList: null,
	missionSendStatus: null,
	missionExecutionStatus: null,
	cameraStatus: null,
	wsConnected: true,
	bridgeConnected: true,
	latencyMs: null,
};

describe("useRcRemoteData", () => {
	beforeEach(() => {
		mockUseBridgeData.mockReturnValue(base);
	});

	it("returns nulls when no rc_remote message has arrived", () => {
		const { result } = renderHook(() => useRcRemoteData());
		expect(result.current.throttlePercent).toBeNull();
		expect(result.current.aileronPercent).toBeNull();
		expect(result.current.rudderPercent).toBeNull();
		expect(result.current.gear).toBeNull();
	});

	it("maps center PWM (1500) to 0%", () => {
		mockUseBridgeData.mockReturnValue({
			...base,
			rcRemote: {
				v: "1",
				type: "rc_remote",
				timestamp_ms: 0,
				throttle: 1500,
				aileron: 1500,
				rudder: 1500,
				gear: "manual",
			},
		});
		const { result } = renderHook(() => useRcRemoteData());
		expect(result.current.throttlePercent).toBe(0);
		expect(result.current.gear).toBe("manual");
	});

	it("maps max PWM (1930) to 100%, clamped", () => {
		mockUseBridgeData.mockReturnValue({
			...base,
			rcRemote: {
				v: "1",
				type: "rc_remote",
				timestamp_ms: 0,
				throttle: 1930,
				aileron: 1070,
				rudder: 1500,
				gear: "auto",
			},
		});
		const { result } = renderHook(() => useRcRemoteData());
		expect(result.current.throttlePercent).toBeCloseTo(100, 0);
		expect(result.current.aileronPercent).toBeCloseTo(-100, 0);
		expect(result.current.gear).toBe("auto");
	});
});
