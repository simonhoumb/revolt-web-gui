import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { Mock } from "vitest";
import { renderHook } from "@testing-library/react";
import { useGnssData } from "./useGnssData.js";
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
	cameraStatus: null,
	thrusterFeedback: { bow: null, port: null, starboard: null },
	lidarScan: null,
	pointCloud: null,
	radarSpoke: null,
	aisTargets: {},
	imu: null,
	activeWaypointList: null,
	missionSendStatus: null,
	missionExecutionStatus: null,
	wsConnected: true,
	bridgeConnected: true,
	latencyMs: null,
};

describe("useGnssData — staleness", () => {
	beforeEach(() => {
		vi.useFakeTimers();
		vi.setSystemTime(0);
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	it("is stale when there is no fix at all", () => {
		mockUseBridgeData.mockReturnValue(base);
		const { result } = renderHook(() => useGnssData());
		expect(result.current.stale).toBe(true);
	});

	it("is not stale for a fresh fix", () => {
		vi.setSystemTime(SENSOR_STALE_MS - 1);
		mockUseBridgeData.mockReturnValue({
			...base,
			gnssFix: {
				v: "1",
				type: "gnss_fix",
				timestamp_ms: 0,
				latitude: 59.4,
				longitude: 10.6,
				altitude_m: 0,
				fix_status: 0,
			},
		});
		const { result } = renderHook(() => useGnssData());
		expect(result.current.stale).toBe(false);
	});

	it("is stale once the fix is older than the staleness window", () => {
		vi.setSystemTime(SENSOR_STALE_MS + 1);
		mockUseBridgeData.mockReturnValue({
			...base,
			gnssFix: {
				v: "1",
				type: "gnss_fix",
				timestamp_ms: 0,
				latitude: 59.4,
				longitude: 10.6,
				altitude_m: 0,
				fix_status: 0,
			},
		});
		const { result } = renderHook(() => useGnssData());
		expect(result.current.stale).toBe(true);
	});
});
